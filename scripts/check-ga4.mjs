// Isolated browser → existing Express API → GA4 fixture → PostgreSQL marketing store.
// Does not read live credentials or change production data.
import {chromium} from '../worker/node_modules/playwright/index.mjs';
import express from '../backend/node_modules/express/index.js';
import {PGlite} from '../backend/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createApp} from '../backend/src/app.js';
import {GA4_SITES,GA4_METRICS} from '../backend/src/modules/ga4/service.js';
import {GA4_CONNECTION_KEY,ANALYTICS_SCOPE} from '../backend/src/modules/ga4/oauth.js';
const originalFetch=global.fetch,env={...process.env},db=new PGlite(),errors=[];let browser,server,requests=0,failStream=false;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
try{
 execFileSync(process.execPath,[resolve('frontend/node_modules/vite/bin/vite.js'),'build','--configLoader','native','--outDir','dist/ga4-qa-build'],{cwd:resolve('frontend'),env:{...process.env,VITE_API_URL:'https://ga4-qa.local'},stdio:'pipe'});
 await db.exec('create role anon; create role authenticated; create role service_role; create table public.review_tracker_kv(key text primary key,value jsonb,expires_at timestamptz);');await db.exec(await readFile('supabase/marketing-module.sql','utf8'));
 Object.assign(process.env,{AUTH_MODE:'password',APP_PASSWORD:'fixture-private-password',SUPABASE_URL:'https://ga4-db.test',SUPABASE_SECRET_KEY:'sb_secret_fixture',GOOGLE_CLIENT_ID:'qa-client',GOOGLE_CLIENT_SECRET:'qa-secret',GOOGLE_REDIRECT_URI:'https://ga4-qa.local/api/google/callback',FRONTEND_URL:'https://ga4-qa.local',TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64'),GA4_AUTO_SYNC:'true'});delete process.env.GA4_SERVICE_ACCOUNT_JSON;
 global.fetch=async(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname==='ga4-db.test'){const args=JSON.parse(options.body||'{}'),name=url.pathname.split('/').at(-1);
   if(name==='review_tracker_lock'||name==='review_tracker_unlock')return json(true);
   if(name==='review_tracker_kv_set'){await db.query("insert into public.review_tracker_kv(key,value,expires_at) values($1,$2::jsonb,now()+($3*interval '1 second')) on conflict(key) do update set value=excluded.value,expires_at=excluded.expires_at",[args.p_key,JSON.stringify(args.p_value),args.p_seconds]);return json(null);}
   if(name==='review_tracker_kv_take')return json((await db.query('delete from public.review_tracker_kv where key=$1 and expires_at>now() returning value',[args.p_key])).rows[0]?.value||null);
   if(name==='review_tracker_state')return json({places:{},snapshots:[]});
   if(name==='review_tracker_kv_get')return json((await db.query('select value from public.review_tracker_kv where key=$1 and expires_at>now()',[args.p_key])).rows[0]?.value||null);
   if(name==='review_tracker_marketing_set'){await db.query('select public.review_tracker_marketing_set($1,$2::jsonb)',[args.p_key,JSON.stringify(args.p_value)]);return json(null);}
   return json({});
  }
  if(url.hostname==='oauth2.googleapis.com')return json({access_token:'PRIVATE_QA_TOKEN',refresh_token:'PRIVATE_QA_REFRESH',expires_in:3600,scope:ANALYTICS_SCOPE});
  if(url.hostname==='analyticsdata.googleapis.com'){
   requests++;assert.equal(options.headers.Authorization,'Bearer PRIVATE_QA_TOKEN');const body=JSON.parse(options.body),stream=body.dimensionFilter.filter.stringFilter.value;assert.equal(body.dimensionFilter.filter.fieldName,'streamId');assert.ok(GA4_SITES.some(s=>s.streamId===stream));
   if(failStream&&stream===GA4_SITES[1].streamId)return json({error:{message:'SECRET_PROVIDER_ERROR'}},403);
   const daily=body.dimensions.length>0,start=body.dateRanges[0].startDate.replaceAll('-',''),second=new Date(Date.parse(body.dateRanges[0].startDate)+86400000).toISOString().slice(0,10).replaceAll('-','');
   return json({metricHeaders:GA4_METRICS.map(name=>({name})),dimensionHeaders:daily?[{name:'date'}]:[],rowCount:daily?2:1,rows:(daily?[start,second]:[null]).map(date=>({dimensionValues:date?[{value:date}]:[],metricValues:(daily?[70,60,40,80,50,120,600]:[100,90,60,160,100,240,1200]).map(value=>({value:String(value)}))})),metadata:{timeZone:'Asia/Ho_Chi_Minh'}});
  }
  return originalFetch(input,options);
 };
 const app=express();app.use(express.static(resolve('frontend/dist/ga4-qa-build')));app.use(createApp());server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;process.env.GOOGLE_REDIRECT_URI=base+'/api/google/callback';process.env.FRONTEND_URL=base;
 browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true});
 async function open(role='admin',width=1500){const context=await browser.newContext({viewport:{width,height:1000}});await context.addInitScript(()=>{sessionStorage.setItem('vjh-session','fixture');sessionStorage.setItem('workspace-module','marketing');const create=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type.startsWith('text/csv'))window.qaCsv=blob.text();return create.call(this,blob);};});await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.hostname==='accounts.google.com'){console.log('OAuth fixture: reached consent route');assert.equal(url.searchParams.get('scope'),ANALYTICS_SCOPE);return route.fulfill({status:302,headers:{Location:process.env.GOOGLE_REDIRECT_URI+'?'+new URLSearchParams({state:url.searchParams.get('state'),code:'fixture-code'})}});}
 if(url.pathname==='/api/google/callback')console.log('OAuth fixture: reached callback');if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:'fixture',name:'QA',role},mode:'password'}});const r=await global.fetch(base+url.pathname+url.search,{redirect:'manual',method:req.method(),headers:{Authorization:'Bearer fixture-private-password','Content-Type':req.headers()['content-type']||'application/json'},body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});await route.fulfill({status:r.status,headers:{'Content-Type':r.headers.get('content-type')||'text/plain',...(r.headers.get('location')?{Location:r.headers.get('location')}:{})},body:Buffer.from(await r.arrayBuffer())});});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('heading',{name:'Tiếp cận website theo mẫu báo cáo',exact:true}).waitFor();return page;}
 const page=await open();await page.getByRole('button',{name:'Kết nối Google Analytics',exact:true}).click();await page.getByText('Đã kết nối quyền đọc Google Analytics. Bấm Cập nhật website để lấy số liệu thật.',{exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log('OAuth fixture diagnostic',page.url(),await page.locator('body').innerText(),errors);throw e;});await page.getByRole('button',{name:'Cập nhật website',exact:true}).click();await page.getByText('Đã lưu 3/3 website.',{exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log('GA4 diagnostic',await page.locator('.ga4-section').innerText(),'requests',requests,errors);throw e;});assert.equal(requests,6);await page.getByText('Đang đọc báo cáo website đã lưu…').waitFor({state:'hidden'});
 const section=page.locator('.ga4-section');assert.match(await section.locator('.marketing-kpis').innerText(),/Người truy cập website\s+100/);assert.equal((await db.query('select count(*)::int n from public.review_tracker_kv where key<>$1',[GA4_CONNECTION_KEY])).rows[0].n,3);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất CSV website',exact:true}).click();assert.match((await download).suggestedFilename(),/^ga4-quy-nhon-sea-hotel-/);const csv=await page.evaluate(()=>window.qaCsv);assert.ok(csv.includes('Google Analytics Data API'));assert.ok(csv.includes('"Người truy cập website","100"'));assert.ok(!csv.includes('PRIVATE_QA_TOKEN'));
 await section.screenshot({path:'frontend/dist/ga4-desktop-qa.png'});await page.reload();await page.locator('.ga4-section .marketing-kpis').waitFor();assert.equal(requests,6);
 failStream=true;await page.getByRole('button',{name:'Cập nhật website',exact:true}).click();await page.getByText(/Đã lưu 2\/3 website/).waitFor();await page.getByLabel('Website GA4',{exact:true}).selectOption(GA4_SITES[1].key);await section.locator('.marketing-kpis').waitFor();assert.ok(!(await section.innerText()).includes('SECRET_PROVIDER_ERROR'));assert.equal((await db.query('select count(*)::int n from public.review_tracker_kv where key<>$1',[GA4_CONNECTION_KEY])).rows[0].n,3);
 const mobile=await open('viewer',390);await mobile.locator('.ga4-section .marketing-kpis').waitFor();assert.equal(await mobile.getByRole('button',{name:'Cập nhật website',exact:true}).isDisabled(),true);await mobile.locator('.ga4-section').screenshot({path:'frontend/dist/ga4-mobile-qa.png'});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,checks:['browser OAuth callback and encrypted persistence','stream isolation','actual Express to SQL persistence','period unique users not daily sum','reload without provider requests','CSV generation and filename','partial errors preserve history','viewer and mobile layout']}));
}finally{global.fetch=originalFetch;if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.close();for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
