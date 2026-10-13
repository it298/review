import express from "express";
import { HOTELS, findHotel } from "./hotels.js";
import {
  getRoomOccupancy,
  getAllReservations,
  getServiceSummary,
  getRoomTypes,
  getRoomDetails,
  getSourceCategories,
  getSources,
} from "./bluejay.js";
import {
  getRecord,
  putRecord,
  getSyncLog,
  storeStats,
} from "./store.js";
import {
  normalizeOccupancy,
  normalizeReservations,
  normalizeServices,
} from "./normalize.js";
import { apiWindowStatus, normalizeMonth } from "./date-utils.js";
import { syncMany } from "./sync.js";

export function createBluejayRouter(){
const app = express.Router();
app.use((req,res,next)=>{
 const values=req.method==='POST'?req.body||{}:req.query;
 const {from,to}=values;
 if(from!==undefined||to!==undefined){
  const month=String(values.dateType)==='2'&&(req.path==='/dashboard'||req.path.endsWith('/occupancy')||req.path==='/sync');
  const valid=value=>typeof value==='string'&&(month?/^\d{4}-(?:0?[1-9]|1[0-2])$/.test(value):/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(new Date(value))&&new Date(value).toISOString().slice(0,10)===value);
  if(!valid(from)||!valid(to)||new Date(month?from+'-01':from)>new Date(month?to+'-01':to))return res.status(400).json({error:'Chọn khoảng ngày hợp lệ; ngày bắt đầu không sau ngày kết thúc.'});
 }
 if(values.dateType!==undefined&&!['0','1','2','3'].includes(String(values.dateType)))return res.status(400).json({error:'Loại ngày chưa hợp lệ.'});
 if(req.method==='POST'&&req.path==='/sync'){
  if(!Array.isArray(values.hotelIds)||!values.hotelIds.length||values.hotelIds.length>HOTELS.length||new Set(values.hotelIds.map(String)).size!==values.hotelIds.length||values.hotelIds.some(id=>!findHotel(id))||!Array.isArray(values.datasets)||!values.datasets.length||values.datasets.length>3||new Set(values.datasets).size!==values.datasets.length||values.datasets.some(v=>!['occupancy','reservations','services'].includes(v)))return res.status(400).json({error:'Chọn khách sạn và loại báo cáo đã cấu hình.'});
 }
 next();
});

function apiError(res, error, fallbackMessage) {
  res.status(error?.status===503?503:502).json({
    message: fallbackMessage,
    error: fallbackMessage,
  });
}

function hotelOr404(req, res) {
  const hotel = findHotel(req.params.hotelId);
  if (!hotel) {
    res.status(404).json({ message: "hotelId chưa có trong cấu hình." });
    return null;
  }
  return hotel;
}

function bool(value) {
  return ["1", "true", "yes"].includes(String(value || "").toLowerCase());
}

async function loadOrRefresh({
  type,
  hotel,
  params,
  refresh,
  fetchLive,
  normalize,
}) {
  const cached = await getRecord(type, hotel.id, params);

  if (!refresh && cached) {
    return {
      ok: true,
      source: "cache",
      savedAt: cached.savedAt,
      hotel,
      data: normalize(cached.value),
    };
  }

  try {
    const raw = await fetchLive();
    const saved = await putRecord(type, hotel.id, params, raw, "live");
    return {
      ok: true,
      source: "live",
      savedAt: saved.savedAt,
      hotel,
      data: normalize(raw),
    };
  } catch (error) {
    if (cached) {
      return {
        ok: true,
        source: "cache",
        savedAt: cached.savedAt,
        hotel,
        warning: 'Blue Jay chưa trả dữ liệu mới; đang hiển thị bản đã lưu.',
        data: normalize(cached.value),
      };
    }
    throw error;
  }
}

app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    apiWindow: apiWindowStatus(),
    store: await storeStats(),
  });
});

app.get("/status", async (req, res) => {
  res.json({
    apiWindow: apiWindowStatus(),
    store: await storeStats(),
    syncLog: await getSyncLog(30),
    autoSync: false,
    configured: Boolean(process.env.BLUEJAY_API_KEY && process.env.BLUEJAY_API_KEY !== "YOUR_API_KEY"),
  });
});

app.get("/hotels", (req, res) => {
  res.json(HOTELS);
});

app.get("/dashboard", async (req, res) => {
  let { from, to, dateType = "1", refresh = "0" } = req.query;
  if (!from || !to) {
    return res.status(400).json({ message: "Cần from và to." });
  }

  if (String(dateType) === "2") {
    from = normalizeMonth(from);
    to = normalizeMonth(to);
  }

  const rows = await Promise.all(
    HOTELS.map(async (hotel) => {
      const params = { dateType: String(dateType), from, to };
      try {
        return await loadOrRefresh({
          type: "occupancy",
          hotel,
          params,
          refresh: bool(refresh),
          fetchLive: () =>
            getRoomOccupancy({
              hotelId: hotel.id,
              dateType,
              from,
              to,
            }),
          normalize: normalizeOccupancy,
        });
      } catch (error) {
        return {
          ok: false,
          hotel,
          error: 'Chưa lấy được công suất khách sạn này.',
        };
      }
    })
  );

  const summaries = rows
    .filter((r) => r.ok)
    .map((r) => r.data.summary);

  const occupied = summaries.reduce((s, x) => s + x.occupied, 0);
  const total = summaries.reduce((s, x) => s + x.total, 0);
  const blocked = summaries.reduce((s, x) => s + x.blocked, 0);
  const empty = summaries.reduce((s, x) => s + x.empty, 0);

  res.json({
    meta: {
      from,
      to,
      dateType: String(dateType),
      generatedAt: new Date().toISOString(),
      apiWindow: apiWindowStatus(),
    },
    aggregate: {
      occupied:summaries.length?occupied:null,
      blocked:summaries.length?blocked:null,
      total:summaries.length?total:null,
      empty:summaries.length?empty:null,
      availableHotels:summaries.length,
      complete:summaries.length===HOTELS.length,
      occupancyRate: summaries.length&&total ? Number(((occupied / total) * 100).toFixed(2)) : null,
    },
    hotels: rows,
  });
});

