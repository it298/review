// Upload only verified card PNGs paired with their original observation time.
// Diagnostic, blocked-page and login screenshots are never uploaded.
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence'),base=new URL(process.env.TRACKER_API_URL),token=process.env.OTA_WORKER_SECRET;
if(base.protocol!=='https:'||base.username||base.password||!token)throw new Error('Invalid worker configuration');
let uploaded=0,existing=0,unchanged=0,unmatched=0,skipped=0;
for(const folder of [dir,resolve(dir,'public-summary')])for(const name of (await readdir(folder).catch(()=>[])).sort()){
 if(!name.endsWith('.json')||/diagnostic|failed|blocked|dry-run|audit/.test(name))continue;
 let p,bytes;try{const data=JSON.parse(await readFile(resolve(folder,name),'utf8'));p=data.payload||data;if(!p.capturedAt||(!p.entityKey&&!p.propertyId)||!(p.status==='success'&&(p.entityKey||p.verified))) {skipped++;continue;}bytes=await readFile(resolve(folder,name.replace(/\.json$/,'.png')));}catch{skipped++;continue;}
 if(bytes.length>2097152){skipped++;continue;}
 const query=new URLSearchParams({source:p.source||'google',captured:p.capturedAt,...(p.entityKey?{entity:p.entityKey}:{property:p.propertyId})});
 const response=await fetch(new URL('/api/evidence/worker/upload?'+query,base),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'image/png'},body:bytes,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(response.ok){const result=await response.json();if(result.skipped)unchanged++;else if(result.existing)existing++;else uploaded++;}else if(response.status===409)unmatched++;else throw new Error('Evidence synchronization failed ('+response.status+').');
}
console.log(JSON.stringify({uploaded,existing,unchanged,unmatched,skipped}));
