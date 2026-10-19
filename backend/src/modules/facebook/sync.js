import {calendarDate} from '../../utils/date.js';
import {rpc,lock} from '../../store.js';
import {createMetaService,METRICS,EXTRA_METRICS} from './meta-service.js';
import {FACEBOOK_HOTELS} from './hotels.js';
import {fail,syncRange,shiftDate} from './dates.js';
const count=value=>value===null||value===undefined?null:Number.isSafeInteger(value)&&value>=0?value:(()=>{throw fail('Meta trả số liệu không hợp lệ.',502);})();
export function normalizeInsights(groups,hotel,since,until,metrics=METRICS){
 const rows=new Map();
 for(const group of groups){
  const field=metrics[group.name];if(!field)continue;
  if(group.period!=='day'||!Array.isArray(group.values))throw fail('Meta trả bucket chưa được hỗ trợ.',502);
  for(const point of group.values){
   if(typeof point.end_time!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(point.end_time)||!Number.isFinite(Date.parse(point.end_time)))throw fail('Meta trả thời gian bucket không hợp lệ.',502);
   const end=new Date(point.end_time),metric_date=calendarDate(new Date(end.getTime()-86400000));
   if(metric_date<since||metric_date>=until)continue;
   const bucket_end_time=end.toISOString(),row=rows.get(metric_date)||{...hotel,metric_date,bucket_end_time,post_engagements:null,media_views:null,unique_viewers:null};
   if(row.bucket_end_time!==bucket_end_time)throw fail('Meta trả các bucket khác nhau trong cùng ngày.',502);
   const value=count(point.value);
   if(row[field]!=null&&row[field]!==value)throw fail('Meta trả chỉ số trùng có giá trị khác nhau.',502);
   row[field]=value;rows.set(metric_date,row);
  }
 }
 return [...rows.values()].sort((a,b)=>a.metric_date.localeCompare(b.metric_date));
}
export function normalizePublishedPosts(posts,since,until){
 const dates=new Map();for(let day=since;day<until;day=shiftDate(day,1))dates.set(day,0);
 const seen=new Set();for(const post of posts){
  if(typeof post.id!=='string'||typeof post.created_time!=='string'||!Number.isFinite(Date.parse(post.created_time)))throw fail('Meta trả bài đăng không có ngày hợp lệ.',502);
  if(seen.has(post.id))continue;seen.add(post.id);const date=calendarDate(post.created_time);if(dates.has(date))dates.set(date,dates.get(date)+1);
 }return [...dates].map(([post_date,published_posts])=>({post_date,published_posts}));
}
export async function syncFacebookHotel(hotel,{meta,pages,since,until,now=new Date(),save=p=>rpc('review_tracker_facebook_upsert',{p})}){
 const pageToken=meta.getPageAccessToken(hotel.page_id,pages);
 const summary=await meta.getPageSummary(hotel.page_id,pageToken);
 if(summary.id!==hotel.page_id)throw fail('Meta trả sai Page được yêu cầu.',502);
 const days=[],warnings=[],extraDays=new Map();
 // Bounded windows avoid Meta's per-request date range limits.
 for(let start=since;start<until;){const end=shiftDate(start,30)<until?shiftDate(start,30):until;days.push(...normalizeInsights(await meta.getPageInsights(hotel.page_id,pageToken,start,end),hotel,start,end));start=end;}
 if(meta.getAdditionalInsight)for(const metric of Object.keys(EXTRA_METRICS)){
  try{const collected=[];for(let start=since;start<until;){const end=shiftDate(start,30)<until?shiftDate(start,30):until;collected.push(...normalizeInsights(await meta.getAdditionalInsight(hotel.page_id,pageToken,start,end,metric),hotel,start,end,EXTRA_METRICS));start=end;}
   for(const row of collected){const current=extraDays.get(row.metric_date)||{...hotel,metric_date:row.metric_date,bucket_end_time:row.bucket_end_time};if(current.bucket_end_time!==row.bucket_end_time)throw fail('Bucket chỉ số bổ sung không khớp.',502);current[EXTRA_METRICS[metric]]=row[EXTRA_METRICS[metric]];extraDays.set(row.metric_date,current);}
  }catch{warnings.push(EXTRA_METRICS[metric]+': chưa đọc được chỉ số bổ sung; giữ dữ liệu đã lưu.');}
 }
 const byDate=new Map(days.map(d=>[d.metric_date,d]));for(const row of extraDays.values()){const d=byDate.get(row.metric_date);if(d&&d.bucket_end_time!==row.bucket_end_time){warnings.push('Bucket bổ sung không khớp với chỉ số gốc.');continue;}byDate.set(row.metric_date,{...(d||{...hotel,metric_date:row.metric_date,bucket_end_time:row.bucket_end_time}),...row});}
 let posts=null;if(meta.getPublishedPosts)try{posts=normalizePublishedPosts(await meta.getPublishedPosts(hotel.page_id,pageToken,since,until),since,until);}catch{warnings.push('published_posts: chưa đọc được bài đăng; giữ dữ liệu đã lưu.');}
 const snapshot={...hotel,snapshot_date:calendarDate(now),followers_count:count(summary.followers_count),fan_count:count(summary.fan_count)};
 if(snapshot.followers_count===null&&snapshot.fan_count===null)throw fail('Meta chưa trả follower hoặc Page Likes.',502);
 await save({hotel,days:[...byDate.values()],posts,snapshot});
 return {...hotel,ok:true,days:byDate.size,snapshot_date:snapshot.snapshot_date,additionalComplete:!warnings.length,warnings,...(!days.length?{notice:'Meta chưa trả chỉ số ngày; đã lưu follower snapshot, giữ nguyên lịch sử cũ.'}:{})};
}
export async function syncAllFacebookHotels({since,until,now=new Date(),meta=createMetaService(),save,acquire=lock}={}){
 const range=syncRange(since,until,now),release=await acquire('facebook:sync',1800);
 if(!release)return {skipped:true,reason:'busy'};
 try{
  // One account listing per run, shared by all configured Pages (including pagination).
  const pages=await meta.getManagedPages();
  const settled=await Promise.allSettled(FACEBOOK_HOTELS.map(hotel=>syncFacebookHotel(hotel,{meta,pages,...range,now,save})));
  const results=settled.map((item,i)=>item.status==='fulfilled'?item.value:{...FACEBOOK_HOTELS[i],ok:false,error:item.reason?.status?item.reason.message:'Chưa lưu được dữ liệu Facebook vào Supabase. Kiểm tra migration và kết nối database.'});
  return {...range,results,ok:results.every(r=>r.ok)};
 }finally{await release();}
}
