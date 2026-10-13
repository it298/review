const invalid=message=>Object.assign(new Error(message),{status:400});
export function validDay(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function validatePayables(input){
 if(!input||!Number.isSafeInteger(input.hotelId)||!validDay(input.from)||!validDay(input.to)||input.from>input.to||input.currency!=='VND')throw invalid('Khách sạn, khoảng ngày hoặc đơn vị VND chưa hợp lệ.');
 if(typeof input.capturedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(input.capturedAt)||!Number.isFinite(Date.parse(input.capturedAt))||Date.parse(input.capturedAt)>Date.now()+300000)throw invalid('Thời gian ghi nhận chưa hợp lệ.');
 if(!Array.isArray(input.rows)||input.rows.length>1000)throw invalid('Báo cáo tối đa 1.000 dòng; hãy chia nhỏ khoảng ngày.');
 const fields=['bookingCode','channelCode','roomType','status','source'],money=['totalPrice','payment','balance','deposit'];
 const rows=input.rows.map(row=>{const out={};for(const key of fields){if(typeof row?.[key]!=='string'||row[key].length>200||(['bookingCode','source'].includes(key)&&!row[key].trim()))throw invalid('Mã booking hoặc nguồn chưa hợp lệ.');out[key]=row[key].trim();}for(const key of ['checkInDay','checkOutDay']){if(!validDay(row[key]))throw invalid('Ngày nhận/trả phòng chưa hợp lệ.');out[key]=row[key];}for(const key of money){if(typeof row[key]!=='number'||!Number.isSafeInteger(row[key])||Math.abs(row[key])>1e12)throw invalid('Số tiền phải có giá trị VND rõ ràng, không để trống.');out[key]=row[key];}if(row.cityLedger!==null&&typeof row.cityLedger!=='string')throw invalid('City Ledger chưa hợp lệ.');out.cityLedger=row.cityLedger==null?null:row.cityLedger.slice(0,200);return out;});
 const totals=Object.fromEntries(money.map(key=>[key,rows.reduce((sum,r)=>sum+r[key],0)]));
 for(const key of money){if(!Number.isSafeInteger(input.reportedTotals?.[key])||totals[key]!==input.reportedTotals[key])throw invalid('Tổng tiền trong file không khớp các dòng booking. Không lưu báo cáo thiếu dòng.');}
 return {version:1,hotelId:input.hotelId,from:input.from,to:input.to,currency:'VND',capturedAt:new Date(input.capturedAt).toISOString(),rows,reportedTotals:totals};
}
export function summarizePayables(report){
 const groups=new Map();for(const row of report.rows){const group=groups.get(row.source)||{source:row.source,count:0,totalPrice:0,payment:0,balance:0,deposit:0};group.count++;for(const key of ['totalPrice','payment','balance','deposit'])group[key]+=row[key];groups.set(row.source,group);}
 return {...report,totals:{count:report.rows.length,...report.reportedTotals},groups:[...groups.values()].sort((a,b)=>b.balance-a.balance)};
}
