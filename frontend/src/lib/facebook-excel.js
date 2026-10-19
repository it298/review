import {FACEBOOK_REPORT_FIELDS} from '../../../shared/facebook-report.js';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fieldNames={'luot xem':'media_views','nguoi xem':'period_unique_viewers','luot tuong tac':'post_engagements','luot click lien ket':'link_clicks','luot truy cap':'page_visits','luot theo doi':'new_follows','lien he mes':'message_contacts','ty le phan hoi':'response_rate','so post bai':'published_posts'};
const aliases={'quy nhon sea hotel':'quy-nhon-sea-hotel','vistara quy nhon sea hotel':'quy-nhon-sea-hotel','vistara gia lai sea hotel':'vistara-gia-lai-sea-hotel','sontra sea hotel':'sontra-sea-hotel','yzistel hoi an':'yzistel-hoi-an-39-le-quy-don','vintage taste deli cafe':'vintage-taste-deli-cafe'};
function day(value){
 if(value instanceof Date)return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
 if(typeof value==='number'&&Number.isFinite(value))return new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
 const s=String(value??'').trim(),m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);return m?`${m[3]}-${m[2]}-${m[1]}`:/^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;
}
const validDay=d=>d&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
export function parseFacebookWorkbook(sheets,hotels,fileName){
 const groups=new Map(),issues=[];let ignored=0;
 for(const sheet of sheets){
  const rows=sheet.rows||[],headerIndex=rows.findIndex(r=>r.some(v=>normalize(v)==='channel')&&r.some(v=>normalize(v)==='metric'));
  if(headerIndex<0)continue;const header=rows[headerIndex].map(normalize),col=name=>header.indexOf(name),idx={id:col('id')>=0?col('id'):col('brand'),from:col('date bat dau'),to:col('date ket thuc'),channel:col('channel'),metric:col('metric'),value:col('value')};
  if(Object.values(idx).some(n=>n<0)){issues.push(`${sheet.name}: thiếu cột nhận diện báo cáo.`);continue;}
  for(let i=headerIndex+1;i<rows.length;i++){
   const r=rows[i];if(!r[idx.channel]&&!r[idx.metric])continue;if(normalize(r[idx.channel])!=='facebook'){ignored++;continue;}
   const hotel=hotels.find(h=>h.hotel_key===aliases[normalize(r[idx.id])]||normalize(h.hotel_name)===normalize(r[idx.id])),key=fieldNames[normalize(r[idx.metric])],from=day(r[idx.from]),to=day(r[idx.to]),v=r[idx.value];
   const at=`${sheet.name} · dòng ${i+1}`;
   if(!hotel||!key||!validDay(from)||!validDay(to)||from>to){issues.push(at+': chưa xác định được Page, chỉ số hoặc ngày.');continue;}
   if(typeof v!=='number'||!Number.isFinite(v)||v<0||(key!=='response_rate'&&!Number.isSafeInteger(v))||(key==='response_rate'&&v>100)){issues.push(at+': số liệu trống/sai kiểu; giữ thiếu, không đổi thành 0.');continue;}
   // Excel percentages can be fractions with % formatting; the reader supplies formats.
   const format=sheet.formats?.[i]?.[idx.value]||'',value=key==='response_rate'&&format.includes('%')?v*100:v;
   if(key==='response_rate'&&value>100){issues.push(at+': tỷ lệ phản hồi vượt 100%.');continue;}
   const id=[hotel.page_id,from,to].join(':'),group=groups.get(id)||{pageId:hotel.page_id,hotelName:hotel.hotel_name,from,to,values:{},source_note:`Excel: ${fileName} · ${sheet.name}`.slice(0,500),conflicts:[],locations:{}};
   if(Object.hasOwn(group.values,key)&&group.values[key]!==value){group.conflicts.push(`${FACEBOOK_REPORT_FIELDS.find(([k])=>k===key)[1]} trùng nhưng khác số.`);}
   group.values[key]=value;group.locations[key]=at;groups.set(id,group);
  }
 }
 return {reports:[...groups.values()].map(({locations,...r})=>r),issues,ignored};
}
