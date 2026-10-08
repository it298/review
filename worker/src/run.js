import {browserAdapters} from './browser.js';
import {collect} from './pipeline.js';
import {feed} from './feeds.js';
import {validateOtaResult} from '../../backend/src/ota-validation.js';
const endpoint=process.env.TRACKER_API_URL,token=process.env.OTA_WORKER_SECRET;
if(!endpoint||!token||token.length<24)throw new Error('Set TRACKER_API_URL and OTA_WORKER_SECRET (24+ characters)');
const base=new URL(endpoint);if(base.protocol!=='https:'||base.username||base.password)throw new Error('Invalid backend URL');
async function request(path,body){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Backend rejected worker request ('+r.status+')');return r.json();}
async function run(){
 const targets=await request('/api/ota/worker/targets');const browser=browserAdapters();
 try{for(const target of targets){const result=await collect(target,{api:t=>feed(t,'api'),dom:browser.dom,ocr:browser.ocr,email:t=>feed(t,'email')});const valid=validateOtaResult(result);await request('/api/ota/worker/results',valid);console.log(JSON.stringify({source:target.source,propertyId:target.property_id,status:valid.status,attempts:result.attempts}));}}
 finally{await browser.close();}
}
const delay=Number(process.env.OTA_INTERVAL_MINUTES||60);if(!Number.isFinite(delay)||delay<15)throw new Error('Minimum interval: 15 minutes');
do{try{await run();}catch(e){console.error(e.message);if(!process.argv.includes('--daemon'))process.exitCode=1;}if(!process.argv.includes('--daemon'))break;await new Promise(r=>setTimeout(r,delay*60000));}while(true);
