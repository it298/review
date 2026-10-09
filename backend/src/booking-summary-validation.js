import {publicSourceIdentity} from './public-summary-validation.js';
export function validateBookingSummary(p){
 const fail=()=>{throw Object.assign(new Error('Thống kê Booking Extranet không hợp lệ.'),{status:400});};
 if(!p||p.source!=='booking'||p.method!=='dom'||!/^[-a-z0-9]{1,200}$/.test(p.entityKey)||!/^\d{1,30}$/.test(p.extranetPropertyId))fail();
 const base={entityKey:p.entityKey,source:'booking',method:'dom',extranetPropertyId:p.extranetPropertyId,collectionContext:'booking-extranet'};
 if(p.status==='failed')return {...base,status:'failed',error:['network','login_required','invalid_data','blocked'].includes(p.error)?p.error:'invalid_data'};
 const date=new Date(p.capturedAt);let sourceToken;
 try{sourceToken=publicSourceIdentity('booking',p.sourceUrl);}catch{fail();}
 if(!sourceToken||p.status!=='success'||isNaN(date)||date.getTime()<Date.now()-86400000||date.getTime()>Date.now()+300000||!Number.isFinite(p.rating)||p.rating<0||p.rating>10||!Number.isSafeInteger(p.reviewCount)||p.reviewCount<0)fail();
 // No portal URL, session parameter, guest detail or browser credential is stored.
 return {...base,status:'success',sourceUrl:p.sourceUrl,sourceToken,rating:p.rating,ratingMax:10,reviewCount:p.reviewCount,countKind:'reviews',capturedAt:date.toISOString()};
}
