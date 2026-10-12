import {browserAdapters} from './browser.js';
import {collectReviewBatch} from './review-reader.js';
import {mkdir,open,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const base=new URL(process.env.TRACKER_API_URL),secret=process.env.OTA_WORKER_SECRET;
if(base.protocol!=='https:'||base.username||base.password||!secret||secret.length<24)throw Error('Configure worker environment.');
const daemon=process.argv.includes('--daemon'),dryRun=process.argv.includes('--dry-run');
const selected=process.argv.find(v=>v.startsWith('--source='))?.slice(9),entity=process.argv.find(v=>v.startsWith('--entity='))?.slice(9);
if(selected&&!['agoda','trip'].includes(selected))throw Error('Available individual readers: agoda, trip.');
const minutes=Number(process.env.REVIEW_INTERVAL_MINUTES||process.env.OTA_INTERVAL_MINUTES||60);
if(!Number.isFinite(minutes)||minutes<15)throw Error('Minimum refresh interval is 15 minutes.');
async function request(path,body){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Backend HTTP '+r.status);return r.json();}
const dir=fileURLToPath(new URL('../evidence/',import.meta.url));await mkdir(dir,{recursive:true});
const lockFile=dir+'individual-reviews-daemon.lock';let lock;
if(daemon){lock=await open(lockFile,'wx');await lock.writeFile(String(process.pid));}
let stopped=false,wake;const stop=()=>{stopped=true;wake?.();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{do{
 const browser=browserAdapters();let saved=0;
 try{
  const targets=(await request('/api/ota/worker/targets')).filter(t=>['agoda','trip'].includes(t.source)&&(!selected||selected===t.source)&&(!entity||entity===t.hotel_key));
  if(!targets.length)throw Error('No registered target matches.');
  for(const target of targets){if(stopped)break;try{
   const p=await collectReviewBatch(target,browser.dom);
   const outcome=dryRun?{status:'dry-run'}:await request('/api/reviews/worker/results',p);
   if(outcome.status==='success')saved++;
   console.log(JSON.stringify({worker:'individual-reviews',entity:target.hotel_key,source:target.source,reviews:p.reviews.length,...outcome}));
  }catch(e){console.error(JSON.stringify({worker:'individual-reviews',entity:target.hotel_key,source:target.source,status:'not_read',reason:['blocked','unavailable','unconfigured'].includes(e.code)?e.code:'verification_failed'}));}}
  if(saved)await request('/api/insights/worker/report',{}).catch(()=>console.error('Report refresh pending.'));
 }catch{console.error('Review worker cannot complete this cycle; no empty baselines created.');if(!daemon)process.exitCode=1;}
 finally{await browser.close();}
 console.log(JSON.stringify({worker:'individual-reviews',cycleFinishedAt:new Date().toISOString(),saved,nextRefreshMinutes:daemon?minutes:null}));
 if(!daemon||stopped)break;
 await new Promise(done=>{const timer=setTimeout(done,minutes*60000);wake=()=>{clearTimeout(timer);done();};});wake=null;
}while(!stopped);}finally{await lock?.close();if(lock)await unlink(lockFile);process.off('SIGINT',stop);process.off('SIGTERM',stop);}
