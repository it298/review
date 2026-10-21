// Isolated fixtures: no Meta access token and no production connection.
import {chromium} from '../worker/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const build=resolve('frontend/dist/meta-ads-qa');
execFileSync(process.execPath,[resolve('frontend/node_modules/vite/bin/vite.js'),'build','--configLoader','native','--outDir','dist/meta-ads-qa'],{cwd:resolve('frontend'),env:{...process.env,VITE_API_URL:'https://ads-qa.local'},stdio:'pipe'});
const browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true});
const errors=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:950}});let syncs=0;
 await context.addInitScript(()=>{sessionStorage.setItem('vjh-session','fixture');sessionStorage.setItem('workspace-module','marketing');sessionStorage.setItem('marketing-tab','ads');window.qaFiles=[];const create=URL.createObjectURL;URL.createObjectURL=function(blob){window.qaFiles.push(blob);return create.call(this,blob);};HTMLAnchorElement.prototype.click=function(){window.qaFilename=this.download;};});
 const report=(from,to)=>({accountId:'337065855108233',accountName:'Vista QA',currency:'VND',timeZone:'Asia/Ho_Chi_Minh',from,to,capturedAt:'2026-10-21T04:00:00Z',attribution:'Theo tài khoản quảng cáo',summary:{spend:3000,reach:100,impressions:200,clicks:20,frequency:2,ctr:10,cpc:150,thruplays:10,conversations:3},campaigns:[{id:'1',name:'=QA video',status:'ACTIVE',spend:1000,reach:80,impressions:100,thruplays:10,conversations:null},{id:'2',name:'QA tin nhắn',status:'PAUSED',spend:2000,reach:80,impressions:100,conversations:3}]});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),path=u.pathname;if(path.startsWith('/api/')){let json={};if(path==='/api/auth/config')json={mode:'password'};else if(path==='/api/session')json={user:{id:'fixture',name:'Ads QA',role:'admin'}};else if(path==='/api/insights')json={alerts:[]};else if(path==='/api/meta-ads/status')json={accountId:'337065855108233',configured:true};else if(path==='/api/meta-ads/report')json={report:report(u.searchParams.get('from'),u.searchParams.get('to'))};else if(path==='/api/meta-ads/sync'){syncs++;assert.equal(req.method(),'POST');if(syncs===2)return route.fulfill({status:502,json:{error:'Token Meta Ads hết hạn. Cập nhật token trên backend.'}});const body=req.postDataJSON();json={report:report(body.from,body.to)};}return route.fulfill({json});}if(u.hostname!=='ads-qa.local')return route.fulfill({body:'',contentType:'text/css'});const p=resolve(build,u.pathname.startsWith('/assets/')||u.pathname.startsWith('/fonts/')?'.'+u.pathname:'index.html');return route.fulfill({body:await readFile(p),contentType:{'.js':'application/javascript','.css':'text/css','.woff2':'font/woff2'}[extname(p)]||'text/html'});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://ads-qa.local/');
 await page.getByRole('heading',{name:'Meta Ads · Quảng cáo',exact:true}).waitFor();await page.locator('.meta-ads-section tbody tr').first().waitFor();
 const kpi=label=>page.locator('.meta-ads-section .marketing-kpis .panel').filter({has:page.getByText(label,{exact:true})}).locator('strong');
 assert.equal(await kpi('Người tiếp cận').innerText(),'100');assert.equal(await kpi('Số tiền đã chi tiêu').innerText(),'3.000 VND');
 await page.getByLabel('Tìm chiến dịch Meta Ads',{exact:true}).fill('video');assert.equal(await page.locator('.meta-ads-section tbody tr').count(),1);
 await page.getByRole('button',{name:'Xuất CSV quảng cáo',exact:true}).click();await page.waitForFunction(()=>window.qaFiles.length===1);const csv=await page.evaluate(()=>window.qaFiles[0].text());assert.ok(csv.includes("'=QA video"));assert.ok(!csv.includes('QA tin nhắn'));
 await page.getByLabel('Tìm chiến dịch Meta Ads',{exact:true}).fill('');await page.getByRole('button',{name:'Cập nhật Meta Ads',exact:true}).click();await page.getByRole('button',{name:'Cập nhật Meta Ads',exact:true}).waitFor();assert.equal(syncs,1);
 await page.getByRole('button',{name:'Cập nhật Meta Ads',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await kpi('Số tiền đã chi tiêu').innerText(),'3.000 VND');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:resolve('frontend/dist/meta-ads-'+width+'.png'),fullPage:true});
 await page.getByRole('button',{name:'7 ngày hoàn tất',exact:true}).click();await page.locator('.meta-ads-section tbody tr').first().waitFor();
 await context.close();
 }assert.deepEqual(errors,[]);console.log('PASS: account-level reach, independent result metrics, campaign filter, safe CSV, sync, retained report on error, period reload, desktop/mobile.');
}finally{await browser.close();}
