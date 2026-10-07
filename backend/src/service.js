import { randomUUID } from 'node:crypto';
import { state,mutate,lock,getValue,setValue } from './store.js';
import { readLocation,validateAccount,validateLocation } from './google.js';
export function matrix(s){
 const places=Object.values(s.places).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>({id:p.id,name:p.name,rating:p.rating,googleMapsUri:p.google_maps_uri}));
 const dates=new Map();
 for(const snap of Object.values(s.snapshots)) {
  if(!s.places[snap.place_id]) continue;
  const values=dates.get(snap.date)||{};values[snap.place_id]={reviews:snap.user_rating_count,rating:snap.rating,capturedAt:snap.captured_at};dates.set(snap.date,values);
 }
 return {places,dates:[...dates.keys()].sort(),rows:[...dates.keys()].sort().map(date=>({date,values:dates.get(date)}))};
}
export async function track(account,location,name,existingPlaceId){
 validateAccount(account);validateLocation(location);
 const fresh=await readLocation(account,location);
 return mutate({op:'save',identity:'gbp:'+location,custom:name,id:existingPlaceId,fresh});
}
export async function sync(jobId){
 const release=await lock('sync');if(!release)return {skipped:true,reason:'Đang có phiên đồng bộ chạy.'};
 try {
  let job;
  if(jobId){if(!/^[0-9a-f-]{36}$/.test(jobId))throw Object.assign(new Error('Job ID không hợp lệ.'),{status:400});job=await getValue('job:'+jobId);if(!job)throw Object.assign(new Error('Phiên đồng bộ đã hết hạn. Hãy bắt đầu lại.'),{status:404});}
  else {const s=await state();job={id:randomUUID(),pending:Object.values(s.places).map(p=>p.id),total:Object.keys(s.places).length,results:[]};await setValue('job:'+job.id,job,86400);}
  const started=Date.now();const batchLimit=10;let processed=0;
  while(job.pending.length && processed<batchLimit && Date.now()-started<180000){
   const id=job.pending[0];const s=await state();const p=s.places[id];
   if(!p){job.pending.shift();processed++;await setValue('job:'+job.id,job,86400);continue;}
   let result;
   try{if(!p.google_account || !p.google_location)throw new Error('Địa điểm cũ chưa được liên kết với Google Business Profile. Vào Địa điểm để liên kết.');const fresh=await readLocation(p.google_account,p.google_location);const updated=await mutate({op:'save',id,identity:'gbp:'+p.google_location,fresh});result={ok:true,placeId:id,name:updated.name};}
   catch(error){await mutate({op:'error',id,error:error.message});result={ok:false,placeId:id,name:p.name,error:error.message};}
   job.results.push(result);job.pending.shift();processed++;await setValue('job:'+job.id,job,86400);
  }
  return {skipped:false,jobId:job.id,total:job.total,workers:1,results:job.results,remaining:job.pending.length,done:job.pending.length===0};
 }finally{await release();}
}
