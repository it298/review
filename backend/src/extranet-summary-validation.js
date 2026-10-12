import {validatePublicSummary} from './public-summary-validation.js';
export function validateExtranetSummary(p){
 const fail=()=>{throw Object.assign(new Error('Thống kê Extranet không hợp lệ.'),{status:400});};
 if(!p||!['traveloka','tripadvisor'].includes(p.source)||p.method!=='extranet-auto'||!/^[-a-z0-9]{1,200}$/.test(p.entityKey)||!/^\d{1,30}$/.test(p.extranetPropertyId))fail();
 const base={entityKey:p.entityKey,source:p.source,extranetPropertyId:p.extranetPropertyId,method:'extranet-auto',collectionContext:p.source+'-extranet'};
 if(p.status==='failed')return {...base,status:'failed',error:['login_required','network','blocked','invalid_data'].includes(p.error)?p.error:'invalid_data'};
 if(p.source==='traveloka'&&(p.rating==null||p.reviewCount==null)||p.source==='tripadvisor'&&(p.reviewCount==null||p.rating==null&&p.reviewCount!==0))fail();
 const validated=validatePublicSummary({...p,method:'dom',resolvedUrl:p.sourceUrl});
 if(p.source==='tripadvisor'&&!p.sourceUrl.includes('-d'+p.extranetPropertyId+'-'))fail();
 return {...validated,...base};
}
