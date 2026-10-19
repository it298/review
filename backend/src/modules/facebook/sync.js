import {calendarDate} from '../../utils/date.js';
import {rpc,lock} from '../../store.js';
import {createMetaService,METRICS} from './meta-service.js';
import {FACEBOOK_HOTELS} from './hotels.js';
import {fail,syncRange,shiftDate} from './dates.js';
const count=value=>value===null||value===undefined?null:Number.isSafeInteger(value)&&value>=0?value:(()=>{throw fail('Meta trả số liệu không hợp lệ.',502);})();
export function normalizeInsights(groups,hotel,since,until){
 const rows=new Map();
 for(const group of groups){
  const field=METRICS[group.name];if(!field)continue;
  if(group.period!=='day'||!Array.isArray(group.values))throw fail('Meta trả bucket chưa được hỗ trợ.',502);
  for(const point of group.values){
   if(typeof point.end_time!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(point.end_time)||!Number.isFinite(Date.parse(point.end_time)))throw fail('Meta trả thời gian bucket không hợp lệ.',502);
   const end=new Date(point.end_time),metric_date=calendarDate(new Date(end.getTime()-86400000));
   if(metric_date<since||metric_date>=until)continue;
   const bucket_end_time=end.toISOString(),row=rows.get(metric_date)||{...hotel,metric_date,bucket_end_time,post_engagements:null,media_views:null,unique_viewers:null};
   if(row.bucket_end_time!==bucket_end_time)throw fail('Meta trả các bucket khác nhau trong cùng ngày.',502);
   const value=count(point.value);
   if(row[field]!==null&&row[field]!==value)throw fail('Meta trả chỉ số trùng có giá trị khác nhau.',502);
   row[field]=value;rows.set(metric_date,row);
  }
 }
 return [...rows.values()].sort((a,b)=>a.metric_date.localeCompare(b.metric_date));
}
export async function syncFacebookHotel(hotel,{meta,pages,since,until,now=new Date(),save=p=>rpc('review_tracker_facebook_upsert',{p})}){
 const pageToken=meta.getPageAccessToken(hotel.page_id,pages);
 const summary=await meta.getPageSummary(hotel.page_id,pageToken);
 if(summary.id!==hotel.page_id)throw fail('Meta trả sai Page được yêu cầu.',502);
 const days=[];
 // Bounded windows avoid Meta's per-request date range limits.
 for(let start=since;start<until;){const end=shiftDate(start,30)<until?shiftDate(start,30):until;days.push(...normalizeInsights(await meta.getPageInsights(hotel.page_id,pageToken,start,end),hotel,start,end));start=end;}
 const snapshot={...hotel,snapshot_date:calendarDate(now),followers_count:count(summary.followers_count),fan_count:count(summary.fan_count)};
 if(snapshot.followers_count===null&&snapshot.fan_count===null)throw fail('Meta chưa trả follower hoặc Page Likes.',502);
 await save({hotel,days,snapshot});
 return {...hotel,ok:true,days:days.length,snapshot_date:snapshot.snapshot_date,...(!days.length?{notice:'Meta chưa trả chỉ số ngày; đã lưu follower snapshot, giữ nguyên lịch sử cũ.'}:{})};
}
export async function syncAllFacebookHotels({since,until,now=new Date(),meta=createMetaService(),save,acquire=lock}={}){
 const range=syncRange(since,until,now),release=await acquire('facebook:sync',1800);
 if(!release)return {skipped:true,reason:'busy'};
 try{
  // One account listing per run, shared by all four Pages (including pagination).
  const pages=await meta.getManagedPages();
  const settled=await Promise.allSettled(FACEBOOK_HOTELS.map(hotel=>syncFacebookHotel(hotel,{meta,pages,...range,now,save})));
  const results=settled.map((item,i)=>item.status==='fulfilled'?item.value:{...FACEBOOK_HOTELS[i],ok:false,error:item.reason?.status?item.reason.message:'Chưa lưu được dữ liệu Facebook vào Supabase. Kiểm tra migration và kết nối database.'});
  return {...range,results,ok:results.every(r=>r.ok)};
 }finally{await release();}
}
