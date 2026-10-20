import {calendarDate} from '../../utils/date.js';
import {getValue,rpc} from '../../store.js';
import {syncGa4} from './service.js';
const marker='marketing:report:ga4';
// Marker shares the existing private, 366-day marketing storage contract.
import {createHash} from 'node:crypto';
const markerKey='marketing:report:'+createHash('sha256').update(marker).digest('hex');
export async function ga4Cron({now=new Date(),enabled=process.env.GA4_AUTO_SYNC==='true',get=getValue,save=p=>rpc('review_tracker_marketing_set',p),run=syncGa4}={}){
 if(!enabled)return {skipped:true,reason:'disabled'};const today=calendarDate(now),shift=n=>new Date(Date.parse(today)+n*86400000).toISOString().slice(0,10),to=shift(-1);
 if((await get(markerKey))?.to===to)return {skipped:true,reason:'already_synced'};
 const ranges=[...new Set([shift(-7),shift(-30),today.slice(0,7)+'-01'])].filter(from=>from<=to),results=[];
 for(const from of ranges)results.push(await run(from,to));const ok=results.every(r=>r.ok===true&&!r.skipped);
 if(ok)await save({p_key:markerKey,p_value:{to,finishedAt:now.toISOString()}});return {ok,to,results};
}
