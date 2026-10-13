import {dailyHistory} from './history.js';
export const trendColors=['#77549a','#c49a52','#428e84','#bc6176','#678dc0','#92764c','#9c7cad','#668c59','#c8794e','#4a7a91','#b88a9f','#828349','#6970ac','#977368'];
// Daily observations remain independent per field. Missing days are gaps.
export function trendSeries(locations,histories,start,end){
 const dates=new Map(),series=[];
 locations.forEach((location,index)=>{
  const id='p'+index,points=dailyHistory(histories[location.entity_key]?.observations||[]).filter(p=>p.day>=start&&p.day<=end);
  const counts=points.filter(p=>p.review_count!=null),ratings=points.filter(p=>p.rating!=null);
  let previousCount=null,previousRating=null;
  for(const point of points){
   const row=dates.get(point.day)||{day:point.day};
   row[id+'Count']=point.review_count;row[id+'Rating']=point.rating;
   row[id+'CountAt']=point.count_at;row[id+'RatingAt']=point.rating_at;
   row[id+'CountDelta']=point.review_count!=null&&previousCount!=null?point.review_count-previousCount:null;
   row[id+'RatingDelta']=point.rating!=null&&previousRating!=null?Number((point.rating-previousRating).toFixed(2)):null;
   if(point.review_count!=null)previousCount=point.review_count;
   if(point.rating!=null)previousRating=point.rating;
   dates.set(point.day,row);
  }
  series.push({...location,id,color:trendColors[index%trendColors.length],hasData:counts.length>0||ratings.length>0,lastCount:counts.at(-1)?.review_count??null,lastRating:ratings.at(-1)?.rating??null,countAt:counts.at(-1)?.count_at,ratingAt:ratings.at(-1)?.rating_at,countChange:counts.length>1?counts.at(-1).review_count-counts[0].review_count:null,ratingChange:ratings.length>1?Number((ratings.at(-1).rating-ratings[0].rating).toFixed(2)):null});
 });
 const rows=[...dates.values()].sort((a,b)=>a.day.localeCompare(b.day));
 return {series,rows};
}
