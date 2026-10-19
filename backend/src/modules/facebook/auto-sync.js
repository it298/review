import {calendarDate} from '../../utils/date.js';
import {getValue,setValue} from '../../store.js';
import {syncAllFacebookHotels} from './sync.js';
import {shiftDate} from './dates.js';
export async function facebookCron({now=new Date(),enabled=process.env.FACEBOOK_AUTO_SYNC==='true',get=getValue,set=setValue,run=syncAllFacebookHotels}={}){
 if(!enabled)return {skipped:true,reason:'disabled'};
 const date=calendarDate(now),time=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 if(time<'08:30')return {skipped:true,reason:'before_schedule'};
 if((await get('facebook:last-cron'))?.date===date)return {skipped:true,reason:'already_synced'};
 const result=await run({since:shiftDate(date,-3),until:date,now});
 if(result.ok)await set('facebook:last-cron',{date,finishedAt:now.toISOString()},604800);
 return result;
}
