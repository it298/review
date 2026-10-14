export function summarizeBookings(rows) {
  const code = r => String(r.bookingCode ?? '').trim();
  const count = list => new Set(list.map(code).filter(Boolean)).size;
  const sum = (list, field) => list.some(r => r[field] == null || r[field] === '' || !Number.isFinite(Number(r[field]))) ? null : list.reduce((n, r) => n + Number(r[field]), 0);
  const group = field => {
    const buckets = new Map();
    for (const row of rows) {
      const label = String(row[field] || 'Chưa xác định').trim().replace('huỷ', 'hủy');
      if (!buckets.has(label)) buckets.set(label, []);
      buckets.get(label).push(row);
    }
    return [...buckets].map(([label, list]) => ({label, bookings: count(list), roomRows: list.length, roomPrice: sum(list, 'roomPrice')})).sort((a,b) => b.roomRows - a.roomRows || a.label.localeCompare(b.label));
  };
  return {
    bookings: count(rows), roomRows: rows.length,
    unknownBookingRows: rows.filter(r => !code(r)).length,
    sources: group('source'), statuses: group('status'),
    totals: Object.fromEntries(['roomPrice','servicePrice','totalPrice','payment','balance','deposit'].map(field => [field,sum(rows,field)])),
  };
}
