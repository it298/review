import {configuredBookingTargets,runBookingSummaries} from './booking-summary.js';
import {readFile} from 'node:fs/promises';
const base=new URL(process.env.TRACKER_API_URL),token=process.env.OTA_WORKER_SECRET;
if(base.protocol!=='https:'||base.username||base.password||!token||token.length<24)throw new Error('Configure the local worker environment.');
async function request(path,body){const r=await fetch(new URL(path,base),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Backend rejected Booking worker request ('+r.status+').');return r.json();}
const ids=process.argv.find(a=>a.startsWith('--property='))?.slice(11)||process.env.BOOKING_EXTRANET_PROPERTY_IDS;
const dryRun=process.argv.includes('--dry-run');
// An explicit local target file supports read-only verification before backend deploy.
const file=process.argv.find(a=>a.startsWith('--targets-file='))?.slice(15);
if(file&&!dryRun)throw new Error('Local target files are only allowed for dry runs.');
const targets=configuredBookingTargets(file?JSON.parse(await readFile(file,'utf8')):await request('/api/booking/worker/targets'),ids);
const results=await runBookingSummaries({request,targets,dryRun});if(results.some(r=>r.status==='failed'))process.exitCode=1;
