import {browserAdapters} from './browser.js';
import {collect} from './pipeline.js';
import {feed} from './feeds.js';
import {validateOtaResult} from '../../backend/src/ota-validation.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {runGoogleSummaries} from './google-summary.js';
import {runPublicSummaries} from './public-summary.js';
import {publishEvidence} from './evidence.js';
import {configuredYcsTargets,runYcsSummaries} from './ycs-summary.js';
import {configuredBookingTargets,runBookingSummaries} from './booking-summary.js';
const dryRun=process.argv.includes('--dry-run');
const endpoint=process.env.TRACKER_API_URL,token=process.env.OTA_WORKER_SECRET;
if(!dryRun&&(!endpoint||!token||token.length<24))throw new Error('Set TRACKER_API_URL and OTA_WORKER_SECRET (24+ characters)');
const base=endpoint?new URL(endpoint):null;if(base&&(base.protocol!=='https:'||base.username||base.password))throw new Error('Invalid backend URL');
async function request(path,body,contentType='application/json'){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':contentType},body:body?(contentType==='image/png'?body:JSON.stringify(body)):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Backend rejected worker request ('+r.status+')');return r.json();}
if(process.argv.includes('--check-config')){await request('/api/ota/worker/targets');await request('/api/google/worker/targets');await request('/api/public/worker/targets');console.log('Worker authenticated successfully for OTA, Google and public source summaries.');process.exit(0);}
async function run(){
 const sourceFilter=process.argv.find(s=>s.startsWith('--source='))?.slice(9);
 const entityKey=process.argv.find(s=>s.startsWith('--entity='))?.slice(9),propertyId=process.argv.find(s=>s.startsWith('--property='))?.slice(11);
 let registered,ycsTargets=[],bookingTargets=[];
 if(process.env.BOOKING_EXTRANET_ENABLED==='true'||sourceFilter==='booking-extranet'){
  try{bookingTargets=configuredBookingTargets(await request('/api/booking/worker/targets'),process.env.BOOKING_EXTRANET_PROPERTY_IDS);}
  catch(e){if(sourceFilter==='booking-extranet')throw e;console.error('Booking Extranet targets unavailable; other source collectors continue.');}
  if(!sourceFilter||['booking','booking-extranet'].includes(sourceFilter)){
   const selected=bookingTargets.filter(t=>(!entityKey||t.entity_key===entityKey)&&(!propertyId||t.extranet_property_id===propertyId));
   if(!selected.length&&sourceFilter==='booking-extranet')throw new Error('No configured Booking Extranet target matches the selected property.');
   if(selected.length)try{await runBookingSummaries({request,targets:selected,dryRun});}catch(e){console.error('Booking Extranet browser could not complete this cycle; keeping previous values.');if(sourceFilter==='booking-extranet')throw e;}
  }
  if(sourceFilter==='booking-extranet')return;
 }
 if(process.env.AGODA_YCS_ENABLED==='true'||sourceFilter==='ycs'){
  registered=await request('/api/ota/worker/targets');
  ycsTargets=configuredYcsTargets(registered,process.env.AGODA_YCS_PROPERTY_IDS);
  if(!sourceFilter||['agoda','ycs'].includes(sourceFilter)){
   const selected=ycsTargets.filter(t=>(!entityKey||t.hotel_key===entityKey)&&(!propertyId||t.property_id===propertyId));
   if(!selected.length)throw new Error('No configured YCS target matches the requested property.');
   try{await runYcsSummaries({request,targets:selected,dryRun});}catch(e){console.error('YCS browser could not complete this cycle; keeping previous values.');if(sourceFilter==='ycs')throw e;}
  }
  if(sourceFilter==='ycs')return;
 }
 if(!sourceFilter||sourceFilter!=='google'){
  try{await runPublicSummaries({request,dryRun,sourceFilter:sourceFilter==='public'?undefined:sourceFilter,entityKey,excludeTargets:[...ycsTargets,...bookingTargets.map(t=>({...t,hotel_key:t.entity_key}))]});}catch(e){console.error('Public summary cycle failed: '+e.message);if(sourceFilter&&!['agoda','trip','traveloka'].includes(sourceFilter))throw e;}
  if(sourceFilter&&!['google','agoda','trip','traveloka'].includes(sourceFilter))return;
 }
 if(!sourceFilter||sourceFilter==='google'){
  try{await runGoogleSummaries({request,dryRun,entityKey:process.argv.find(s=>s.startsWith('--entity='))?.slice(9)});}catch(e){if(sourceFilter==='google')throw e;console.error('Google summary cycle failed; continuing OTA collection.');}
  if(sourceFilter==='google')return;
 }
 let targets=dryRun?JSON.parse(await readFile(new URL('../targets.example.json',import.meta.url),'utf8')):registered||await request('/api/ota/worker/targets');const chosen=sourceFilter;if(chosen)targets=targets.filter(t=>t.source===chosen);if(propertyId)targets=targets.filter(t=>t.property_id===propertyId);if(entityKey)targets=targets.filter(t=>t.hotel_key===entityKey);targets=targets.filter(t=>!ycsTargets.some(y=>y.source===t.source&&y.property_id===t.property_id));const method=process.argv.find(s=>s.startsWith('--method='))?.slice(9);if(method&&!['api','dom','ocr','email'].includes(method))throw new Error('Invalid collection method');if(!targets.length){if(ycsTargets.length)return;throw new Error('No matching targets');}const browser=browserAdapters();
 try{for(const target of targets){const result=await collect(target,{api:t=>feed(t,'api'),dom:browser.dom,ocr:browser.ocr,email:t=>feed(t,'email')},method?[method]:undefined);const valid=validateOtaResult(result);if(dryRun){const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence');await mkdir(dir,{recursive:true});await writeFile(resolve(dir,target.source+'-dry-run.json'),JSON.stringify({...result,valid},null,2));}else{await request('/api/ota/worker/results',valid);const evidence=browser.evidence(target);if(evidence?.method===valid.method&&evidence.capturedAt===valid.capturedAt)await publishEvidence(request,valid,evidence.bytes);}console.log(JSON.stringify({source:target.source,propertyId:target.property_id,status:valid.status,summary:valid.summary,reviews:valid.reviews?.length||0,attempts:result.attempts,dryRun}));}}
 finally{await browser.close();}
}
const delay=Number(process.env.OTA_INTERVAL_MINUTES||60);if(!Number.isFinite(delay)||delay<15)throw new Error('Minimum interval: 15 minutes');
do{try{await run();if(!dryRun)await request('/api/insights/worker/report',{}).catch(e=>console.error('Weekly report refresh pending: '+e.message));}catch(e){console.error(e.message);if(!process.argv.includes('--daemon'))process.exitCode=1;}if(!process.argv.includes('--daemon'))break;await new Promise(r=>setTimeout(r,delay*60000));}while(true);
