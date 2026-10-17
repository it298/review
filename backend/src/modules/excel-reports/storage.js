import {createHash,randomUUID} from 'node:crypto';
import {lock} from '../../store.js';
import {normalizeManagementReport,validMonth} from '../../../../shared/excel-dashboard.js';
const bucket='vjh-management-reports';
const writeLock='management-reports:write';
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
export const readReport=async(unit,month,family)=>normalizeManagementReport(await read(activePath(unit,month,family)));
export async function saveReport(report,bytes,actor){
 const release=await lock(writeLock,300);if(!release)throw fail('Báo cáo đang được cập nhật hoặc xóa; thử lại sau.',409);
 try{
  await ensureBucket();const path=activePath(report.unit,report.month,report.family);
  const previous=await read(path),hash=createHash('sha256').update(bytes).digest('hex');
  if(previous?.hash===hash)return {record:normalizeManagementReport(previous),unchanged:true};
  const id=randomUUID();
  const record={...report,id,hash,uploadedAt:new Date().toISOString(),uploadedBy:actor};
  const json=Buffer.from(JSON.stringify(record));if(json.length>5*1024*1024)throw fail('Báo cáo phân tích vượt 5 MB; chia file nhỏ hơn.',400);
  // Publish only after both the original file and immutable analysis have been saved.
  await put(report.unit+'/original/'+hash+'.bin',bytes,'application/octet-stream');
  await put(report.unit+'/history/'+report.month+'--'+report.family+'--'+id+'.json',json,'application/json');
  await put(path,json,'application/json');return {record,unchanged:false,replaced:Boolean(previous)};
 }finally{await release();}
}
// Only this dedicated private bucket is affected. Gather every key before deleting any.
export async function deleteAllReports(){
 const release=await lock(writeLock,300);if(!release)throw fail('Báo cáo đang được cập nhật hoặc xóa; thử lại sau.',409);
 const deadline=Date.now()+240000;let deletedObjects=0;
 const checkTime=()=>{if(Date.now()>deadline)throw fail('Lượt xóa chưa hoàn tất do quá thời gian. Làm mới lịch sử rồi thử xóa lại.');};
 async function collect(){const folders=[''],files=new Set();let pages=0;
  for(let n=0;n<folders.length;n++){const prefix=folders[n];let offset=0;
   for(;;){checkTime();if(++pages>500)throw fail('Kho báo cáo quá lớn cho một lượt xóa. Liên hệ quản trị hệ thống.');const r=await request('object/list/'+bucket,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix,limit:1000,offset,sortBy:{column:'name',order:'asc'}})});
    if(!r.ok){const e=await r.json().catch(()=>null);if(r.status===404||r.status===400&&/bucket.*(?:not found|does not exist)/i.test(e?.message||e?.error||''))return [];throw fail('Chưa đọc đủ danh sách để xóa báo cáo. Thử lại sau.');}
    const rows=await r.json();if(!Array.isArray(rows))throw fail('Danh sách báo cáo chưa hợp lệ; dừng xóa.');
    for(const row of rows){const name=typeof row.name==='string'?(prefix&&row.name.startsWith(prefix+'/')?row.name.slice(prefix.length+1):row.name):'';if(!name||name.includes('/')||name.includes('\\')||name==='.'||name==='..')throw fail('Đường dẫn báo cáo chưa hợp lệ; dừng xóa.');const key=prefix?prefix+'/'+name:name;
     if(row.id!=null||row.metadata!=null){files.add(key);if(files.size>10000)throw fail('Kho báo cáo vượt giới hạn 10.000 tệp cho một lượt xóa.');}else{if(folders.includes(key))throw fail('Danh sách thư mục báo cáo bị lặp.');folders.push(key);}
    }
    if(rows.length<1000)break;offset+=rows.length;
   }
  }return [...files];
 }
 try{
  const keys=(await collect()).sort((a,b)=>Number(b.includes('/active/'))-Number(a.includes('/active/'))||a.localeCompare(b));
  for(let i=0;i<keys.length;i+=1000){checkTime();const batch=keys.slice(i,i+1000),r=await request('object/'+bucket,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:batch})});if(!r.ok)throw fail('Xóa báo cáo chưa hoàn tất. Làm mới lịch sử rồi thử xóa lại.');deletedObjects+=batch.length;}
  if((await collect()).length)throw fail('Vẫn còn tệp báo cáo chưa xóa. Làm mới lịch sử rồi thử lại.');return {deletedObjects};
 }catch(e){if(deletedObjects)throw fail('Đã xử lý '+deletedObjects+' tệp nhưng chưa xác nhận xóa hết. Làm mới lịch sử và thử lại.');throw e;}
 finally{await release();}
}
export function summaryRecord(r){return {...r,sheets:r.sheets.map(({sourceRows,...s})=>({...s,sourceRowCount:sourceRows?.length||s.sourceRowCount||0})),issues:r.issues.slice(0,200),issueCount:r.issues.length};}
export async function listReports(units,month){
 // Reading non-existent snapshots yields an empty state, never a fabricated zero.
 const result=[];let cursor=0;const jobs=units.flatMap(u=>['cash','business'].map(family=>({unit:u.key,family})));
 await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){const j=jobs[cursor++];const r=await readReport(j.unit,month,j.family);if(r)result.push(summaryRecord(r));}}));return result;
}
// Discover published periods only; listing metadata avoids downloading every workbook snapshot.
export async function listSavedPeriods(units){
 const groups=new Map();let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,units.length)},async()=>{while(cursor<units.length){const unit=units[cursor++];let offset=0;
  for(;;){const response=await request('object/list/'+bucket,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:unit.key+'/active',limit:1000,offset,sortBy:{column:'name',order:'asc'}})});
   if(!response.ok){const error=await response.json().catch(()=>null);if(response.status===404||response.status===400&&/(?:bucket|resource).*(?:not found|does not exist)/i.test(error?.message||error?.error||''))break;throw fail('Chưa đọc được lịch sử báo cáo. Thử làm mới lịch sử.');}
   const objects=await response.json();if(!Array.isArray(objects))throw fail('Lịch sử báo cáo chưa có phản hồi hợp lệ.');
   for(const object of objects){const prefix=unit.key+'/active/',name=typeof object.name==='string'?(object.name.startsWith(prefix)?object.name.slice(prefix.length):object.name):'',match=name.match(/^(\d{4}-\d{2})--(cash|business)\.json$/);if(!match||!validMonth(match[1]))continue;const [,month,family]=match,key=unit.key+'|'+month,stamp=object.updated_at||object.created_at,updatedAt=stamp&&Number.isFinite(Date.parse(stamp))?new Date(stamp).toISOString():null;
    if(!groups.has(key))groups.set(key,{unit:unit.key,unitName:unit.name,month,families:[],updatedAt:null});const group=groups.get(key);if(!group.families.includes(family))group.families.push(family);if(updatedAt&&(!group.updatedAt||updatedAt>group.updatedAt))group.updatedAt=updatedAt;
   }
   if(objects.length<1000)break;offset+=objects.length;if(offset>=10000)throw fail('Lịch sử cơ sở quá lớn; cần thu hẹp danh mục báo cáo.');
  }
 }}));return [...groups.values()].map(g=>({...g,families:g.families.sort()})).sort((a,b)=>b.month.localeCompare(a.month)||(b.updatedAt||'').localeCompare(a.updatedAt||'')||a.unitName.localeCompare(b.unitName));
}
