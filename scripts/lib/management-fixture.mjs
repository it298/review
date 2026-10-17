// Isolated integration fixture. Never contacts production storage.
import {PGlite} from '../../backend/node_modules/@electric-sql/pglite/dist/index.js';
import express from '../../backend/node_modules/express/index.js';
import {readFile} from 'node:fs/promises';
import {createExcelReportsRouter} from '../../backend/src/modules/excel-reports/router.js';
import {once} from 'node:events';
export async function managementFixture(){
 const originalFetch=globalThis.fetch,env={...process.env},db=new PGlite(),objects=new Map(),locks=new Set(),sourceObjects=new Map(),googleRequests=[];let googleResponse=null,sourceBucket=false,bucket=false,failActive=false,failListing=false,deleteCalls=0,failDeleteAfter=null;
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');for(const f of ['finance-module.sql','finance-workflow.sql','finance-books.sql'])await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));await db.exec('set role service_role');
 const rpc=async p=>(await db.query('select public.review_tracker_finance($1::jsonb) result',[JSON.stringify(p)])).rows[0].result;
 for(const [actor,access] of [['member','editor'],['manager','manager'],['viewer','viewer']])await rpc({action:'scope',actor:'admin',admin:true,userId:actor,unit:'sontra-sea-hotel',access});
 process.env.SUPABASE_URL='https://management-storage-fixture.local';process.env.SUPABASE_SECRET_KEY='fixture';
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);if(u.hostname==='docs.google.com'||u.hostname.endsWith('.googleusercontent.com')){googleRequests.push({url:u.href,options});if(!googleResponse)throw Error('Unexpected Google request in fixture');return typeof googleResponse==='function'?googleResponse(u,options):googleResponse;}if(u.hostname!=='management-storage-fixture.local')return originalFetch(url,options);
  if(options.headers?.apikey!=='fixture')throw Error('Missing server authorization');
  if(u.pathname.startsWith('/rest/v1/rpc/')){const name=u.pathname.split('/').at(-1),args=JSON.parse(options.body);
   if(name==='review_tracker_finance')try{return Response.json(await rpc(args.p));}catch(e){return Response.json({code:'P0001',message:e.message},{status:400});}
   if(name==='review_tracker_lock'){if(locks.has(args.p_name))return Response.json(false);locks.add(args.p_name);return Response.json(true);}
   if(name==='review_tracker_unlock'){locks.delete(args.p_name);return Response.json(null);}
   throw Error('Unexpected RPC '+name);
  }
  if(u.pathname==='/storage/v1/bucket/vjh-report-sources')return sourceBucket?Response.json({public:false}):Response.json({message:'Bucket not found'},{status:404});
  if(u.pathname==='/storage/v1/bucket'&&options.method==='POST'&&JSON.parse(options.body).id==='vjh-report-sources'){sourceBucket=true;return Response.json({name:'vjh-report-sources'});}
  if(u.pathname.startsWith('/storage/v1/object/vjh-report-sources/')){const key=u.pathname.slice('/storage/v1/object/vjh-report-sources/'.length);if(options.method==='POST'){sourceObjects.set(key,Buffer.from(options.body));return Response.json({Key:key});}const data=sourceObjects.get(key);return data?new Response(data,{headers:{'Content-Type':'application/json'}}):Response.json({message:'Object not found'},{status:404});}
  if(u.pathname==='/storage/v1/bucket'&&options.method==='POST'){bucket=true;return Response.json({name:'vjh-management-reports'});}
  if(u.pathname==='/storage/v1/bucket/vjh-management-reports')return bucket?Response.json({public:false}):Response.json({message:'Bucket not found'},{status:404});
  if(u.pathname==='/storage/v1/object/list/vjh-management-reports'&&options.method==='POST'){
   if(failListing)return Response.json({message:'Listing unavailable'},{status:503});if(!bucket&&!objects.size)return Response.json({message:'Bucket not found'},{status:400});const {prefix,limit,offset}=JSON.parse(options.body),start=prefix?prefix.replace(/\/$/,'')+'/':'',items=new Map();for(const key of objects.keys()){if(!key.startsWith(start))continue;const tail=key.slice(start.length),name=tail.split('/')[0];if(!name)continue;if(tail.includes('/'))items.set(name,{name,id:null,metadata:null});else{let stamp;try{stamp=JSON.parse(objects.get(key)).uploadedAt;}catch{}items.set(name,{name,id:key,metadata:{size:objects.get(key).length},updated_at:stamp||'2026-10-17T00:00:00Z'});}}const rows=[...items.values()].sort((a,b)=>a.name.localeCompare(b.name)).map((r,i)=>({...r,name:i%2&&start?start+r.name:r.name}));return Response.json(rows.slice(offset,offset+limit));
  }
  if(u.pathname==='/storage/v1/object/vjh-management-reports'&&options.method==='DELETE'){if(failDeleteAfter!=null&&deleteCalls>=failDeleteAfter)return Response.json({message:'Delete unavailable'},{status:503});deleteCalls++;const {prefixes}=JSON.parse(options.body);if(prefixes.length>1000)throw Error('Oversized delete');const deleted=[];for(const key of prefixes){if(objects.delete(key))deleted.push({name:key});}return Response.json(deleted);}
  const prefix='/storage/v1/object/vjh-management-reports/';if(u.pathname.startsWith(prefix)){const key=u.pathname.slice(prefix.length);
   if(options.method==='POST'){if(failActive&&key.includes('/active/'))return Response.json({error:'fixture unavailable'},{status:503});objects.set(key,Buffer.from(options.body));return Response.json({Key:key});}
   const value=objects.get(key);return value?new Response(value,{headers:{'Content-Type':'application/json'}}):Response.json({message:'Object not found'},{status:404});
  }throw Error('Unexpected storage URL '+u.pathname);
 };
 const app=express();app.use(express.json());app.use((req,_res,next)=>{const id=String(req.headers.authorization||'Bearer admin').replace('Bearer ','');req.user={id,role:['admin','manager','viewer'].includes(id)?id:'member'};next();});
 app.get('/api/auth/config',(_req,res)=>res.json({mode:'supabase'}));app.get('/api/session',(req,res)=>res.json({ok:true,user:req.user,expiresAt:new Date(Date.now()+3600000).toISOString()}));app.get('/api/insights',(_req,res)=>res.json({alerts:[],daily:[],directory:[]}));
 app.use('/api/management-reports',createExcelReportsRouter());app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');return {app,origin:'http://127.0.0.1:'+server.address().port,fetch:originalFetch,objects,sourceObjects,googleRequests,setGoogleResponse:r=>{googleResponse=r;},rpc,db,locks,getDeleteCalls:()=>deleteCalls,setFailDeleteAfter:v=>{failDeleteAfter=v;},setFailActive:v=>{failActive=v;},setFailListing:v=>{failListing=v;},close:async()=>{await new Promise(r=>server.close(r));globalThis.fetch=originalFetch;process.env=env;await db.close();}};
}
