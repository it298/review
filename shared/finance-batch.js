import {isDay,validateFinanceEntry} from './finance.js';
export const FINANCE_BATCH_LIMIT=25;
export function validateFinanceBatch(p,{management=false}={}){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!isDay(p?.from)||!isDay(p?.to)||p.from>p.to)fail('Chọn khoảng ngày hợp lệ cho bảng nhập.');
 if(!Array.isArray(p.entries)||!p.entries.length||p.entries.length>FINANCE_BATCH_LIMIT)fail('Mỗi lần gửi từ 1 đến 25 dòng.');
 const ids=new Set();return p.entries.map((input,i)=>{
  let entry;try{entry=validateFinanceEntry(input);}catch(e){fail('Dòng '+(i+1)+': '+e.message);}
  if(entry.date<p.from||entry.date>p.to)fail('Dòng '+(i+1)+': ngày nằm ngoài khoảng báo cáo.');
  if(!management&&['revenue','expense'].includes(entry.kind))throw Object.assign(new Error('Chỉ quản lý ghi nhận doanh thu / chi phí phân bổ.'),{status:403});
  if(ids.has(entry.requestId))fail('Mã chống gửi lặp bị trùng trong bảng.');ids.add(entry.requestId);return entry;
 });
}
