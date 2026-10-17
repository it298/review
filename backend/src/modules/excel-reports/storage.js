import {createHash,randomUUID} from 'node:crypto';
import {lock} from '../../store.js';
const bucket='vjh-management-reports';
const fail=(message,status=503)=>Object.assign(new Error(message),{status});
async function request(path,options={}){
 const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||!process.env.SUPABASE_URL)throw fail('Chưa cấu hình nơi lưu báo cáo.');
 const base=new URL(process.env.SUPABASE_URL);if(base.protocol!=='https:')throw fail('Cấu hình nơi lưu chưa hợp lệ.');
 return fetch(new URL('/storage/v1/'+path,base),{...options,headers:{apikey:secret,...(!secret.startsWith('sb_secret_')?{Authorization:'Bearer '+secret}:{}),...options.headers},signal:AbortSignal.timeout(25000),redirect:'error'});
}
async function ensureBucket(){
 const existing=await request('bucket/'+bucket);
 if(existing.ok){const info=await existing.json();if(info.public!==false)throw fail('Kho báo cáo phải là riêng tư.');return;}
 if(existing.status!==404&&existing.status!==400)throw fail('Chưa truy cập được kho báo cáo.');
 const created=await request('bucket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:false,file_size_limit:10485760,allowed_mime_types:['application/json','application/octet-stream']})});
 if(!created.ok){const again=await request('bucket/'+bucket);if(!again.ok||(await again.json()).public!==false)throw fail('Không tạo được kho báo cáo riêng tư.');}
}
const activePath=(unit,month,family)=>unit+'/active/'+month+'--'+family+'.json';
async function read(path){const r=await request('object/'+bucket+'/'+path);if(r.status===404)return null;if(r.status===400){const body=await r.json().catch(()=>null);if(/(?:object|bucket|resource).*(?:not found|does not exist)|NoSuchKey|NoSuchBucket/i.test(body?.message||body?.error||body?.code||''))return null;throw fail('Không đọc được báo cáo đã lưu.');}if(!r.ok)throw fail('Không đọc được báo cáo đã lưu.');return r.json();}
async function put(path,bytes,mime){const r=await request('object/'+bucket+'/'+path,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'true'},body:bytes});if(!r.ok)throw fail('Chưa lưu được báo cáo; số đang xem chưa được cập nhật.');}
export const readReport=(unit,month,family)=>read(activePath(unit,month,family));
export async function saveReport(report,bytes,actor){
 await ensureBucket();const path=activePath(report.unit,report.month,report.family),release=await lock('management-report:'+path,180);
 if(!release)throw fail('Cơ sở này đang tải báo cáo, thử lại sau.',409);
 try{
  const previous=await read(path),hash=createHash('sha256').update(bytes).digest('hex');
  if(previous?.hash===hash)return {record:previous,unchanged:true};
  const id=randomUUID();
  const record={...report,id,hash,uploadedAt:new Date().toISOString(),uploadedBy:actor};
  const json=Buffer.from(JSON.stringify(record));if(json.length>5*1024*1024)throw fail('Báo cáo phân tích vượt 5 MB; chia file nhỏ hơn.',400);
  // Publish only after both the original file and immutable analysis have been saved.
  await put(report.unit+'/original/'+hash+'.bin',bytes,'application/octet-stream');
  await put(report.unit+'/history/'+report.month+'--'+report.family+'--'+id+'.json',json,'application/json');
  await put(path,json,'application/json');return {record,unchanged:false,replaced:Boolean(previous)};
 }finally{await release();}
}
export function summaryRecord(r){return {...r,sheets:r.sheets.map(({sourceRows,...s})=>({...s,sourceRowCount:sourceRows?.length||s.sourceRowCount||0})),issues:r.issues.slice(0,200),issueCount:r.issues.length};}
export async function listReports(units,month){
 // Reading non-existent snapshots yields an empty state, never a fabricated zero.
 const result=[];let cursor=0;const jobs=units.flatMap(u=>['cash','business'].map(family=>({unit:u.key,family})));
 await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){const j=jobs[cursor++];const r=await readReport(j.unit,month,j.family);if(r)result.push(summaryRecord(r));}}));return result;
}
