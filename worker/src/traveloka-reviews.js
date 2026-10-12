import {validateReviewBatch} from '../../backend/src/review-alerts.js';
const endpoint='https://astcapi-public.ast.traveloka.com/api/v2/public/review/getHotelReviews';
const fail=()=>Object.assign(new Error('Traveloka individual reviews could not be verified.'),{code:'invalid_data'});
export function parseTravelokaReviews(body,request,target,capturedAt=new Date().toISOString()){
 const d=request?.data,s=d?.filterSortSpec,data=body?.data;
 if(target.source!=='traveloka'||String(d?.hotelId)!==target.extranet_property_id||s?.filterType!==null||s?.dateRangeStart!==null||s?.dateRangeEnd!==null||s?.sortType!=='NEWEST_TIMESTAMP'||Number(d?.skip)!==0||!Array.isArray(data?.reviewList)||!/^[0-9]+$/.test(String(data.numReviewEntries)))throw fail();
 if(Number(data.numReviewEntries)>0&&!data.reviewList.length)throw fail();
 const reviews=data.reviewList.map(r=>{
  if(typeof r.reviewId!=='string'||!/^\d{1,30}$/.test(r.reviewId)||typeof r.timestamp!=='string'||!/^\d{13}$/.test(r.timestamp)||typeof r.overallScore!=='string'||!/^\d{1,2}(\.\d+)?$/.test(r.overallScore))throw fail();
  return {reviewId:r.reviewId,rating:Number(r.overallScore),ratingMax:10,reviewedAt:new Date(Number(r.timestamp)).toISOString(),content:r.reviewText||''};
 });
 return validateReviewBatch({entityKey:target.entity_key,source:'traveloka',sourceUrl:target.source_url,method:'extranet-auto',capturedAt,reviews});
}
export async function readTravelokaReviews(page,target,{timeout=30000}={}){
 let resolve,reject,timer;
 const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});ready.catch(()=>{});
 const observe=async r=>{if(r.url()!==endpoint)return;try{
  const request=r.request().postDataJSON();if(String(request?.data?.hotelId)!==target.extranet_property_id||request.data.filterSortSpec?.filterType!==null)return;
  if(!r.ok()||r.fromServiceWorker()||!r.headers()['content-type']?.includes('json'))throw fail();
  resolve(parseTravelokaReviews(await r.json(),request,target));
 }catch{reject(fail());}};
 page.on('response',observe);timer=setTimeout(()=>reject(Object.assign(fail(),{code:'unavailable'})),timeout);
 try{
  // Change only the visible filter; let the portal issue its own signed-in request.
  // No authentication headers, context tokens or private guest fields are replayed.
  const filter=page.locator('.select-control').filter({hasText:/Chưa trả lời|Tất cả đánh giá|Đã trả lời|Đánh giá chỉ cho điểm/}).first();
  await filter.click({timeout});
  await page.locator('.select-option').filter({hasText:'Tất cả đánh giá'}).click({timeout});
  const batch=await ready;
  if((await page.getByTestId('hotel-list-dropdown-active-id').innerText()).trim()!==target.extranet_property_id)throw fail();
  return batch;
 }finally{clearTimeout(timer);page.off('response',observe);}
}
