// Experimental validation only. Not connected to the production sync service.
export function vietnameseDate(text) {
 const m=String(text||'').match(/(\d{1,2}) tháng (\d{1,2}) (\d{4})/);
 if(!m) throw new Error('Missing review date');
 const [,day,month,year]=m.map(Number); const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw new Error('Invalid review date');
 return date.toISOString().slice(0,10);
}
export function validatePilot(input) {
 if(input.source!=='agoda'||!/^\d+$/.test(input.propertyId))throw new Error('Unverified source/property');
 if(!Number.isInteger(input.sourceCount)||input.sourceCount<0||input.ratingMax!==10||!Number.isFinite(input.rating)||input.rating<0||input.rating>10)throw new Error('Invalid source summary');
 const reviews=new Map();const repeatedPages=[];let duplicates=0;let previousDate=null;
 for(const [index,page] of input.pages.entries()){
  if(!page.length)throw new Error('Empty page; do not mark sync successful');
  let newRows=0;
  for(const row of page){
   if(!/^\d+$/.test(row.reviewId))throw new Error('Missing stable review ID');
   const rating=Number(String(row.rating).replace(',','.'));if(!Number.isFinite(rating)||rating<0||rating>10)throw new Error('Invalid review rating');
   const reviewedAt=vietnameseDate(row.reviewedAt);
   const key=`agoda:${input.propertyId}:${row.reviewId}`;
   if(reviews.has(key)){duplicates++;continue;}
   if(previousDate&&reviewedAt>previousDate)throw new Error('Reviews are not newest first');previousDate=reviewedAt;
   reviews.set(key,{key,reviewId:row.reviewId,source:'agoda',propertyId:input.propertyId,rating,ratingMax:10,reviewedAt,title:row.title?.trim()||'',content:row.content?.trim()||'',author:row.author?.trim()||'',response:row.response?.trim()||null,responseAt:row.responseAt?vietnameseDate(row.responseAt):null,capturedAt:input.capturedAt});newRows++;
  }
  if(!newRows)repeatedPages.push(index+1);
 }
 return {propertyId:input.propertyId,name:input.name,url:input.url,capturedAt:input.capturedAt,source:'agoda',sourceCount:input.sourceCount,rating:input.rating,ratingMax:10,collectedCount:reviews.size,duplicates,repeatedPages,complete:false,status:repeatedPages.length?'pagination_stalled':'partial_sample',reviews:[...reviews.values()]};
}
