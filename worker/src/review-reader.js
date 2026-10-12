import {validateReviewBatch} from '../../backend/src/review-alerts.js';
// Public review readers operate separately from summary/OCR collection.
// Never establish an empty baseline after a failed or missing review panel.
export async function collectReviewBatch(target,dom,now=new Date()){
 if(!['agoda','trip'].includes(target.source))throw Object.assign(new Error('Individual reader not configured'),{code:'unconfigured'});
 const result=await dom(target);
 if(!Array.isArray(result.reviews)||!result.reviews.length)throw Object.assign(new Error('Individual reviews were not read'),{code:'unavailable'});
 return validateReviewBatch({entityKey:target.hotel_key,source:target.source,sourceUrl:target.source_url,method:'dom',capturedAt:now.toISOString(),reviews:result.reviews.map(r=>({...r,ratingMax:10}))},now);
}
