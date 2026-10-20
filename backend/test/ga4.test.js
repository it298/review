import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,createPublicKey} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {GA4_SITES,GA4_METRICS,createGa4Client,normalizeGa4,readGa4} from '../src/modules/ga4/service.js';
import {ga4Cron} from '../src/modules/ga4/auto-sync.js';
import {createGa4Router} from '../src/modules/ga4/router.js';
import {startGa4OAuth,finishGa4OAuth,ga4AccessToken,disconnectGa4,ga4OAuthStatus,GA4_CONNECTION_KEY,ANALYTICS_SCOPE} from '../src/modules/ga4/oauth.js';
import {encryptTokens,decryptTokens} from '../src/google.js';
const raw=(daily=false,values=[10,8,4,12,7,30,96])=>({metricHeaders:GA4_METRICS.map(name=>({name})),dimensionHeaders:daily?[{name:'date'}]:[],rowCount:1,rows:[{dimensionValues:daily?[{value:'20261015'}]:[],metricValues:values.map(value=>({value:String(value)}))}],metadata:{timeZone:'Asia/Ho_Chi_Minh'}});
test('GA4 keeps stream isolation, signs read-only service JWT, caches token and does not trust credential token_uri',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});let exchanges=0,reports=0;
 const client=createGa4Client({readCredentials:()=>({client_email:'test@project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'}),token_uri:'https://evil.invalid'}),fetcher:async(url,options)=>{
  if(url==='https://oauth2.googleapis.com/token'){exchanges++;const assertion=options.body.get('assertion'),parts=assertion.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.scope,'https://www.googleapis.com/auth/analytics.readonly');assert.equal(claims.aud,'https://oauth2.googleapis.com/token');assert.equal(claims.exp-claims.iat,3600);assert.ok(verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey(publicKey.export({type:'spki',format:'pem'})),Buffer.from(parts[2],'base64url')));return new Response(JSON.stringify({access_token:'PRIVATE_TOKEN',expires_in:3600}));}
  assert.match(url,/^https:\/\/analyticsdata.googleapis.com\/v1beta\/properties\/559356291:runReport$/);reports++;const body=JSON.parse(options.body);assert.equal(body.dimensionFilter.filter.fieldName,'streamId');assert.equal(body.dimensionFilter.filter.stringFilter.value,GA4_SITES[0].streamId);assert.equal(options.headers.Authorization,'Bearer PRIVATE_TOKEN');return new Response(JSON.stringify(raw(body.dimensions.length>0)));
 }});await Promise.all([client.report(GA4_SITES[0],'2026-10-15','2026-10-16',false),client.report(GA4_SITES[0],'2026-10-15','2026-10-16',true)]);assert.equal(exchanges,1);assert.equal(reports,2);
});
test('GA4 validates metric headers, duplicates, missing values and negative counts; period unique users are not daily sums',async()=>{
 assert.equal(normalizeGa4(raw(),'2026-10-15','2026-10-16').rows[0].totalUsers,10);
 assert.deepEqual(normalizeGa4({metricHeaders:raw().metricHeaders},'2026-10-15','2026-10-16').rows,[]);
 for(const bad of [{}, {...raw(),rowCount:2},{...raw(),metricHeaders:[]},raw(false,[-1,2,3,4,5,6,7])])assert.throws(()=>normalizeGa4(bad,'2026-10-15','2026-10-16'));
 const duplicate=raw(true);duplicate.rows.push(duplicate.rows[0]);duplicate.rowCount=2;assert.throws(()=>normalizeGa4(duplicate,'2026-10-15','2026-10-16',true));
 const saved=new Map(),deps={get:async k=>saved.get(k),save:async p=>saved.set(p.p_key,p.p_value),client:{report:async(_s,_f,_t,daily)=>raw(daily)}};
 const report=await readGa4(GA4_SITES[0].key,'2026-10-15','2026-10-16',true,deps);assert.equal(report.report.totals.totalUsers,10);assert.equal(saved.size,1);assert.equal((await readGa4(GA4_SITES[1].key,'2026-10-15','2026-10-16',false,deps)).report,null);
 await assert.rejects(()=>readGa4(GA4_SITES[0].key,'2026-10-15','2026-10-16',true,{...deps,client:{report:async()=>({})}}));assert.equal(saved.size,1);assert.equal([...saved.values()][0].totals.totalUsers,10);
 await assert.rejects(()=>readGa4('unknown','2026-10-15','2026-10-16',false,deps));
});
test('GA4 provider errors are sanitized and cannot reveal service account keys or raw Google error',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const client=createGa4Client({readCredentials:()=>({client_email:'test@project.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})}),fetcher:async url=>url.includes('oauth2')?new Response(JSON.stringify({access_token:'PRIVATE_TOKEN',expires_in:3600})):new Response(JSON.stringify({error:{message:'PRIVATE_TOKEN SECRET'}}),{status:403})});await assert.rejects(()=>client.report(GA4_SITES[0],'2026-10-15','2026-10-16',false),e=>e.status===403&&!e.message.includes('SECRET')&&!e.message.includes('PRIVATE_TOKEN'));
});
test('GA4 automatic reports retry failures, mark only complete success and keep exact 7/30/month ranges',async()=>{
 const saved=new Map(),ranges=[],deps={now:new Date('2026-10-19T02:00:00Z'),enabled:true,get:async k=>saved.get(k),save:async p=>saved.set(p.p_key,p.p_value),run:async(from,to)=>{ranges.push([from,to]);return {ok:true};}};
 assert.equal((await ga4Cron({...deps,run:async()=>({ok:false})})).ok,false);assert.equal(saved.size,0);await ga4Cron(deps);assert.deepEqual(ranges,[['2026-10-12','2026-10-18'],['2026-09-19','2026-10-18'],['2026-10-01','2026-10-18']]);assert.equal((await ga4Cron(deps)).reason,'already_synced');
});
test('GA4 routes deny write to member/viewer and reject invalid filters before external access',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={role:req.headers['x-role']||'member'};next();});app.use(createGa4Router());app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{for(const role of ['viewer','member'])for(const endpoint of ['sync','connect','disconnect'])assert.equal((await fetch(base+'/'+endpoint,{method:'POST',headers:{'x-role':role}})).status,403);assert.equal((await fetch(base+'/report?siteKey=unknown&from=2026-10-15&to=2026-10-16')).status,400);assert.equal((await fetch(base+'/report?siteKey=quy-nhon-sea-hotel&from=2026-02-30&to=2026-10-16')).status,400);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('GA4 OAuth uses existing client and callback, read-only scope, one-use PKCE state, encrypted isolated storage and refresh rotation',async()=>{
 const env={...process.env},original=global.fetch,store=new Map();let exchanges=0,refreshes=0;
 Object.assign(process.env,{GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'SECRET',GOOGLE_REDIRECT_URI:'https://api.example.com/auth/google/callback',FRONTEND_URL:'https://app.example.com',TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,1).toString('base64'),SUPABASE_URL:'https://oauth-db.test',SUPABASE_SECRET_KEY:'sb_secret_test'});
 global.fetch=async(input,options={})=>{const url=String(input);let result;
  if(url.startsWith('https://oauth-db.test/')){const name=url.split('/').at(-1),p=JSON.parse(options.body||'{}');switch(name){
   case 'review_tracker_kv_set':store.set(p.p_key,p.p_value);break;
   case 'review_tracker_kv_take':result=store.get(p.p_key)||null;store.delete(p.p_key);break;
   case 'review_tracker_kv_get':result=store.get(p.p_key)||null;break;
   case 'review_tracker_marketing_set':assert.equal(p.p_key,GA4_CONNECTION_KEY);assert.ok(!JSON.stringify(p.p_value).includes('REFRESH_SECRET'));store.set(p.p_key,p.p_value);break;
   case 'review_tracker_kv_delete':store.delete(p.p_key);break;
   case 'review_tracker_lock':result=true;break;
   case 'review_tracker_unlock':break;
   default:throw Error('Unexpected database call');}
  }else{assert.equal(url,'https://oauth2.googleapis.com/token');const p=new URLSearchParams(options.body);assert.equal(p.get('client_secret'),'SECRET');if(p.get('grant_type')==='authorization_code'){exchanges++;assert.ok(p.get('code_verifier'));assert.equal(p.get('redirect_uri'),process.env.GOOGLE_REDIRECT_URI);result={access_token:'ACCESS_SECRET',refresh_token:'REFRESH_SECRET',expires_in:3600,scope:ANALYTICS_SCOPE};}else{refreshes++;assert.equal(p.get('refresh_token'),'REFRESH_SECRET');result={access_token:'NEXT_ACCESS',refresh_token:'ROTATED',expires_in:3600};}}
  return new Response(JSON.stringify(result??null));
 };
 try{const url=new URL(await startGa4OAuth());assert.equal(url.searchParams.get('scope'),ANALYTICS_SCOPE);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('access_type'),'offline');const query={state:url.searchParams.get('state'),code:'CODE'};assert.match(query.state,/^ga4_/);assert.equal(await finishGa4OAuth(query),'connected');assert.equal(exchanges,1);await assert.rejects(()=>finishGa4OAuth(query));assert.equal(exchanges,1);assert.equal(await ga4AccessToken(),'ACCESS_SECRET');assert.equal(refreshes,0);
  const record=store.get(GA4_CONNECTION_KEY);const tokens=decryptTokens(record.payload);store.set(GA4_CONNECTION_KEY,{payload:encryptTokens({...tokens,expires_at:1})});assert.equal(await ga4AccessToken(),'NEXT_ACCESS');assert.equal(refreshes,1);assert.equal(decryptTokens(store.get(GA4_CONNECTION_KEY).payload).refresh_token,'ROTATED');assert.deepEqual(await ga4OAuthStatus(),{oauthConfigured:true,oauthConnected:true});assert.ok(!JSON.stringify(await ga4OAuthStatus()).includes('SECRET'));await disconnectGa4();await assert.rejects(()=>ga4AccessToken());assert.equal((await ga4OAuthStatus()).oauthConnected,false);
 }finally{global.fetch=original;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
