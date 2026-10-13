function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
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

  return {
    summary: {
      occupied: n(grand.GrandTotalRoomOccupied),
      blocked: n(grand.GrandTotalBlocked),
      total: n(grand.GrandTotalRoom),
      empty: n(grand.GrandTotalRoomEmpty),
      occupancyRate: n(grand.GrandTotalOccupancyRate),
    },
    roomTypes,
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
  const rows = reservationsFrom(response).map((r) => ({
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
    roomPrice: n(r.roomPrice),
    servicePrice: n(r.servicePrice),
    totalPrice: n(r.totalPrice),
    payment: n(r.payment),
    balance: n(r.balance),
    deposit: n(r.deposit),
  }));

  return {
    rows,
    totals: {
      count: rows.length,
      roomPrice: rows.reduce((s, r) => s + r.roomPrice, 0),
      servicePrice: rows.reduce((s, r) => s + r.servicePrice, 0),
      totalPrice: rows.reduce((s, r) => s + r.totalPrice, 0),
      payment: rows.reduce((s, r) => s + r.payment, 0),
      balance: rows.reduce((s, r) => s + r.balance, 0),
    },
  };
}

export function normalizeServices(response) {
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
