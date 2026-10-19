export const FACEBOOK_METRICS=[['post_engagements','Tương tác bài viết'],['media_views','Lượt xem nội dung'],['unique_viewers','Người xem duy nhất / ngày']];
export const dayOffset=(day,n)=>Number.isFinite(Date.parse(day))?new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10):'';
export function hotelFacebookReport(hotel,insights,followers,from,to){
 const days=(insights.days||[]).filter(d=>d.page_id===hotel.page_id),snapshots=(followers.snapshots||[]).filter(s=>s.page_id===hotel.page_id).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date));
 const latest=followers.latest?.find(s=>s.page_id===hotel.page_id),previous=followers.previous?.find(s=>s.page_id===hotel.page_id&&s.snapshot_date===dayOffset(latest?.snapshot_date||to,-1));
 const baseline=followers.baseline?.find(s=>s.page_id===hotel.page_id&&s.snapshot_date===dayOffset(from,-1));
 const valid=snapshots.filter(s=>s.followers_count!==null),start=baseline?.followers_count!=null?baseline:valid[0],end=valid.at(-1);
 const length=Math.floor((Date.parse(to)-Date.parse(from))/86400000)+1,byDate=new Map(days.map(d=>[d.metric_date,d]));
 const chartDays=Number.isFinite(length)&&length>0&&length<=366?Array.from({length},(_,i)=>{const metric_date=dayOffset(from,i);return byDate.get(metric_date)||{metric_date,post_engagements:null,media_views:null,unique_viewers:null};}):[];
 return {...hotel,days,chartDays,snapshots,latest,totals:Object.fromEntries(FACEBOOK_METRICS.map(([key])=>{const values=days.filter(d=>d[key]!=null);return [key,{value:values.length?values.reduce((sum,d)=>sum+d[key],0):null,days:values.length}];})),
  dailyGrowth:latest?.followers_count!=null&&previous?.followers_count!=null?latest.followers_count-previous.followers_count:null,
  growth:start&&end&&start.snapshot_date<end.snapshot_date?{value:end.followers_count-start.followers_count,from:start.snapshot_date,to:end.snapshot_date}:null};
}
