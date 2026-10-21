import {hotelFacebookReport} from './facebook-report.js';
export const marketingNumber=v=>v==null?'—':Number(v).toLocaleString('vi-VN');
export function overviewFacebook(status,insights,followers,from,to){return (status.hotels||[]).map(h=>{const r=hotelFacebookReport(h,insights,followers,from,to);return {name:h.hotel_name,capturedAt:r.latest?.updated_at,values:{followers:r.latest?.followers_count??null,views:r.totals.media_views.value,engagements:r.totals.post_engagements.value},coverage:r.totals.media_views.days+' ngày có lượt xem'};});}
// Missing accounts must remain visibly missing; totals are never cross-platform unique people.
export function overviewTotal(rows,metric){const values=rows.map(r=>r.values[metric]);const known=values.filter(v=>typeof v==='number'&&Number.isFinite(v));return {value:known.length?known.reduce((a,b)=>a+b,0):null,known:known.length,total:values.length};}
export function overviewMetric(report,key){return report?.metrics?.find(m=>m.key===key)?.value??null;}
