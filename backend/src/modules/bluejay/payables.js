import {getValue} from '../../store.js';
import {getRecord,putRecord,appendSyncLog} from './store.js';
import {HOTELS,findHotel} from './hotels.js';
import {validatePayables,summarizePayables} from '../../../../shared/bluejay-payables.js';
export async function importPayables(input){
 const report=validatePayables(input),hotel=findHotel(report.hotelId);if(!hotel)throw Object.assign(new Error('Khách sạn chưa được cấu hình.'),{status:400});
 const params={from:report.from,to:report.to};
 await putRecord('payables-history',hotel.id,{...params,capturedAt:report.capturedAt},report,'bluejay_report');
 const record=await putRecord('payables',hotel.id,params,report,'bluejay_report');
 await appendSyncLog({ok:true,hotelId:hotel.id,hotelName:hotel.name,dataset:'payables',params});
 return {ok:true,hotel,savedAt:record.savedAt,data:summarizePayables(report)};
}
export async function payablesForRange({hotelId,from,to}){
 const selected=hotelId==='all'?HOTELS:[findHotel(hotelId)];if(selected.some(h=>!h))throw Object.assign(new Error('Khách sạn chưa được cấu hình.'),{status:400});
 const hotels=await Promise.all(selected.map(async hotel=>{const record=await getRecord('payables',hotel.id,{from,to});return {hotel,savedAt:record?.savedAt||null,data:record?summarizePayables(record.value):null};}));
 return {from,to,currency:'VND',hotels,availableHotels:hotels.filter(h=>h.data).length};
}
export async function payablesHistory(hotelId){
 if(hotelId!=='all'&&!findHotel(hotelId))throw Object.assign(new Error('Khách sạn chưa được cấu hình.'),{status:400});
 const index=await getValue('bluejay:index')||{};const keys=Object.entries(index).filter(([,r])=>r.type==='payables-history'&&(hotelId==='all'||String(r.hotelId)===String(hotelId))).sort((a,b)=>b[1].savedAt.localeCompare(a[1].savedAt)).slice(0,20);
 return (await Promise.all(keys.map(async([key])=>getValue(key)))).filter(Boolean).map(r=>({hotel:findHotel(r.hotelId),from:r.value.from,to:r.value.to,capturedAt:r.value.capturedAt,savedAt:r.savedAt,count:r.value.rows.length,balance:r.value.reportedTotals.balance}));
}
