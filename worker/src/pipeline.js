import {validateOtaResult} from '../../backend/src/ota-validation.js';
export async function collect(target,adapters){
 const attempts=[];
 for(const method of ['api','dom','ocr','email']){
  try{
   const result=await adapters[method](target);
   if(!result)throw Object.assign(new Error('Not configured'),{code:'unconfigured'});
   const payload={...result,source:target.source,propertyId:target.property_id,method,status:'success',capturedAt:result.capturedAt||new Date().toISOString(),reviews:result.reviews||[]};
   validateOtaResult(payload);attempts.push({method,status:'success'});return {...payload,attempts};
  }catch(e){attempts.push({method,status:'failed',error:['blocked','unconfigured','network','invalid_data','browser_missing'].includes(e.code)?e.code:'invalid_data'});}
 }
 const error=['blocked','browser_missing','network','invalid_data','unconfigured'].find(code=>attempts.some(a=>a.error===code))||'invalid_data';
 return {source:target.source,propertyId:target.property_id,method:'dom',status:'failed',error,attempts};
}
