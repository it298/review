import {validateOtaResult} from '../../backend/src/ota-validation.js';
// Integrations supply a documented normalized feed. No OTA API endpoint is guessed.
export async function feed(target,kind){
 const prefix=`OTA_${target.source.toUpperCase()}_${kind.toUpperCase()}`;
 const address=process.env[prefix+'_URL'];if(!address)throw Object.assign(new Error('unconfigured'),{code:'unconfigured'});
 const u=new URL(address);const hosts=(process.env.OTA_FEED_ALLOWED_HOSTS||'').split(',');
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.includes(u.hostname))throw Object.assign(new Error('Feed host is not allowed'),{code:'invalid_data'});
 u.searchParams.set('propertyId',target.property_id);
 let response;try{response=await fetch(u,{redirect:'error',headers:process.env[prefix+'_TOKEN']?{Authorization:'Bearer '+process.env[prefix+'_TOKEN']}:{},signal:AbortSignal.timeout(20000)});}catch{throw Object.assign(new Error('Feed unavailable'),{code:'network'});}
 if(!response.ok)throw Object.assign(new Error('Feed failed'),{code:'network'});
 const data=await response.json();if(data.source!==target.source||data.propertyId!==target.property_id)throw Object.assign(new Error('Feed identity mismatch'),{code:'invalid_data'});
 const valid=validateOtaResult({...data,status:'success',method:kind});return {summary:valid.summary,reviews:valid.reviews,capturedAt:valid.capturedAt};
}
