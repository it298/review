export async function publishEvidence(request,payload,bytes){
 if(payload.status!=='success'||!bytes)return;
 if(bytes.length>2097152){console.error('Evidence card exceeds 2 MB; summary remains saved.');return;}
 const params=new URLSearchParams({source:payload.source||'google',captured:payload.capturedAt,...(payload.entityKey?{entity:payload.entityKey}:{property:payload.propertyId})});
 try{await request('/api/evidence/worker/upload?'+params,bytes,'image/png');}catch(e){console.error('Evidence upload pending: '+e.message);}
}
