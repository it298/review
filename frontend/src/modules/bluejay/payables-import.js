import {validatePayables} from '../../../../shared/bluejay-payables.js';
const text=v=>String(v??'').trim();
const header=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/\s+/g,' ');
function amount(value){if(typeof value==='number'&&Number.isSafeInteger(value))return value;const str=text(value);if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(str))throw Error('Có số tiền trống hoặc không đúng định dạng VND.');return Number(str.replaceAll('.',''));}
function date(value){if(typeof value==='number')return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);const m=text(value).match(/^(\d{2})\/(\d{2})\/(\d{4})/);if(!m)throw Error('Không đọc được ngày nhận/trả phòng.');return m[3]+'-'+m[2]+'-'+m[1];}
export function parsePayablesRows(matrix,{hotelId,capturedAt=new Date().toISOString()}={}){
 const meta=matrix.slice(0,5).flat().filter(v=>typeof v==='string').join(' '),period=meta.match(/Từ ngày (\d{2}\/\d{2}\/\d{4}).*?đến ngày (\d{2}\/\d{2}\/\d{4})/i);
 if(!period||!meta.includes('VND')||!header(meta).includes('bao cao cong no'))throw Error('Chọn file BÁO CÁO CÔNG NỢ xuất từ Bluejay, đơn vị VND.');
 const index=matrix.findIndex(r=>r.some(v=>header(v)==='channel code')&&r.some(v=>header(v)==='du no'));
 if(index<0)throw Error('Không tìm thấy các cột báo cáo công nợ.');
 const heads=matrix[index].map(header),col=(...names)=>{const i=heads.findIndex(h=>names.includes(h));if(i<0)throw Error('Thiếu cột '+names[0]);return i;};
 const columns={bookingCode:col('ma','ma dat phong'),channelCode:col('channel code'),roomType:col('loai phong'),status:col('trang thai'),source:col('nguon'),checkInDay:col('ngay nhan phong'),checkOutDay:col('ngay tra phong'),totalPrice:col('so tien','tong'),payment:col('thanh toan'),balance:col('du no'),deposit:col('dat coc','d.coc'),cityLedger:col('city ledger')};
 let reportedTotals=null;const rows=[];
 for(const r of matrix.slice(index+1)){const sumAt=r.findIndex(v=>header(v)==='tong');if(sumAt>=0){if(reportedTotals)throw Error('File có nhiều dòng tổng; cần một báo cáo Bluejay đầy đủ.');reportedTotals=Object.fromEntries(['totalPrice','payment','balance','deposit'].map((key,i)=>[key,amount(r[sumAt+i+1])]));continue;}if(!text(r[columns.bookingCode])){if(r.some(v=>v!=null&&text(v)))throw Error('File có dòng dữ liệu thiếu mã booking.');continue;}
  const row={};for(const [key,i] of Object.entries(columns)){row[key]=['totalPrice','payment','balance','deposit'].includes(key)?amount(r[i]):key.endsWith('Day')?date(r[i]):key==='cityLedger'&&!text(r[i])?null:text(r[i]);}rows.push(row);
 }
 if(!reportedTotals)throw Error('File thiếu dòng tổng để đối chiếu.');
 return validatePayables({hotelId:Number(hotelId),from:date(period[1]),to:date(period[2]),capturedAt,currency:'VND',reportedTotals,rows});
}
export async function readPayablesFile(file,hotelId){
 if(!file||file.size>2*1024*1024||!/(\.xls|\.xlsx)$/i.test(file.name))throw Error('Chọn file Excel .xls/.xlsx của Bluejay, tối đa 2 MB.');
 const XLSX=await import('@e965/xlsx'),book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
 if(book.SheetNames.length!==1)throw Error('Chọn file công nợ Bluejay gồm một sheet.');
 return parsePayablesRows(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:null}),{hotelId});
}
