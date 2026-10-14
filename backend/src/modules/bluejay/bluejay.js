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
    throw Object.assign(new Error('Blue Jay từ chối yêu cầu API.'),{status:502});
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

export function getRoomOccupancy({ hotelId, dateType = 1, from, to, roomtypeIds }) {
  return blueJayGet("report-room-occupancy", {
    hotelId,
    dateType,
    from,
    to,
    roomtypeIds,
  });
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
