export const localDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
// One latest confirmed observation per field/day. Missing fields remain gaps;
// failed attempts and approximate counts never become points on the chart.
export function dailyHistory(observations){
 const days=new Map();
 for(const row of observations){
  for(const [field,at] of [['rating','rating_at'],['review_count','count_at']]){
   if(row.status==='failed'||row[field]==null||!row[at]||(field==='review_count'&&row.count_display))continue;
   const day=localDay(row[at]),point=days.get(day)||{day,rating:null,review_count:null};
   if(!point[at]||Date.parse(row[at])>Date.parse(point[at])){point[field]=Number(row[field]);point[at]=row[at];}
   days.set(day,point);
  }
 }
 const sorted=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
 if(!sorted.length)return [];
 const result=[];
 for(let day=sorted[0].day;day<=sorted.at(-1).day;){
  result.push(days.get(day)||{day,rating:null,review_count:null});
  day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 }
 return result;
}
export function historyChange(points,field){
 const values=points.filter(p=>p[field]!=null);
 return {latest:values.at(-1)?.[field]??null,change:values.length>1?Number((values.at(-1)[field]-values[0][field]).toFixed(2)):null,days:values.length};
}
