import {rpc} from './store.js';
export const vietnamDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function weekRange(day){const weekday=new Date(day+'T00:00:00Z').getUTCDay();const start=shiftDay(day,-((weekday+6)%7));return {start,end:shiftDay(start,6)};}
export function validateReportRange(start,end,now=new Date()){
 const valid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const today=vietnamDay(now);
 if(!valid(start)||!valid(end)||start>end||end>today||start<shiftDay(today,-364))throw Object.assign(new Error('Chọn ngày bắt đầu và kết thúc hợp lệ trong 365 ngày gần nhất, đến hôm nay.'),{status:400});
 return {start,end,days:Math.round((Date.parse(today+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1};
}
export async function reportForRange(start,end,now=new Date()){
 const range=validateReportRange(start,end,now);
 const inputs=await rpc('review_tracker_insights_read',{p_days:range.days});
 return {report:buildWeeklyReport(inputs,range.start,range.end,now),mode:'custom'};
}
export function buildAlerts(data,now=new Date(),lookbackDays=7){
 const entities=new Map(data.directory.map(e=>[e.entity_key,e])),reads=new Set(data.readKeys),alerts=[];
 const decorate=a=>{const e=entities.get(a.entity_key);if(!e)return;alerts.push({...a,name:e.name,category:e.category,relationship:e.relationship,read:reads.has(a.key)});};
 for(const c of data.changes){if(Date.parse(c.at)<now.getTime()-lookbackDays*86400000)continue;const drop=Number((Number(c.value)-Number(c.previous)).toFixed(2));if(c.metric==='rating'&&-drop<(Number(c.rating_max)===5?0.1:0.2)-1e-8)continue;
  decorate({...c,key:'change:'+c.id+':'+c.metric,type:c.metric==='rating'?'rating_drop':'count_drop',severity:c.metric==='rating'?'high':'medium',delta:drop});}
 for(const e of data.directory)for(const link of e.sources||[]){if(link.warning)continue;const s=data.statuses.find(s=>s.entity_key===e.entity_key&&s.source===link.source);if(!s)continue;
  if(s.status==='failed'&&Number(s.consecutive_failures)>=3)decorate({...s,key:'failure:'+e.entity_key+':'+link.source+':'+(s.rating_at||s.count_at||'first'),type:'source_error',severity:'medium',at:s.attempted_at});
  for(const field of ['rating_at','count_at'])if(s[field]&&now.getTime()-Date.parse(s[field])>48*3600000)decorate({...s,key:'stale:'+e.entity_key+':'+link.source+':'+field+':'+s[field],type:'stale',field,severity:'low',at:s[field]});
 }
 return alerts.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]-{high:0,medium:1,low:2}[b.severity])||Date.parse(b.at)-Date.parse(a.at));
}
export function buildWeeklyReport(data,start,end,now=new Date()){
 const rows=[];
 for(const e of data.directory.filter(e=>e.relationship==='managed'))for(const link of e.sources||[]){
  if(link.warning)continue;const points=data.daily.filter(p=>p.entity_key===e.entity_key&&p.source===link.source&&p.day>=start&&p.day<=end).sort((a,b)=>a.day.localeCompare(b.day));
  const ratings=points.filter(p=>p.rating!=null),counts=points.filter(p=>p.review_count!=null),first=counts[0],last=counts.at(-1);
  rows.push({entity_key:e.entity_key,name:e.name,category:e.category,source:link.source,rating_max:Number(ratings.at(-1)?.rating_max||(['google','tripadvisor','grab','shopee'].includes(link.source)?5:10)),rating:ratings.at(-1)?.rating??null,rating_change:ratings.length>=2?Number((ratings.at(-1).rating-ratings[0].rating).toFixed(2)):null,
   review_count:last?.review_count??null,count_change:counts.length>=2&&first.count_kind===last.count_kind?last.review_count-first.review_count:null,count_kind:last?.count_kind||'reviews',count_days:counts.length,rating_days:ratings.length,count_first_day:first?.day||null,count_last_day:last?.day||null,rating_at:ratings.at(-1)?.rating_at||null,count_at:last?.count_at||null,
   status:!points.length?'missing':ratings.length&&counts.length?'confirmed':'partial'});
 }
 const alerts=buildAlerts({...data,changes:data.changes.filter(c=>vietnamDay(c.at)>=start&&vietnamDay(c.at)<=end)},now,400).filter(a=>a.relationship==='managed'&&vietnamDay(a.at)>=start&&vietnamDay(a.at)<=end);
 return {version:1,start,end,generated_at:now.toISOString(),rows,alerts,locations:new Set(rows.map(r=>r.entity_key)).size,confirmed_sources:rows.filter(r=>r.status==='confirmed').length,missing_sources:rows.filter(r=>r.status==='missing').length,
  top_growth:rows.filter(r=>r.count_change!=null&&r.count_change>0).sort((a,b)=>b.count_change-a.count_change).slice(0,5),rating_drops:rows.filter(r=>r.rating_change!=null&&r.rating_change<0).sort((a,b)=>a.rating_change-b.rating_change).slice(0,5),
  note:'Chênh lệch tính giữa ngày đầu/cuối có số liệu trong khoảng ngày đã chọn, riêng từng nguồn. Không cộng tổng giữa các nền tảng. Mốc không chính xác và trường thiếu không được coi là 0.'};
}
let saving;
export async function reports(data){
 const today=vietnamDay(new Date()),current=weekRange(today),previous=weekRange(shiftDay(current.start,-1));let saved=await rpc('review_tracker_reports_read');
 if(!saved.some(r=>r.week_start===previous.start)){
  if(!saving)saving=(async()=>{const inputs=data||await rpc('review_tracker_insights_read',{p_days:90});await rpc('review_tracker_report_save',{p_week:previous.start,p_payload:buildWeeklyReport(inputs,previous.start,previous.end)});})().finally(()=>{saving=null;});
  await saving;saved=await rpc('review_tracker_reports_read');
 }
 const inputs=data||await rpc('review_tracker_insights_read',{p_days:90});return {current:buildWeeklyReport(inputs,current.start,today),saved};
}
