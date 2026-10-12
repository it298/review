import {rpc,getValue,setValue,deleteValue} from './store.js';
export const reviewScales={google:5,tripadvisor:5,grab:5,shopee:5,agoda:10,booking:10,traveloka:10,trip:10,expedia:10};
export function validateReviewBatch(p,now=new Date()){
 const fail=()=>{throw Object.assign(new Error('Dữ liệu đánh giá riêng lẻ không hợp lệ.'),{status:400});};
 const scale=reviewScales[p?.source],captured=new Date(p?.capturedAt);
 if(!scale||!/^[-a-z0-9]{1,200}$/.test(p.entityKey)||!['api','dom','extranet-auto','email','ocr'].includes(p.method)||p.method==='ocr'&&!p.corroborated||!Array.isArray(p.reviews)||p.reviews.length>200||!Number.isFinite(captured.getTime())||captured>now.getTime()+300000||captured<now.getTime()-86400000)fail();
 let sourceUrl;try{if(typeof p.sourceUrl!=='string'||p.sourceUrl.length>4000)fail();const u=new URL(p.sourceUrl);if(u.protocol!=='https:'||u.username||u.password)fail();sourceUrl=p.sourceUrl;}catch{fail();}
 const ids=new Set(),reviews=p.reviews.map(r=>{
  const posted=new Date(r.reviewedAt),updated=new Date(r.updatedAt||r.reviewedAt);
  if(typeof r.reviewId!=='string'||!/^[-a-zA-Z0-9_]{1,200}$/.test(r.reviewId)||ids.has(r.reviewId)||!Number.isFinite(r.rating)||r.rating<0||r.rating>scale||scale===5&&(!Number.isInteger(r.rating)||r.rating<1)||r.ratingMax!==scale||!Number.isFinite(posted.getTime())||!Number.isFinite(updated.getTime())||updated<posted||updated>captured.getTime()+300000||posted>captured.getTime()+300000)fail();
  ids.add(r.reviewId);
  for(const [field,max] of [['content',20000],['author',200],['title',500]])if(r[field]!=null&&(typeof r[field]!=='string'||r[field].length>max))fail();
  return {reviewId:r.reviewId,rating:r.rating,ratingMax:scale,reviewedAt:posted.toISOString(),updatedAt:updated.toISOString(),dateOnly:r.dateOnly===true||/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt),author:r.author||'',title:r.title||'',content:r.content||''};
 });
 return {entityKey:p.entityKey,source:p.source,sourceUrl,method:p.method,capturedAt:captured.toISOString(),reviews};
}
export async function reviewAlertInputs(days=7){return rpc('review_tracker_review_alerts_read',{p_days:days});}
export async function withReviewAlerts(data,days=7){return {...data,...await reviewAlertInputs(days)};}
export async function ingestGoogleReviews(place,readPage){
 const targets=await rpc('review_tracker_review_targets_read');
 const target=targets.find(t=>t.source==='google'&&Number(t.google_place_id)===Number(place.id));
 if(!target)return {status:'unmapped',reviews:0};
 const key='review-pages:'+target.entity_key,progress=await getValue(key);
 const cutoff=progress?.cutoff??(target.last_review_scan_at?Date.parse(target.last_review_scan_at)-86400000:null);
 let pageToken=progress?.pageToken,seen=new Set(),count=0,pages=0;
 do{
  const page=await readPage(place.google_account,place.google_location,pageToken);
  const p=validateReviewBatch({entityKey:target.entity_key,source:'google',sourceUrl:target.source_url,method:'api',capturedAt:new Date().toISOString(),reviews:page.reviews});
  await rpc('review_tracker_reviews_ingest',{p});count+=p.reviews.length;pages++;
  // Sorting is updateTime desc. Overlap a day to avoid equal-timestamp boundaries.
  if(cutoff&&p.reviews.length&&p.reviews.every(r=>Date.parse(r.updatedAt)<cutoff))break;
  pageToken=page.nextPageToken;
  if(pageToken){if(seen.has(pageToken))throw new Error('Repeated Google review page');seen.add(pageToken);}
  // A long first import is resumed on the next sync; never report it as complete.
  if(pages>=20&&pageToken){await setValue(key,{pageToken,cutoff},604800);return {status:'partial',reviews:count};}
 }while(pageToken);
 await deleteValue(key);
 return {status:'success',reviews:count};
}
export async function ingestOtaReviews(payload){
 if(payload.status!=='success'||!payload.reviews?.length)return {status:'summary_only'};
 const targets=await rpc('review_tracker_ota_targets_read'),target=targets.find(t=>t.source===payload.source&&t.property_id===payload.propertyId);
 if(!target)return {status:'unmapped'};
 const p=validateReviewBatch({entityKey:target.hotel_key,source:payload.source,sourceUrl:target.source_url,method:payload.method,corroborated:payload.corroborated,capturedAt:payload.capturedAt,reviews:payload.reviews});
 return rpc('review_tracker_reviews_ingest',{p});
}
