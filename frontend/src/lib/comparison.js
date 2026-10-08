export function comparableGrowth(daily,left,right,source){
 const a=daily.filter(p=>p.entity_key===left&&p.source===source&&p.review_count!=null),b=daily.filter(p=>p.entity_key===right&&p.source===source&&p.review_count!=null);
 const common=a.filter(p=>b.some(q=>q.day===p.day&&q.count_kind===p.count_kind)).sort((p,q)=>p.day.localeCompare(q.day));
 if(common.length<2)return {points:[],commonDays:common.length};
 const first=common[0],last=common.filter(p=>p.count_kind===first.count_kind).at(-1),baseB=b.find(p=>p.day===first.day&&p.count_kind===first.count_kind);
 if(first.day===last.day)return {points:[],commonDays:1};
 // Keep calendar gaps explicit; do not connect unavailable observations.
 const points=[];for(let day=first.day;day<=last.day;day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10)){
  const pa=a.find(p=>p.day===day&&p.count_kind===first.count_kind),pb=b.find(p=>p.day===day&&p.count_kind===first.count_kind);
  points.push({day,left:pa?pa.review_count-first.review_count:null,right:pb?pb.review_count-baseB.review_count:null,left_total:pa?.review_count??null,right_total:pb?.review_count??null});
 }
 const end=points.at(-1);return {points,commonDays:common.length,start:first.day,end:last.day,leftChange:end.left,rightChange:end.right,kind:first.count_kind};
}
