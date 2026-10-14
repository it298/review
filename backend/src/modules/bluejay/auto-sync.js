import {HOTELS} from './hotels.js';
import {apiWindowStatus} from './date-utils.js';
import {syncMany} from './sync.js';
import {getValue,setValue,lock} from '../../store.js';

// One hotel per call bounds execution time; repeat calls finish the current slot.
export async function autoSyncBluejay({now=new Date(),enabled=process.env.BLUEJAY_AUTO_SYNC==='true',window=apiWindowStatus,get=getValue,set=setValue,acquire=lock,run=syncMany}={}){
  if(!enabled)return {skipped:true,reason:'disabled'};
  const time=window(now);if(!time.allowed)return {skipped:true,reason:'outside_window'};
  const slot=time.localDate+':'+time.label,key='bluejay:auto-sync';
  const release=await acquire('bluejay:auto-sync',280);if(!release)return {skipped:true,reason:'busy'};
  try{
    const previous=await get(key),progress=previous?.slot===slot?previous:{slot,done:[],startedAt:now.toISOString()};
    const hotel=HOTELS.find(h=>!progress.done.includes(h.id));
    if(!hotel)return {skipped:true,reason:'slot_complete',slot};
    const results=await run({hotelIds:[hotel.id],datasets:['occupancy','reservations'],from:time.localDate,to:time.localDate,dateType:'1',reservationDateType:'3'});
    const ok=results.length===2&&results.every(r=>r.ok);
    if(ok)progress.done.push(hotel.id);
    await set(key,{...progress,lastAttemptAt:now.toISOString(),lastHotelId:hotel.id,lastOk:ok},604800);
    return {slot,hotelId:hotel.id,ok,completedHotels:progress.done.length,totalHotels:HOTELS.length,results};
  }finally{await release();}
}
