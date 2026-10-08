const sources=new Set(['agoda','traveloka','trip']);
const methods=new Set(['api','dom','ocr','email']);
export function validateOtaResult(p){
 const fail=()=>{throw Object.assign(new Error('Dữ liệu OTA không hợp lệ hoặc chưa đủ tin cậy.'),{status:400});};
 if(!p||!sources.has(p.source)||!/^\d{1,30}$/.test(p.propertyId)||!methods.has(p.method))fail();
 if(p.status==='failed')return {source:p.source,propertyId:p.propertyId,method:p.method,status:'failed',error:['blocked','unconfigured','invalid_data','network','browser_missing'].includes(p.error)?p.error:'invalid_data'};
 if(p.status!=='success'||!Array.isArray(p.reviews)||p.reviews.length>50)fail();
 const capturedAt=new Date(p.capturedAt);if(isNaN(capturedAt)||capturedAt.getTime()>Date.now()+300000||capturedAt.getTime()<Date.now()-86400000)fail();
 const summary=p.summary;
 if(summary){if(!Number.isFinite(summary.rating)||summary.rating<0||summary.rating>summary.ratingMax||summary.ratingMax!==10||!Number.isSafeInteger(summary.count)||summary.count<0)fail();}
 if(!summary&&!p.reviews.length)fail();
 // OCR candidates are held for review; confidence alone does not establish correctness.
 if(p.method==='ocr'&&!p.corroborated)fail();
 const ids=new Set();
 const reviews=p.reviews.map(r=>{
  if(!/^\d{1,30}$/.test(r.reviewId)||ids.has(r.reviewId)||!Number.isFinite(r.rating)||r.rating<0||r.rating>10)fail();ids.add(r.reviewId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedAt)||isNaN(new Date(r.reviewedAt))||new Date(r.reviewedAt).toISOString().slice(0,10)!==r.reviewedAt)fail();
  if(typeof r.content!=='string'||r.content.length>20000||(r.response!=null&&(typeof r.response!=='string'||r.response.length>20000)))fail();
  if(r.responseAt!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.responseAt)||isNaN(new Date(r.responseAt))||new Date(r.responseAt).toISOString().slice(0,10)!==r.responseAt))fail();
  return {reviewId:r.reviewId,rating:r.rating,ratingMax:10,reviewedAt:r.reviewedAt,author:String(r.author||'').slice(0,200),title:String(r.title||'').slice(0,500),content:r.content,response:r.response||null,responseAt:r.responseAt||null,translation:r.translation?String(r.translation).slice(0,200):null};
 });
 return {source:p.source,propertyId:p.propertyId,method:p.method,status:'success',capturedAt:capturedAt.toISOString(),summary:summary?{rating:summary.rating,ratingMax:10,count:summary.count}:null,reviews};
}
