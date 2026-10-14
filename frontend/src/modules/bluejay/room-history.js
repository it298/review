export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const from=month+'-01', end=new Date(from+'T00:00:00Z');
  end.setUTCMonth(end.getUTCMonth()+1);
  return {from,to:new Date(end.getTime()-86400000).toISOString().slice(0,10),exclusiveEnd:end.toISOString().slice(0,10)};
}
function day(value) {
  const d=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d?d:null;
}
export function roomHistory(rows, month, room='all') {
  const range=monthRange(month);
  if(!range)return {rows:[],groups:[],invalidDates:0};
  let invalidDates=0;
  const list=rows.filter(r=>room==='all'||r.roomName===room).flatMap(r=>{
    const arrival=day(r.checkInTime),departure=day(r.checkOutTime);
    if(!arrival||!departure||departure<arrival){invalidDates++;return[];}
    const start=arrival>range.from?arrival:range.from,end=departure<range.exclusiveEnd?departure:range.exclusiveEnd;
    if(end<=start)return[];
    const status=String(r.status||'').trim().toLowerCase().replace('huỷ','hủy');
    const included=['đã xác nhận','đã nhận phòng','đã trả phòng'].includes(status);
    return [{...r,monthFrom:start,monthTo:end,overlapNights:(Date.parse(end)-Date.parse(start))/86400000,bookedNights:included?(Date.parse(end)-Date.parse(start))/86400000:0,included}];
  }).sort((a,b)=>a.monthFrom.localeCompare(b.monthFrom)||String(a.roomName).localeCompare(String(b.roomName)));
  const sources=new Map();
  for(const r of list){const source=r.source||'Chưa xác định';if(!sources.has(source))sources.set(source,[]);sources.get(source).push(r);}
  const groups=[...sources].map(([source,records])=>({source,bookings:new Set(records.map(r=>String(r.bookingCode||'').trim()).filter(Boolean)).size,roomRows:records.length,bookedNights:records.reduce((sum,r)=>sum+r.bookedNights,0),excludedRows:records.filter(r=>!r.included).length}));
  return {rows:list,groups,invalidDates};
}
