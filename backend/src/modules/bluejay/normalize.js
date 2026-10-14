function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function assertNoProviderErrors(response) {
  if (response?.errors || response?.error) throw new Error('Blue Jay từ chối hoặc không xử lý được yêu cầu.');
}

export function isExcludedRoom(name) {
  return /^m(?:\s*[-_\u2010-\u2015]\s*|\s+)standard(?:$|[^a-z0-9])/i.test(String(name || '').trim());
}

function amount(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function sumAmount(rows, field) {
  return rows.some(r => r[field] === null) ? null : rows.reduce((sum, r) => sum + r[field], 0);
}

export function grandFrom(response) {
  return (
    response?.data?.GrandTotal ??
    response?.GrandTotal ??
    response?.data?.data?.GrandTotal ??
    null
  );
}

export function normalizeOccupancy(response) {
  assertNoProviderErrors(response);
  const grand = grandFrom(response);
  if(!grand)throw new Error('Blue Jay chưa trả về báo cáo công suất hợp lệ.');
  const roomTypes = (grand.RoomTypes || []).map((room) => ({
    id: room.RoomTypeId,
    name: room.RoomTypeName,
    occupied: n(room.RoomTypeTotalRoomOccupied ?? room.RoomTypeRoomOccupied),
    booked: n(room.RoomTypeTotalBooked),
    blocked: n(
      room.RoomTypeBlocked ??
      (room.DailyDetails || []).reduce((sum, d) => sum + n(d.Blocked), 0)
    ),
    total: n(room.RoomTypeTotalRoom),
    empty: n(room.RoomTypeTotalRoomEmpty ?? room.RoomTypeRoomEmpty),
    occupancyRate: n(room.RoomTypeTotalOccupancyRate ?? room.RoomTypeOccupancyRate),
    daily: (room.DailyDetails || []).map((day) => ({
      date: day.Date,
      occupied: n(day.RoomOccupied),
      blocked: n(day.Blocked),
      total: n(day.TotalRoom),
      empty: n(day.EmptyRoom ?? day.RoomEmpty),
      occupancyRate: n(day.OccupancyRate),
    })),
  }));

  const summary = {
      occupied: n(grand.GrandTotalRoomOccupied),
      blocked: n(grand.GrandTotalBlocked),
      total: n(grand.GrandTotalRoom),
      empty: n(grand.GrandTotalRoomEmpty),
      occupancyRate: n(grand.GrandTotalOccupancyRate),
  };
  // Apply on every read, including old cached reports, without changing source data.
  const excluded = roomTypes.filter(room => isExcludedRoom(room.name));
  if (excluded.length) {
    for (const field of ['occupied', 'blocked', 'total', 'empty']) {
      summary[field] = Math.max(0, summary[field] - excluded.reduce((sum, room) => sum + room[field], 0));
    }
    const available = summary.total - summary.blocked;
    summary.occupancyRate = available > 0 ? Number((summary.occupied / available * 100).toFixed(2)) : null;
  }
  return {
    summary,
    roomTypes: roomTypes.filter(room => !excluded.includes(room)),
  };
}

export function reservationsFrom(response) {
  return (
    response?.data?.attributes?.reservations ??
    response?.attributes?.reservations ??
    []
  );
}

export function normalizeReservations(response) {
  assertNoProviderErrors(response);
  const supplied = response?.data?.attributes?.reservations ?? response?.attributes?.reservations;
  if (!Array.isArray(supplied)) throw new Error('Blue Jay chưa trả về danh sách đặt phòng hợp lệ.');
  const seen = new Set();
  const rows = reservationsFrom(response).filter(r => {
    if (isExcludedRoom(r.roomType)) return false;
    const key = JSON.stringify(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((r) => ({
    bookingCode: r.bookingCode ?? "",
    referenceCode: r.referenceCode ?? "",
    guestName: r.guestName ?? "",
    roomType: r.roomType ?? "",
    roomName: r.roomName ?? "",
    source: r.source ?? "",
    status: r.status ?? "",
    bookDate: r.bookDate ?? "",
    checkInTime: r.checkInTime ?? "",
    checkOutTime: r.checkOutTime ?? "",
    night: n(r.night),
    roomPrice: amount(r.roomPrice),
    servicePrice: amount(r.servicePrice),
    totalPrice: amount(r.totalPrice),
    payment: amount(r.payment),
    balance: amount(r.balance),
    deposit: amount(r.deposit),
  }));

  return {
    rows,
    totals: {
      count: new Set(rows.map(r => String(r.bookingCode).trim()).filter(Boolean)).size,
      roomRows: rows.length,
      unknownBookingRows: rows.filter(r => !String(r.bookingCode).trim()).length,
      roomPrice: sumAmount(rows, 'roomPrice'),
      servicePrice: sumAmount(rows, 'servicePrice'),
      totalPrice: sumAmount(rows, 'totalPrice'),
      payment: sumAmount(rows, 'payment'),
      balance: sumAmount(rows, 'balance'),
      deposit: sumAmount(rows, 'deposit'),
    },
  };
}

export function normalizeServices(response) {
  assertNoProviderErrors(response);
  if (!Array.isArray(response?.data) && !Array.isArray(response)) throw new Error('Blue Jay chưa trả về báo cáo dịch vụ hợp lệ.');
  const list = Array.isArray(response?.data)
    ? response.data
    : Array.isArray(response)
      ? response
      : [];

  const groups = list.map((g) => ({
    group: g.GroupService ?? "",
    quantity: n(g.TotalQuantity),
    totalPrice: n(g.TotalPriceSale),
    services: (g.Service || []).map((s) => ({
      id: s.ServiceId,
      name: s.ServiceName ?? "",
      unit: s.UnitsName ?? "",
      quantity: n(s.Quantity),
      price: n(s.PriceSale),
    })),
  }));

  return {
    groups,
    totals: {
      quantity: groups.reduce((s, g) => s + g.quantity, 0),
      totalPrice: groups.reduce((s, g) => s + g.totalPrice, 0),
    },
  };
}
