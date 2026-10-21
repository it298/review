const fields=['roomPrice','servicePrice','totalPrice','payment','balance','deposit'];
export function revenueDay(value){
 const raw=String(value||'').trim();
 if(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)&&Number.isFinite(Date.parse(raw)))return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(raw));
 const day=raw.slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null;
}
const numeric=v=>v==null||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const sum=(rows,key)=>rows.some(r=>numeric(r[key])==null)?null:rows.reduce((s,r)=>s+numeric(r[key]),0);
export function checkoutRevenue(rows,from,to){
 const included=[],excluded=[];
 for(const row of rows){const status=String(row.status||'').trim().toLowerCase(),day=revenueDay(row.checkOutTime);
  const reason=!['đã trả phòng','check out','checked out','checkout'].includes(status)?'Chưa trả phòng / trạng thái khác':!day?'Thiếu hoặc sai ngày trả phòng':day<from||day>to?'Ngày trả ngoài kỳ':null;
  if(reason)excluded.push({...row,reason});else included.push({...row,revenueDate:day,revenue:numeric(row.roomPrice)==null||numeric(row.servicePrice)==null?null:numeric(row.roomPrice)+numeric(row.servicePrice)});
 }
 function summarize(list){return {rows:list.length,bookings:new Set(list.filter(r=>String(r.bookingCode||'').trim()).map(r=>String(r.hotelId||'')+':'+String(r.bookingCode).trim())).size,...Object.fromEntries([...fields,'revenue'].map(k=>[k,sum(list,k)]))};}
 function group(key){const groups=new Map();for(const row of included){const label=String(row[key]||'Chưa xác định');if(!groups.has(label))groups.set(label,[]);groups.get(label).push(row);}return [...groups].map(([label,list])=>({label,...summarize(list)})).sort((a,b)=>a.label.localeCompare(b.label));}
 return {rows:included,excluded,totals:summarize(included),daily:group('revenueDate'),sources:group('source'),missingAmounts:included.filter(r=>r.revenue==null).length,unknownBookings:included.filter(r=>!String(r.bookingCode||'').trim()).length,mismatches:included.filter(r=>r.revenue!=null&&numeric(r.totalPrice)!=null&&Math.abs(r.revenue-numeric(r.totalPrice))>.01).length};
}