app.get("/hotels/:hotelId/occupancy", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;

  let { from, to, dateType = "1", refresh = "0", roomtypeIds } = req.query;
  if (!from || !to) return res.status(400).json({ message: "Cần from và to." });

  if (String(dateType) === "2") {
    from = normalizeMonth(from);
    to = normalizeMonth(to);
  }

  const params = {
    dateType: String(dateType),
    from,
    to,
    ...(roomtypeIds ? { roomtypeIds } : {}),
  };

  try {
    const payload = await loadOrRefresh({
      type: "occupancy",
      hotel,
      params,
      refresh: bool(refresh),
      fetchLive: () =>
        getRoomOccupancy({
          hotelId: hotel.id,
          dateType,
          from,
          to,
          roomtypeIds,
        }),
      normalize: normalizeOccupancy,
    });
    res.json(payload);
  } catch (error) {
    apiError(res, error, "Không lấy được báo cáo công suất từ Blue Jay.");
  }
});

app.get("/hotels/:hotelId/reservations", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;

  const {
    from,
    to,
    dateType = "3",
    refresh = "0",
    sources,
    status,
    roomTypes,
    roomdetails,
    search,
  } = req.query;

  if (!from || !to) return res.status(400).json({ message: "Cần from và to." });

  const params = {
    dateType: String(dateType),
    from,
    to,
    ...(sources ? { sources } : {}),
    ...(status ? { status } : {}),
    ...(roomTypes ? { roomTypes } : {}),
    ...(roomdetails ? { roomdetails } : {}),
    ...(search ? { search } : {}),
  };

  try {
    const payload = await loadOrRefresh({
      type: "reservations",
      hotel,
      params,
      refresh: bool(refresh),
      fetchLive: () =>
        getAllReservations({
          hotelId: hotel.id,
          dateType,
          from,
          to,
          sources,
          status,
          roomTypes,
          roomdetails,
          search,
        }),
      normalize: normalizeReservations,
    });
    res.json(payload);
  } catch (error) {
    apiError(res, error, "Không lấy được Reservation từ Blue Jay.");
  }
});

app.get("/hotels/:hotelId/services", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;

  const { from, to, serviceType = "0", refresh = "0" } = req.query;
  if (!from || !to) return res.status(400).json({ message: "Cần from và to." });

  const params = { from, to, serviceType: String(serviceType) };

  try {
    const payload = await loadOrRefresh({
      type: "services",
      hotel,
      params,
      refresh: bool(refresh),
      fetchLive: () =>
        getServiceSummary({
          hotelId: hotel.id,
          from,
          to,
          serviceType,
        }),
      normalize: normalizeServices,
    });
    res.json(payload);
  } catch (error) {
    apiError(res, error, "Không lấy được Service Summary từ Blue Jay.");
  }
});

app.post("/sync", async (req, res) => {
  const {
    hotelIds = HOTELS.map((h) => h.id),
    datasets = ["occupancy", "reservations", "services"],
    from,
    to,
    dateType = "1",
    reservationDateType = "3",
    serviceType = "0",
  } = req.body || {};

  if (!from || !to) {
    return res.status(400).json({ message: "Cần from và to." });
  }

  const results = await syncMany({
    hotelIds,
    datasets,
    from,
    to,
    dateType,
    reservationDateType,
    serviceType,
  });

  res.json({
    apiWindow: apiWindowStatus(),
    ok: results.every((r) => r.ok),
    results,
  });
});

app.get("/hotels/:hotelId/roomtypes", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;
  try {
    res.json({ hotel, data: await getRoomTypes(hotel.id) });
  } catch (error) {
    apiError(res, error, "Không lấy được danh sách hạng phòng.");
  }
});

app.get("/hotels/:hotelId/roomdetails", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;
  try {
    res.json({ hotel, data: await getRoomDetails(hotel.id, req.query.roomtypeId) });
  } catch (error) {
    apiError(res, error, "Không lấy được danh sách phòng vật lý.");
  }
});

app.get("/hotels/:hotelId/source-categories", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;
  try {
    res.json({ hotel, data: await getSourceCategories(hotel.id) });
  } catch (error) {
    apiError(res, error, "Không lấy được danh mục nguồn.");
  }
});

app.get("/hotels/:hotelId/sources", async (req, res) => {
  const hotel = hotelOr404(req, res);
  if (!hotel) return;
  try {
    res.json({ hotel, data: await getSources(hotel.id, req.query.categorySource) });
  } catch (error) {
    apiError(res, error, "Không lấy được danh sách nguồn.");
  }
});

return app;
}
