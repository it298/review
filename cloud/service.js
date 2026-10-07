import { randomUUID } from 'node:crypto';
import { state,mutate,lock,redis,key } from './store.js';
import { scrape } from './scrape.js';
import { mapsIdentity,validateMapsUrl } from '../backend/src/services/scraperUtils.js';
export function matrix(s){
 const places=Object.values(s.places).sort((a,b)=>a.name.localeCompare(b.name)).map(p=>({id:p.id,name:p.name,rating:p.rating,googleMapsUri:p.google_maps_uri}));
 const dates=new Map();
 for(const snap of Object.values(s.snapshots)) {
  if(!s.places[snap.place_id]) continue;
  const values=dates.get(snap.date)||{};values[snap.place_id]={reviews:snap.user_rating_count,rating:snap.rating,capturedAt:snap.captured_at};dates.set(snap.date,values);
 }
 return {places,dates:[...dates.keys()].sort(),rows:[...dates.keys()].sort().map(date=>({date,values:dates.get(date)}))};
}
export async function track(url,name){try{validateMapsUrl(url);}catch(error){throw Object.assign(error,{status:400});}const release=await lock('browser',150);if(!release) throw Object.assign(new Error('Đang lấy dữ liệu cho một địa điểm khác. Thử lại sau.'),{status:409});try{const fresh=await scrape(url);return await mutate({op:'save',identity:mapsIdentity(fresh.url),custom:name,fresh});}finally{await release();}}
export async function sync(jobId){
 const release=await lock('sync');if(!release)return {skipped:true,reason:'Đang có phiên đồng bộ chạy.'};
 try {
  let job;
  if(jobId){if(!/^[0-9a-f-]{36}$/.test(jobId))throw Object.assign(new Error('Job ID không hợp lệ.'),{status:400});job=await redis().get(key('job:'+jobId));if(!job)throw Object.assign(new Error('Phiên đồng bộ đã hết hạn. Hãy bắt đầu lại.'),{status:404});}
  else {const s=await state();job={id:randomUUID(),pending:Object.values(s.places).map(p=>p.id),total:Object.keys(s.places).length,results:[]};await redis().set(key('job:'+job.id),job,{ex:86400});}
  const started=Date.now();const batchLimit=3;let processed=0;
  while(job.pending.length && processed<batchLimit && Date.now()-started<180000){
   const id=job.pending[0];const s=await state();const p=s.places[id];
   if(!p){job.pending.shift();processed++;await redis().set(key('job:'+job.id),job,{ex:86400});continue;}
   const browserRelease=await lock('browser',150);
   if(!browserRelease)break;
   let result;
   try{const fresh=await scrape(p.google_maps_uri);const updated=await mutate({op:'save',id,identity:mapsIdentity(fresh.url),fresh});result={ok:true,placeId:id,name:updated.name};}
   catch(error){await mutate({op:'error',id,error:error.message});result={ok:false,placeId:id,name:p.name,error:error.message};}
   finally{await browserRelease();}
   job.results.push(result);job.pending.shift();processed++;await redis().set(key('job:'+job.id),job,{ex:86400});
  }
  return {skipped:false,jobId:job.id,total:job.total,workers:1,results:job.results,remaining:job.pending.length,done:job.pending.length===0};
 }finally{await release();}
}
