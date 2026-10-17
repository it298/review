// Offline UI fixtures only; no production API or financial data is modified.
import {chromium} from '../worker/node_modules/playwright/index.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const build=resolve('frontend/dist'),errors=[];
const directory=['Sontra Sea Hotel','Yzistel Hoi An','Đối thủ'].map((name,i)=>({entity_key:'p'+i,name,category:'hotel',relationship:i===2?'comparison':'managed',sources:[{source:'google',source_url:'https://maps.google.com/'},{source:'agoda'}]}));
const observations=i=>[100+i*80,110+i*80,108+i*80].map((review_count,j)=>({id:j+1,status:'success',review_count,rating:4.5+j*.1,rating_max:5,count_at:`2026-10-${14+j}T01:00:00Z`,rating_at:`2026-10-${14+j}T01:00:00Z`,count_kind:'reviews'}));
const daily=directory.flatMap((d,i)=>observations(i).map(o=>({entity_key:d.entity_key,source:'google',day:o.count_at.slice(0,10),review_count:o.review_count,count_kind:'reviews'})));
const hotels=[{id:5381,name:'Sontra Sea Hotel'},{id:6209,name:'Yzistel Hoi An'}];
const roomTypes=[{id:1,name:'Deluxe Double',occupied:12,empty:6,blocked:2,total:20,occupancyRate:66.67,daily:[{date:'2026-10-15',occupied:5,empty:4,blocked:1,total:10},{date:'2026-10-16',occupied:7,empty:2,blocked:1,total:10}]},{id:2,name:'Suite',occupied:6,empty:2,blocked:0,total:8,occupancyRate:75,daily:[{date:'2026-10-15',occupied:2,empty:2,blocked:0,total:4},{date:'2026-10-16',occupied:4,empty:0,blocked:0,total:4}]}];
const summary={occupied:18,empty:8,blocked:2,total:28,occupancyRate:69.23};
const browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true,downloadsPath:resolve(build,'qa-downloads')});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000},acceptDownloads:true});page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-17T05:00:00Z'));
 await page.addInitScript(()=>{sessionStorage.setItem('vjh-session','fixture');const create=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==='application/pdf')window.qaPdf=blob;return create.call(this,blob);};});
 await page.route('**/*',async route=>{const url=new URL(route.request().url()),p=url.pathname;let body=[];
  if(p.startsWith('/api/')){
   if(p==='/api/auth/config')body={mode:'supabase'};
   if(p==='/api/session')body={ok:true,user:{id:'qa',role:'admin',email:'qa@example.com'},expiresAt:'2026-10-17T06:00:00Z'};
   if(p==='/api/directory')body=directory;
   if(p==='/api/insights')body={alerts:[],daily,directory};
   if(p==='/api/places/dashboard-matrix')body={places:[{id:1,name:'Sontra Sea Hotel'}],dates:['2026-10-14','2026-10-16'],rows:[{date:'2026-10-14',values:{1:{reviews:100,rating:4.5}}},{date:'2026-10-16',values:{1:{reviews:108,rating:4.7}}}]};
   if(p==='/api/source-history'){const i=Number(url.searchParams.get('entity')?.slice(1)||0);body={observations:observations(i),runs:observations(i).map(o=>({...o,attempted_at:o.count_at}))};}
   if(p==='/api/bluejay/hotels')body=hotels;
   if(p==='/api/bluejay/status')body={configured:true,apiWindow:{allowed:false},syncLog:[],store:{}};
   if(p==='/api/bluejay/dashboard')body={meta:{from:'2026-10-15',to:'2026-10-16'},aggregate:{},hotels:hotels.map(hotel=>({hotel,ok:true,data:{summary,roomTypes}}))};
   if(p==='/api/marketing/status')body={connected:true,targets:[{id:'1',name:'Sontra Sea Hotel'}]};
   if(p==='/api/marketing/report')body={target:{name:'Sontra Sea Hotel'},report:{from:'2026-10-10',to:'2026-10-16',capturedAt:'2026-10-17T01:00:00Z',metrics:[{key:'WEBSITE_CLICKS',label:'Nhấp website',value:210,days:6}],days:Array.from({length:7},(_,i)=>({date:'2026-10-'+(10+i),WEBSITE_CLICKS:i===2?null:i===3?0:(i+1)*10}))}};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  }
  if(!['bluejay-qa.local','127.0.0.1'].includes(url.hostname))return route.fulfill({body:''});const file=p==='/'?'index.html':p.slice(1);return route.fulfill({body:await readFile(resolve(build,file)),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.ttf')?'font/ttf':'text/html'});
 });
 const arrows=async()=>{
  await page.locator('.circular-arrow-label').first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.circular-chart svg')].every(el=>el.viewBox.baseVal.width>=260));
  const ids=await page.locator('marker').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length);
 };
 const mobile=async()=>{await page.setViewportSize({width:390,height:844});await arrows();try{await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{},{timeout:3000});}catch(e){console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>({tag:el.tagName,cls:el.className?.baseVal??el.className,x:el.getBoundingClientRect().x,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).filter(e=>e.right>391&&e.width>0).slice(0,30)));await page.screenshot({path:resolve(build,'circular-mobile-overflow.png'),fullPage:true});throw e;}await page.setViewportSize({width:1500,height:1000});};
 const exportPdf=async file=>{const download=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất PDF xu hướng ngang',exact:true}).click();assert.match((await download).suggestedFilename(),/^xu-huong-google-.*\.pdf$/);const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await window.qaPdf.arrayBuffer())));assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');await writeFile(resolve(build,file),Buffer.from(bytes));};
 await page.goto('http://127.0.0.1:5189/');await page.getByRole('button',{name:'Blue Jay Analytics',exact:true}).click();await page.getByRole('button',{name:'Xem dữ liệu',exact:true}).click();await arrows();assert.equal(await page.locator('.bj-dashboard-charts .circular-card').count(),4);
 await page.getByRole('button',{name:'Tổng khách sạn',exact:true}).click();assert.equal(await page.locator('.bj-dashboard-charts .circular-card').count(),2);await page.getByLabel('Lọc khách sạn trên biểu đồ',{exact:true}).selectOption('5381');assert.equal(await page.locator('.bj-dashboard-charts .circular-card').count(),1);
 await page.getByText('Xem chi tiết theo loại phòng và ngày',{exact:true}).click();await page.getByLabel('Ngày biểu đồ công suất',{exact:true}).selectOption('2026-10-15');await page.screenshot({path:resolve(build,'circular-occupancy.png'),fullPage:true});await mobile();
 await page.getByRole('button',{name:'Theo dõi đánh giá',exact:true}).click();await arrows();await page.getByRole('button',{name:'So sánh chung',exact:true}).click();await arrows();await page.getByRole('button',{name:'Điểm số',exact:true}).click();assert.equal(await page.locator('.multi-trend-canvas .circular-chart').count(),2);
 await page.getByRole('button',{name:'Tổng đánh giá',exact:true}).click();await page.getByRole('button',{name:'Từng địa điểm',exact:true}).click();await arrows();await page.screenshot({path:resolve(build,'circular-reviews.png'),fullPage:true});await mobile();
 await page.getByRole('button',{name:'Phân tích',exact:true}).click();await page.getByRole('button',{name:'Biểu đồ & lịch sử',exact:true}).click();await arrows();await page.getByText('Tỷ trọng theo độ lớn tuyệt đối;',{exact:false}).waitFor();await page.getByRole('button',{name:'Tổng tích lũy',exact:true}).click();await arrows();await page.screenshot({path:resolve(build,'circular-history.png'),fullPage:true});await mobile();
 await page.getByRole('button',{name:'So sánh tốc độ tăng',exact:true}).click();await arrows();assert.equal(await page.locator('.history-chart .circular-chart').count(),2);
 await page.getByRole('button',{name:'Xu hướng địa điểm',exact:true}).click();await arrows();await exportPdf('circular-trend-qa.pdf');await page.getByRole('button',{name:'So sánh chung',exact:true}).click();await arrows();await exportPdf('circular-compare-qa.pdf');await page.getByRole('button',{name:'Điểm số',exact:true}).click();await arrows();await exportPdf('circular-rating-qa.pdf');
 await page.getByRole('button',{name:'Marketing & Tiếp cận',exact:true}).click();await arrows();await page.getByText('1 mục chưa có số liệu (—), chưa tính vào tỷ trọng.',{exact:true}).waitFor();await mobile();await page.screenshot({path:resolve(build,'circular-marketing.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Circular chart UI: occupancy hotel/room/day filters, review count/rating comparison, signed history, growth, marketing missing values, arrow IDs, mobile, and PDF export passed (offline fixtures).');
}finally{await browser.close();}

