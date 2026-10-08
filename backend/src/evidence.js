import {createHash} from 'node:crypto';
import {rpc} from './store.js';
import {vietnamDay} from './insights.js';
const bucket='review-tracker-evidence';
function config(){const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;const base=new URL(process.env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password||!secret)throw new Error('Invalid storage configuration');return {base,headers:{apikey:secret,...(!secret.startsWith('sb_secret_')?{Authorization:'Bearer '+secret}:{})}};}
async function storage(path,options={}){const {base,headers}=config();return fetch(new URL('/storage/v1/'+path,base),{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000),redirect:'error'});}
let bucketReady;
async function ensureBucket(){if(!bucketReady)bucketReady=storage('bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:2097152,allowed_mime_types:['image/png']})}).then(async r=>{if(!r.ok){const result=await r.json().catch(()=>({}));if(!/already exists|duplicate/i.test(result.message||result.error||''))throw new Error('Cannot initialize private evidence storage');}}).catch(e=>{bucketReady=null;throw e;});await bucketReady;}
export function pngInfo(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<67||bytes.length>2097152||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.toString('ascii',12,16)!=='IHDR'||bytes.toString('ascii',bytes.length-8,bytes.length-4)!=='IEND')throw Object.assign(new Error('Ảnh PNG không hợp lệ hoặc lớn hơn 2 MB.'),{status:400});
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width>5000||height>6000||width*height>20000000)throw Object.assign(new Error('Kích thước ảnh vượt giới hạn.'),{status:400});return {width,height};
}
export function needsEvidence(current,previous){return !previous||vietnamDay(current.attempted_at)!==vietnamDay(previous.attempted_at)||['rating','review_count','count_display','count_kind'].some(field=>current[field]!==previous[field]);}
export async function uploadEvidence(query,bytes){
 pngInfo(bytes);const source=query.source,entity=query.entity||'',property=query.property||'',date=new Date(query.captured);
 if(!['google','tripadvisor','agoda','booking','expedia','trip','traveloka','grab','shopee'].includes(source)||typeof entity!=='string'||entity.length>200||typeof property!=='string'||property.length>200||isNaN(date)||Date.now()-date.getTime()>365*86400000||date.getTime()>Date.now()+300000)throw Object.assign(new Error('Mốc ảnh không hợp lệ.'),{status:400});
 const context=await rpc('review_tracker_evidence_context',{p_entity:entity,p_source:source,p_property:property,p_captured:date.toISOString()});if(!context)throw Object.assign(new Error('Ảnh chưa có mốc lịch sử đã xác minh tương ứng.'),{status:409});
 const existing=await rpc('review_tracker_evidence_object',{p_id:context.id});if(existing)return {ok:true,historyId:context.id,existing:true};
 const previous=await rpc('review_tracker_evidence_previous',{p_id:context.id});if(!needsEvidence(context,previous))return {ok:true,historyId:context.id,skipped:'unchanged_today'};
 const hash=createHash('sha256').update(bytes).digest('hex'),path=hash+'.png';await ensureBucket();
 const r=await storage('object/'+bucket+'/'+path,{method:'POST',headers:{'Content-Type':'image/png','x-upsert':'false'},body:bytes});
 if(!r.ok){const result=await r.json().catch(()=>({}));if(!/already exists|duplicate/i.test(result.message||result.error||''))throw new Error('Cannot store verified evidence image');}
 await rpc('review_tracker_evidence_save',{p_id:context.id,p_path:path,p_hash:hash,p_bytes:bytes.length});return {ok:true,historyId:context.id};
}
export async function downloadEvidence(id){const object=await rpc('review_tracker_evidence_object',{p_id:id});if(!object)throw Object.assign(new Error('Mốc này chưa có ảnh kiểm chứng.'),{status:404});if(!/^[a-f0-9]{64}\.png$/.test(object.object_path))throw new Error('Invalid object identity');const r=await storage('object/'+bucket+'/'+object.object_path);if(!r.ok)throw new Error('Cannot read private evidence image');return Buffer.from(await r.arrayBuffer());}
