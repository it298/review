// Isolated UI fixtures; never logs into accounts or writes production data.
import {chromium} from '../worker/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {normalizeReservations} from '../backend/src/modules/bluejay/normalize.js';
import ExcelJS from '../frontend/node_modules/exceljs/excel.js';
const build=resolve('frontend/dist/revenue-qa');
execFileSync(process.execPath,[resolve('frontend/node_modules/vite/bin/vite.js'),'build','--configLoader','native','--outDir','dist/revenue-qa'],{cwd:resolve('frontend'),env:{...process.env,VITE_API_URL:'https://revenue-qa.local'},stdio:'pipe'});
const browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true});
const errors=[],calls=[];
try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:950},acceptDownloads:true});
 await context.addInitScript(()=>{sessionStorage.setItem('vjh-session','fixture');sessionStorage.setItem('workspace-module','bluejay');window.qaFiles=[];const create=URL.createObjectURL;URL.createObjectURL=function(blob){window.qaFiles.push(blob);return create.call(this,blob);};HTMLAnchorElement.prototype.click=function(){window.qaFilename=this.download;};});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname;
  if(path.startsWith('/api/')){
   assert.equal(req.method(),'GET');let json={};
   if(path==='/api/auth/config')json={mode:'password'};
   else if(path==='/api/session')json={user:{id:'fixture',name:'Revenue QA',role:'admin'}};
   else if(path==='/api/insights')json={alerts:[]};
   else if(path==='/api/bluejay/hotels')json=[{id:5381,name:'Sontra QA'},{id:6836,name:'Gia Lai QA'}];
   else if(path==='/api/bluejay/status')json={apiWindow:{allowed:false},syncLog:[],store:{}};
   else if(path.endsWith('/reservations')){
    calls.push(u);assert.equal(u.searchParams.get('dateType'),'1');
    if(path.includes('/6836/'))return route.fulfill({status:502,json:{error:'Khách sạn QA chưa lấy được dữ liệu'}});
    const row={bookingCode:'B1',roomName:'101',roomType:'Standard',source:'Agoda',status:'Đã trả phòng',checkInTime:'2026-09-29',checkOutTime:'2026-10-02',roomPrice:1000000,servicePrice:200000,totalPrice:1200000,payment:500000,deposit:100000,balance:600000};
    json={ok:true,hotel:{id:5381,name:'Sontra QA'},savedAt:'2026-10-21T03:00:00Z',source:'cache',data:normalizeReservations({attributes:{reservations:[row,{...row,roomName:'102',roomPrice:300000,servicePrice:0,totalPrice:300000},{...row,status:'Đã hủy'},{...row,status:'Không đến'},{...row,checkOutTime:'2026-11-01'},{...row,roomType:'M - STANDARD BED ROOM'}]}})};
   }
   return route.fulfill({json});
  }
  if(u.hostname!=='revenue-qa.local')return route.fulfill({body:'',contentType:'text/css'});
  const p=resolve(build,path.startsWith('/assets/')||path.startsWith('/fonts/')?'.'+path:'index.html');
  return route.fulfill({body:await readFile(p),contentType:{'.js':'application/javascript','.css':'text/css','.woff2':'font/woff2'}[extname(p)]||'text/html'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://revenue-qa.local/');await page.getByRole('button',{name:'Doanh thu',exact:true}).click();
 await page.getByRole('heading',{name:'Doanh thu phòng & dịch vụ'}).waitFor();
 await page.getByLabel('Doanh thu từ ngày',{exact:true}).fill('2026-10-01');await page.getByLabel('Doanh thu đến ngày',{exact:true}).fill('2026-10-20');
 await page.getByRole('button',{name:'Xem doanh thu',exact:true}).click();
 await page.getByText(/Có dữ liệu 1\/2 khách sạn/).waitFor();
 assert.equal(await page.locator('.revenue-kpis strong').nth(2).innerText(),'1.500.000 ₫');
 assert.match(await page.locator('.revenue-module').innerText(),/Khách sạn QA chưa lấy được dữ liệu/);
 await page.getByText(/Booking tính doanh thu · 1 booking \/ 2 dòng phòng/).click();
 assert.equal(await page.locator('.revenue-module details').first().locator('tbody tr').count(),2);
 assert.match(await page.locator('.revenue-module details').last().innerText(),/3/);
 await page.screenshot({path:resolve('frontend/dist/bluejay-revenue-'+width+'.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
 if(width===1440){let count=0;for(const [button,ext] of [['Xuất Excel doanh thu','xlsx'],['Xuất PDF ngang doanh thu','pdf']]){await page.getByRole('button',{name:button,exact:true}).click();await page.waitForFunction(n=>window.qaFiles.length>n,count++);const file=await page.evaluate(async()=>({name:window.qaFilename,bytes:Array.from(new Uint8Array(await window.qaFiles.at(-1).arrayBuffer()))}));assert.match(file.name,new RegExp('^doanh-thu-.*\\.'+ext+'$'));const bytes=Buffer.from(file.bytes);if(ext==='pdf')assert.equal(bytes.subarray(0,4).toString(),'%PDF');else{const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert.equal(book.getWorksheet('Tổng quan').getCell('B9').value,1500000);assert.equal(book.getWorksheet('Booking tính doanh thu').rowCount,8);}}}
 await page.getByLabel('Khách sạn doanh thu',{exact:true}).selectOption('5381');
 assert.equal(await page.locator('.revenue-kpis').count(),0);
 await page.getByRole('button',{name:'Cập nhật từ Blue Jay',exact:true}).click();
 await page.getByText(/Có dữ liệu 1\/1 khách sạn/).waitFor();assert.equal(calls.at(-1).searchParams.get('refresh'),'1');
 await context.close();
 }assert.deepEqual(errors,[]);console.log('PASS: checkout-only revenue, room+service sum, cancellation/no-show exclusions, partial hotel failures, invalidation on filters, refresh, Excel, desktop/mobile.');
}finally{await browser.close();}
