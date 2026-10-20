// Isolated browser → existing Express API → Meta fixture → PostgreSQL RPCs.
// No production endpoints, credentials or records are used.
import {chromium} from '../worker/node_modules/playwright/index.mjs';
import express from '../backend/node_modules/express/index.js';
import {PGlite} from '../backend/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createApp} from '../backend/src/app.js';
import {FACEBOOK_HOTELS} from '../backend/src/modules/facebook/hotels.js';
import {calendarDate} from '../backend/src/utils/date.js';
import {shiftDate} from '../backend/src/modules/facebook/dates.js';
const nativeFetch=global.fetch,db=new PGlite(),env={...process.env},errors=[];
const today=calendarDate(),yesterday=shiftDate(today,-1),before=shiftDate(today,-2),kv=new Map();let accounts=0,failPage=false,browser,server;
const json=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
try{
 // Keep the QA API origin out of the normal production build.
 execFileSync(process.execPath,[resolve('frontend/node_modules/vite/bin/vite.js'),'build','--configLoader','native','--outDir','dist/facebook-qa-build'],{cwd:resolve('frontend'),env:{...process.env,VITE_API_URL:'https://facebook-qa.local'},stdio:'pipe'});
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');await db.exec(await readFile('supabase/facebook-module.sql','utf8'));await db.exec(await readFile('supabase/facebook-report-extension.sql','utf8'));
 Object.assign(process.env,{AUTH_MODE:'password',APP_PASSWORD:'facebook-fixture-password',SUPABASE_URL:'https://facebook-db.test',SUPABASE_SECRET_KEY:'sb_secret_fixture',META_USER_ACCESS_TOKEN:'USER_SECRET_FIXTURE',META_API_VERSION:'v26.0',FACEBOOK_AUTO_SYNC:'true'});
 global.fetch=async(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname==='facebook-db.test'){
   const args=JSON.parse(options.body||'{}'),name=url.pathname.split('/').at(-1);
   if(name==='review_tracker_lock')return json(true);if(name==='review_tracker_unlock')return json(true);
   if(name==='review_tracker_kv_get')return json(kv.get(args.p_key)||null);if(name==='review_tracker_kv_set'){kv.set(args.p_key,args.p_value);return json(null);}
   if(['review_tracker_facebook_read','review_tracker_facebook_upsert','review_tracker_facebook_report'].includes(name))return json((await db.query(`select public.${name}($1::jsonb) as value`,[JSON.stringify(args.p)])).rows[0].value);
   return json({alerts:[],places:[],reviews:[],summary:{}});
  }
  if(url.hostname==='graph.facebook.com'){
   assert.ok(!url.searchParams.has('access_token'));
   if(url.pathname.endsWith('/me/accounts')){accounts++;assert.equal(options.headers.Authorization,'Bearer USER_SECRET_FIXTURE');return json({data:FACEBOOK_HOTELS.map(h=>({id:h.page_id,name:h.hotel_name,access_token:'PAGE_SECRET_'+h.page_id}))});}
   const id=url.pathname.split('/')[2];assert.equal(options.headers.Authorization,'Bearer PAGE_SECRET_'+id);
   if(failPage&&id===FACEBOOK_HOTELS[2].page_id)return new Response(JSON.stringify({error:{code:190,message:'PAGE_SECRET_'+id}}),{status:400});
   if(url.pathname.endsWith('/insights'))return json({data:url.searchParams.get('metric').split(',').map((name,i)=>({name,period:'day',values:[{value:100+i*50,end_time:yesterday+'T07:00:00+0000'},{value:110+i*50,end_time:today+'T07:00:00+0000'}]}))});
   if(url.pathname.endsWith('/published_posts'))return json({data:[{id:id+'_1',created_time:yesterday+'T08:00:00+0000'}]});
   return json({id,name:FACEBOOK_HOTELS.find(h=>h.page_id===id).hotel_name,followers_count:8210,fan_count:8000});
  }
  return nativeFetch(input,options);
 };
 for(const hotel of FACEBOOK_HOTELS)await db.query('select public.review_tracker_facebook_upsert($1::jsonb)',[JSON.stringify({hotel,days:[],snapshot:{snapshot_date:yesterday,followers_count:8194,fan_count:7990}})]);
 const app=express();app.use(express.static(resolve('frontend/dist/facebook-qa-build')));app.use(createApp());server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true});
 async function open(role='admin',width=1580){const context=await browser.newContext({viewport:{width,height:1000}});await context.addInitScript(()=>{sessionStorage.setItem('vjh-session','fixture');sessionStorage.setItem('workspace-module','facebook');});
  await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname==='/api/session')return route.fulfill({json:{user:{id:'fixture',name:'Facebook QA',role},mode:'password'}});
   const res=await global.fetch(base+url.pathname+url.search,{method:req.method(),headers:{Authorization:'Bearer facebook-fixture-password','Content-Type':req.headers()['content-type']||'application/json'},body:['GET','HEAD'].includes(req.method())?undefined:req.postData()});await route.fulfill({status:res.status,headers:{'Content-Type':res.headers.get('content-type')||'text/plain'},body:Buffer.from(await res.arrayBuffer())});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://facebook-qa.local/');await page.getByRole('heading',{name:'Facebook Analytics',exact:true}).waitFor({timeout:15000}).catch(async e=>{console.log('Browser diagnostic:',await page.locator('body').innerText(),errors);throw e;});return page;
 }
 const page=await open();console.log('Opened merged Marketing dashboard fixture');assert.equal(await page.getByRole('navigation',{name:'Kênh marketing'}).count(),1);assert.equal(await page.locator('.module-nav').getByRole('button',{name:'Facebook Analytics',exact:true}).count(),0);await page.getByRole('button',{name:'Cập nhật Facebook',exact:true}).click();await page.getByText(/Đã lưu 5\/5 Page/).waitFor({timeout:15000}).catch(async e=>{console.log('Sync diagnostic:',await page.locator('body').innerText());throw e;});assert.equal(accounts,1);await page.getByText('Đang đọc dữ liệu đã lưu…').waitFor({state:'hidden'});assert.equal(await page.locator('.facebook-hotels .panel').count(),1);assert.ok((await page.locator('.facebook-hotels').innerText()).includes('+16'));assert.ok(!(await page.locator('body').innerText()).includes('SECRET'));
 assert.equal((await db.query('select count(*)::int as n from public.review_tracker_facebook_daily')).rows[0].n,10);assert.equal((await db.query('select count(*)::int as n from public.review_tracker_facebook_followers')).rows[0].n,10);
 await page.getByRole('button',{name:'7 ngày',exact:true}).click();await page.getByText('Đang đọc dữ liệu đã lưu…').waitFor({state:'hidden'});await page.getByLabel('Khách sạn Facebook',{exact:true}).selectOption(FACEBOOK_HOTELS[1].hotel_key);await page.getByRole('heading',{name:'Lịch sử follower · '+FACEBOOK_HOTELS[1].hotel_name}).waitFor();await page.screenshot({path:'frontend/dist/facebook-desktop-qa.png',fullPage:true});
 const report=page.locator('.facebook-period');await report.getByText('Nhập bổ sung hoặc tải báo cáo Excel',{exact:true}).click();await report.getByLabel('Click liên kết trong kỳ bổ sung',{exact:true}).fill('42');await report.getByLabel('Nguồn báo cáo Facebook',{exact:true}).fill('QA period source');await report.getByRole('button',{name:'Lưu số liệu bổ sung',exact:true}).click();await report.getByText('Nguồn: QA period source',{exact:false}).waitFor();assert.equal((await db.query('select count(*)::int n from public.review_tracker_facebook_period_reports')).rows[0].n,1);
 await report.getByRole('button',{name:'Xuất báo cáo CSV',exact:true}).click();
 // Optional read-only verification of the user's original Excel format. Save only into this isolated fixture DB.
 if(process.env.FACEBOOK_QA_WORKBOOK){await report.getByLabel('File báo cáo tiếp cận Facebook',{exact:true}).setInputFiles(process.env.FACEBOOK_QA_WORKBOOK);const options=report.getByLabel('Kỳ Facebook trong file',{exact:true});await options.waitFor();assert.equal(await options.locator('option').count(),104);await report.getByRole('button',{name:'Lưu kỳ báo cáo đang chọn',exact:true}).click();await report.getByText(/Đã lưu báo cáo Excel:/).waitFor();assert.equal((await db.query('select count(*)::int n from public.review_tracker_facebook_period_reports')).rows[0].n,2);}
 await page.reload();await page.getByText('Đang đọc dữ liệu đã lưu…').waitFor({state:'hidden'});await page.getByText('+16',{exact:true}).first().waitFor();assert.equal(accounts,1);
 failPage=true;await page.getByRole('button',{name:'Cập nhật Facebook',exact:true}).click();await page.getByText(/Đã lưu 4\/5 Page/).waitFor();assert.equal(accounts,2);assert.ok(!(await page.locator('body').innerText()).includes('SECRET'));assert.equal((await db.query('select count(*)::int as n from public.review_tracker_facebook_daily')).rows[0].n,10);
 const mobile=await open('viewer',390);await mobile.getByText('Đang đọc dữ liệu đã lưu…').waitFor({state:'hidden'});assert.equal(await mobile.getByRole('button',{name:'Cập nhật Facebook',exact:true}).isDisabled(),true);assert.equal(await mobile.getByRole('button',{name:'Lưu số liệu bổ sung',exact:true}).count(),0);await mobile.screenshot({path:'frontend/dist/facebook-mobile-qa.png',fullPage:true});assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,accountsCalls:accounts,dailyRows:10,snapshots:10,checks:['actual API + PostgreSQL persistence','reload without Meta call','partial Page failure preserves history','+16 follower delta','hotel and date controls','viewer disabled sync','desktop/mobile layout','no browser errors or leaked secrets']}));
}finally{
 global.fetch=nativeFetch;if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.close();for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);
}
