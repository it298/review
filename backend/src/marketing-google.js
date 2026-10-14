import {createHash} from 'node:crypto';
import {googleGet,validateLocation,connectionStatus} from './google.js';
import {state,getValue,rpc,lock} from './store.js';
import {calendarDate} from './utils/date.js';

export const performanceMetrics={
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS:'Hiển thị Maps trên máy tính',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS:'Hiển thị Maps trên di động',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH:'Hiển thị Tìm kiếm trên máy tính',
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH:'Hiển thị Tìm kiếm trên di động',
  WEBSITE_CLICKS:'Nhấp website',CALL_CLICKS:'Nhấp gọi điện',
  BUSINESS_DIRECTION_REQUESTS:'Yêu cầu chỉ đường',BUSINESS_BOOKINGS:'Đặt qua Reserve with Google',
  BUSINESS_FOOD_MENU_CLICKS:'Nhấp xem thực đơn'
};
const fail=message=>Object.assign(new Error(message),{status:400});
export function performanceRange(from,to){
  const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!date(from)||!date(to)||from>to||to>=calendarDate()||(Date.parse(to)-Date.parse(from))/86400000>365)throw fail('Chọn khoảng ngày hợp lệ, tối đa 366 ngày và kết thúc trước hôm nay.');
  return {from,to};
}
export function normalizePerformance(raw,from,to){
  const series=new Map(),keys=new Set();
  for(const group of raw.multiDailyMetricTimeSeries||[])for(const item of group.dailyMetricTimeSeries||[]){
    if(!(item.dailyMetric in performanceMetrics))continue;
    // Requests do not select a sub-entity breakdown; never sum unexpected duplicate series.
    if(keys.has(item.dailyMetric)||item.dailySubEntityType)throw new Error('Google trả chuỗi chỉ số trùng hoặc có phân nhóm chưa hỗ trợ.');
    keys.add(item.dailyMetric);
    for(const point of item.timeSeries?.datedValues||[]){
      const d=point.date||{},day=`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
      const value=Number(point.value??0);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<from||day>to||!Number.isSafeInteger(value)||value<0)throw new Error('Chỉ số hiệu suất Google không hợp lệ.');
      const row=series.get(day)||{date:day};if(item.dailyMetric in row)throw new Error('Google trả ngày trùng cho cùng chỉ số.');row[item.dailyMetric]=value;series.set(day,row);
    }
  }
  const days=[...series.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const metrics=Object.entries(performanceMetrics).map(([key,label])=>{
    const returned=days.filter(d=>Object.hasOwn(d,key));
    return {key,label,value:returned.length?returned.reduce((sum,d)=>sum+d[key],0):null,days:returned.length};
  });
  return {from,to,days,metrics};
}
export async function performanceTargets(){
  const data=await state();return Object.values(data.places||{}).filter(p=>p.google_location).map(p=>({id:String(p.id),name:p.name,location:p.google_location}));
}
const keyFor=(location,from,to)=>'marketing:report:'+createHash('sha256').update(JSON.stringify([location,from,to])).digest('hex');
export async function readPerformance(placeId,from,to,refresh=false){
  performanceRange(from,to);
  const target=(await performanceTargets()).find(p=>p.id===String(placeId));if(!target)throw fail('Địa điểm chưa được liên kết Google Business trong phần mềm.');
  validateLocation(target.location);const key=keyFor(target.location,from,to);
  const cached=await getValue(key);
  if(!refresh)return {target,report:cached||null,source:cached?'saved':'missing'};
  const url=new URL('https://businessprofileperformance.googleapis.com/v1/'+target.location+':fetchMultiDailyMetricsTimeSeries');
  for(const metric of Object.keys(performanceMetrics))url.searchParams.append('dailyMetrics',metric);
  for(const [side,date] of [['start_date',from],['end_date',to]]){
    const [year,month,day]=date.split('-');for(const [field,value] of Object.entries({year,month,day}))url.searchParams.set(`dailyRange.${side}.${field}`,String(Number(value)));
  }
  const report={...normalizePerformance(await googleGet(url),from,to),capturedAt:new Date().toISOString()};
  await rpc('review_tracker_marketing_set',{p_key:key,p_value:report});
  return {target,report,source:'google_api'};
}
export async function syncPerformance(from,to){
  performanceRange(from,to);const release=await lock('marketing-google-sync',280);if(!release)return {skipped:true};
  try{const results=[];for(const target of await performanceTargets()){
    try{await readPerformance(target.id,from,to,true);results.push({id:target.id,name:target.name,ok:true});}
    catch(e){results.push({id:target.id,name:target.name,ok:false,error:e.message});}
  }return {from,to,results};}finally{await release();}
}
export async function marketingStatus(){return {...await connectionStatus(),targets:await performanceTargets(),autoSync:process.env.MARKETING_AUTO_SYNC==='true'};}
export async function marketingCron(){
  if(process.env.MARKETING_AUTO_SYNC!=='true')return {skipped:true,reason:'disabled'};
  const to=calendarDate(new Date(Date.now()-86400000)),from=calendarDate(new Date(Date.now()-7*86400000));
  const marker='marketing:last-cron';if((await getValue(marker))?.to===to)return {skipped:true,reason:'already_synced'};
  const result=await syncPerformance(from,to);
  if(!result.skipped&&result.results.length&&result.results.every(r=>r.ok))await rpc('review_tracker_marketing_set',{p_key:marker,p_value:{to,finishedAt:new Date().toISOString()}});
  return result;
}
