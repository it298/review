import {readFile,mkdir,open,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {configuredTravelokaTargets,runTravelokaSummaries} from './traveloka-summary.js';
const dryRun=process.argv.includes('--dry-run'),daemon=process.argv.includes('--daemon');
const file=process.argv.find(v=>v.startsWith('--targets-file='))?.slice(15);
if(file&&!dryRun)throw new Error('Local targets are allowed only for read-only verification.');
const base=new URL(process.env.TRACKER_API_URL),token=process.env.OTA_WORKER_SECRET;
if(base.protocol!=='https:'||base.username||base.password||!token||token.length<24)throw new Error('Configure local worker environment.');
async function request(path,body){const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)throw Object.assign(new Error('Traveloka backend HTTP '+response.status),{status:response.status});return response.json();}
const minutes=Number(process.env.OTA_INTERVAL_MINUTES||60);if(!Number.isFinite(minutes)||minutes<15)throw new Error('Minimum refresh interval is 15 minutes.');
const logDir=fileURLToPath(new URL('../evidence/',import.meta.url));await mkdir(logDir,{recursive:true});
const lockFile=logDir+'traveloka-daemon.lock';let lock;
if(daemon){try{lock=await open(lockFile,'wx');await lock.writeFile(String(process.pid));}catch{throw new Error('Traveloka daemon already owns its lock. Close the existing worker before restarting.');}}
let stopped=false,wake;
const stop=()=>{stopped=true;wake?.();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{do{let waitMs=minutes*60000;
 try{const registered=file?JSON.parse(await readFile(file,'utf8')):await request('/api/extranet/worker/targets');
  const targets=configuredTravelokaTargets(registered,process.env.TRAVELOKA_EXTRANET_PROPERTY_IDS);
  const results=await runTravelokaSummaries({targets,request,dryRun});
  if(!dryRun&&results.some(r=>r.saved))await request('/api/insights/worker/report',{}).catch(()=>console.error('Report refresh pending.'));
  if(results.some(r=>r.status==='failed')){if(!daemon)process.exitCode=1;console.error('Some properties require login or page verification.');}
  console.log(JSON.stringify({worker:'traveloka-extranet',cycleFinishedAt:new Date().toISOString(),nextRefreshMinutes:daemon?minutes:null,saved:results.filter(r=>r.saved).length}));
 }catch(error){console.error(error.status===404?'Traveloka backend is awaiting deployment; no writes attempted.':error.status?'Traveloka backend HTTP '+error.status:error.code?'Traveloka configuration/session: '+error.code:'Traveloka browser/profile unavailable; previous values preserved.');waitMs=60000;if(!daemon)process.exitCode=1;}
 if(!daemon||stopped)break;await new Promise(done=>{const timer=setTimeout(done,waitMs);wake=()=>{clearTimeout(timer);done();};});wake=null;
}while(!stopped);}finally{await lock?.close();if(lock)await unlink(lockFile);process.off('SIGINT',stop);process.off('SIGTERM',stop);}
