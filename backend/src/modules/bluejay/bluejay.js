import {normalizeOccupancy,normalizeReservations,normalizeServices} from './normalize.js';
const DEFAULT_BASE = "https://api-pms.bluejaypms.com/api/v2/";

function baseUrl() {
  const raw = process.env.BLUEJAY_BASE_URL || DEFAULT_BASE;
  const url=new URL(raw.endsWith('/')?raw:raw+'/');
  if(url.origin!=='https://api-pms.bluejaypms.com'||url.pathname!=='/api/v2/'||url.username||url.password||url.search||url.hash)throw new Error('BLUEJAY_BASE_URL phải là địa chỉ API Blue Jay chính thức.');
  return url.href;
}

function apiKey() {
  const value = (process.env.BLUEJAY_API_KEY || "").trim();
  if (!value || value === "YOUR_API_KEY") {
    throw Object.assign(new Error("Chưa kết nối Blue Jay. Cần cấu hình khóa API trên máy chủ."),{status:503});
  }
  return value;
}

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

export async function blueJayGet(path, params = {}) {
  const url = new URL(path.replace(/^\//, ""), baseUrl());

  for (const [key, value] of Object.entries(cleanParams(params))) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      ApiKey: apiKey(),
      Accept: "application/json",
    },
    redirect:'error',signal:AbortSignal.timeout(30000),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    const error = new Error(`Blue Jay API HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    error.url = url.toString();
    throw error;
  }

  if (body && typeof body === 'object' && (body.errors || body.error)) {
    const message=String(body.errors?.message||body.error?.message||'');
    const code=message.includes('không được quá 1 tháng')?'BLUEJAY_RANGE':message.includes('khung giờ')?'BLUEJAY_WINDOW':'BLUEJAY_PROVIDER';
    throw Object.assign(new Error('Blue Jay từ chối yêu cầu API.'),{status:502,code});
  }
  if (
    body &&
    typeof body === "object" &&
    body.status &&
    String(body.status).toLowerCase() !== "success"
  ) {
    const error = new Error(body.message || `Blue Jay status: ${body.status}`);
    error.status = 502;
    error.body = body;
    error.url = url.toString();
    throw error;
  }

  // HTTP 200 can still contain a provider error or an unexpected response.
  // Validate before pagination can turn a missing collection into an empty one.
  if(path==='report-room-occupancy') normalizeOccupancy(body);
  if(path==='reservation') normalizeReservations(body);
  if(path==='extraservice-sumary') normalizeServices(body);
  return body;
}

export function occupancyPeriods(from,to) {
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  if(!valid(from)||!valid(to)||from>to)throw Error('Khoảng ngày công suất chưa hợp lệ.');
  const periods=[];let start=from;
  while(start<=to){const next=new Date(start+'T00:00:00Z');next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+1);const end=new Date(next.getTime()-86400000).toISOString().slice(0,10);periods.push({from:start,to:end<to?end:to});start=next.toISOString().slice(0,10);}
  if(periods.length>120)throw Error('Khoảng ngày công suất quá dài.');
  return periods;
}

export async function getRoomOccupancy({ hotelId, dateType = 1, from, to, roomtypeIds }) {
  const periods=String(dateType)==='1'?occupancyPeriods(from,to):[{from,to}];
  const reports=[];
  for(const period of periods)reports.push(await blueJayGet('report-room-occupancy',{hotelId,dateType,...period,roomtypeIds}));
  if(reports.length===1)return reports[0];
  // Only return a complete range. Any failed month aborts before the cache write.
  const summaries=reports.map(normalizeOccupancy),rooms=new Map();
  const rate=(used,total,blocked)=>total>blocked?Number((used/(total-blocked)*100).toFixed(2)):null;
  for(const report of summaries)for(const room of report.roomTypes){
    const key=String(room.id??room.name);
    if(!rooms.has(key))rooms.set(key,{RoomTypeId:room.id,RoomTypeName:room.name,RoomTypeTotalRoomOccupied:0,RoomTypeTotalBooked:0,RoomTypeBlocked:0,RoomTypeTotalRoom:0,RoomTypeTotalRoomEmpty:0,DailyDetails:[]});
    const r=rooms.get(key);r.RoomTypeTotalRoomOccupied+=room.occupied;r.RoomTypeTotalBooked+=room.booked;r.RoomTypeBlocked+=room.blocked;r.RoomTypeTotalRoom+=room.total;r.RoomTypeTotalRoomEmpty+=room.empty;
    r.DailyDetails.push(...room.daily.map(d=>({Date:d.date,RoomOccupied:d.occupied,Blocked:d.blocked,TotalRoom:d.total,EmptyRoom:d.empty,OccupancyRate:d.occupancyRate})));
    r.RoomTypeTotalOccupancyRate=rate(r.RoomTypeTotalRoomOccupied,r.RoomTypeTotalRoom,r.RoomTypeBlocked);
  }
  const sum=field=>summaries.reduce((n,r)=>n+r.summary[field],0);
  return {status:'success',meta:{from,to,periods,assembled:true},data:{GrandTotal:{GrandTotalRoomOccupied:sum('occupied'),GrandTotalBlocked:sum('blocked'),GrandTotalRoom:sum('total'),GrandTotalRoomEmpty:sum('empty'),GrandTotalOccupancyRate:rate(sum('occupied'),sum('total'),sum('blocked')),RoomTypes:[...rooms.values()]}}};
}

export function getReservations({
  hotelId,
  dateType = 3,
  from,
  to,
  sources,
  status,
  roomTypes,
  roomdetails,
  search,
  limit = 100,
  page = 1,
}) {
  return blueJayGet("reservation", {
    hotelId,
    dateType,
    from,
    to,
    sources,
    status,
    roomTypes,
    roomdetails,
    search,
    limit,
    page,
  });
}

function extractReservations(response) {
  return (
    response?.data?.attributes?.reservations ??
    response?.attributes?.reservations ??
    []
  );
}

export async function getAllReservations(params) {
  const first = await getReservations({ ...params, limit: 100, page: 1 });
  const rows = [...extractReservations(first)];
  const total = Number(first?.meta?.total ?? rows.length);
  const totalPages = Math.max(1, Math.ceil(total / 100));
  if(!Number.isSafeInteger(total)||total<0||totalPages>200)throw new Error('Số lượng đặt phòng chưa hợp lệ hoặc khoảng ngày quá lớn.');

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await getReservations({ ...params, limit: 100, page });
    rows.push(...extractReservations(next));
  }

  return {
    ...first,
    meta: {
      ...(first?.meta || {}),
      page: 1,
      limit: rows.length || 100,
      total,
    },
    data: {
      ...(first?.data || {}),
      type: first?.data?.type || "reservation",
      attributes: {
        ...(first?.data?.attributes || {}),
        reservations: rows,
      },
    },
  };
}

export function getServiceSummary({ hotelId, from, to, serviceType = 0 }) {
  return blueJayGet("extraservice-sumary", {
    hotelId,
    from,
    to,
    serviceType,
  });
}

export function getRoomTypes(hotelId) {
  return blueJayGet("roomtype-list", { hotelId });
}

export function getRoomDetails(hotelId, roomtypeId) {
  return blueJayGet("roomdetail-list", { hotelId, roomtypeId });
}

export function getSourceCategories(hotelId) {
  return blueJayGet("source-category", { hotelId });
}

export function getSources(hotelId, categorySource) {
  return blueJayGet("source-list", { hotelId, categorySource });
}
