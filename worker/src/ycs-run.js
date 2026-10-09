import {configuredYcsTargets,runYcsSummaries} from './ycs-summary.js';
import {setTimeout as delay} from 'node:timers/promises';
const base=new URL(process.env.TRACKER_API_URL),token=process.env.OTA_WORKER_SECRET;
if(base.protocol!=='https:'||base.username||base.password||!token||token.length<24)throw new Error('Configure TRACKER_API_URL and OTA_WORKER_SECRET in worker/.env.');
async function request(path,body){const response=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Backend rejected the worker request ('+response.status+').');return response.json();}
const ids=process.argv.find(arg=>arg.startsWith('--property='))?.slice(11)||process.env.AGODA_YCS_PROPERTY_IDS;
const dryRun=process.argv.includes('--dry-run'),daemon=process.argv.includes('--daemon'),minutes=Number(process.env.OTA_INTERVAL_MINUTES||60);
if(!Number.isFinite(minutes)||minutes<15)throw new Error('Minimum interval: 15 minutes.');
const abort=new AbortController();process.once('SIGINT',()=>abort.abort());
do{
 try{
  const targets=configuredYcsTargets(await request('/api/ota/worker/targets'),ids);
  const results=await runYcsSummaries({request,targets,dryRun});
  if(!dryRun&&results.some(result=>result.status==='success'))await request('/api/insights/worker/report',{}).catch(()=>{});
  if(results.some(result=>result.status==='failed')&&!daemon)process.exitCode=1;
 }catch{console.error('YCS worker could not complete this cycle. Check configuration, connection and whether the YCS login window is still open.');if(!daemon)process.exitCode=1;}
 if(!daemon||abort.signal.aborted)break;
 console.log('YCS next refresh in '+minutes+' minutes. Keep this terminal and Windows running.');
 await delay(minutes*60000,undefined,{signal:abort.signal}).catch(()=>{});
}while(!abort.signal.aborted);
