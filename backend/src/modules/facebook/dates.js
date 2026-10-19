import {calendarDate} from '../../utils/date.js';
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const isDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export const shiftDate=(day,n)=>new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);
// Graph API uses an exclusive until; dashboard read filters are inclusive.
export function syncRange(since,until,now=new Date()){
 const today=calendarDate(now);since??=shiftDate(today,-3);until??=today;
 if(!isDate(since)||!isDate(until)||since>=until||until>shiftDate(today,1)||(Date.parse(until)-Date.parse(since))/86400000>366)throw fail('Chọn since < until, tối đa 366 ngày; until là ngày kết thúc không bao gồm.');
 return {since,until};
}
export function readRange(from,to,now=new Date()){
 const today=calendarDate(now);from??=shiftDate(today,-29);to??=today;
 if(!isDate(from)||!isDate(to)||from>to||to>today||(Date.parse(to)-Date.parse(from))/86400000>365)throw fail('Chọn khoảng ngày hợp lệ, tối đa 366 ngày và không vượt hôm nay.');
 return {from,to};
}
