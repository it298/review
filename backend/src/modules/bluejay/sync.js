import { HOTELS, findHotel } from "./hotels.js";
import {
  getRoomOccupancy,
  getAllReservations,
  getServiceSummary,
} from "./bluejay.js";
import { putRecord, appendSyncLog } from "./store.js";
import { normalizeMonth, todayLocal } from "./date-utils.js";

export async function syncDataset({
  hotelId,
  dataset,
  from,
  to,
  dateType = "1",
  reservationDateType = "3",
  serviceType = "0",
}) {
  const hotel = findHotel(hotelId);
  if (!hotel) throw new Error(`HotelId ${hotelId} chưa được cấu hình.`);

  let params;
  let raw;
  if(dataset!=='occupancy'&&/^\d{4}-\d{2}$/.test(from)&&/^\d{4}-\d{2}$/.test(to)){
    from+='-01';const last=new Date(to+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);to=last.toISOString().slice(0,10);
  }

  if (dataset === "occupancy") {
    const occFrom = String(dateType) === "2" ? normalizeMonth(from) : from;
    const occTo = String(dateType) === "2" ? normalizeMonth(to) : to;
    params = { dateType: String(dateType), from: occFrom, to: occTo };
    raw = await getRoomOccupancy({
      hotelId: hotel.id,
      dateType,
      from: occFrom,
      to: occTo,
    });
  } else if (dataset === "reservations") {
    params = {
      dateType: String(reservationDateType),
      from,
      to,
    };
    raw = await getAllReservations({
      hotelId: hotel.id,
      dateType: reservationDateType,
      from,
      to,
    });
  } else if (dataset === "services") {
    params = { from, to, serviceType: String(serviceType) };
    raw = await getServiceSummary({
      hotelId: hotel.id,
      from,
      to,
      serviceType,
    });
  } else {
    throw new Error(`Dataset không hỗ trợ: ${dataset}`);
  }

  const record = await putRecord(dataset, hotel.id, params, raw, "live");
  await appendSyncLog({
    ok: true,
    hotelId: hotel.id,
    hotelName: hotel.name,
    dataset,
    params,
  });

  return record;
}

export async function syncMany({
  hotelIds = HOTELS.map((h) => h.id),
  datasets = ["occupancy", "reservations", "services"],
  from,
  to,
  dateType = "1",
  reservationDateType = "3",
  serviceType = "0",
}) {
  const results = [];

  for (const hotelId of hotelIds) {
    for (const dataset of datasets) {
      try {
        const record = await syncDataset({
          hotelId,
          dataset,
          from,
          to,
          dateType,
          reservationDateType,
          serviceType,
        });

        results.push({
          ok: true,
          hotelId: Number(hotelId),
          dataset,
          savedAt: record.savedAt,
        });
      } catch (error) {
        const hotel = findHotel(hotelId);
        const detail = 'Không đọc được dữ liệu Blue Jay. Kiểm tra kết nối và khung giờ API.';

        await appendSyncLog({
          ok: false,
          hotelId: Number(hotelId),
          hotelName: hotel?.name,
          dataset,
          detail,
        });

        results.push({
          ok: false,
          hotelId: Number(hotelId),
          dataset,
          error: detail,
        });
      }
    }
  }

  return results;
}

export async function syncTodayAll() {
  const today = todayLocal();
  return syncMany({
    from: today,
    to: today,
    dateType: "1",
    reservationDateType: "3",
    serviceType: "0",
  });
}
