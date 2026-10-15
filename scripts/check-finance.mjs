import {chromium} from '../worker/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {financeSummary} from '../shared/finance.js';
const build=resolve('frontend/dist'),entries=[],errors=[];
const browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('review-access-token','fixture'));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;let body=[];
  if(p.startsWith('/api/')){
   if(p==='/api/auth/config')body={mode:'supabase'};
   if(p==='/api/session')body={ok:true,user:{id:'admin',role:'admin',email:'qa@example.com'},expiresAt:new Date(Date.now()+3600000).toISOString()};
   if(p==='/api/insights')body={alerts:[],daily:[],directory:[]};
   if(p==='/api/auth/users')body={users:[]};
   if(p==='/api/finance/units')body={units:[{key:'sontra-sea-hotel',name:'Sontra Sea Hotel',access:'admin'}]};
   if(p==='/api/finance/report')body={entries,summary:financeSummary(entries)};
   if(p==='/api/finance/operations')body={connected:true,occupancy:{savedAt:'2026-08-31T08:00:00Z',data:{occupancyRate:60}},reservations:{savedAt:'2026-08-31T08:00:00Z',data:{count:10,roomPrice:9000000}}};
   if(p==='/api/finance/entries'){const e=route.request().postDataJSON();entries.push({...e,id:1,status:'draft'});body={ok:true,id:1};}
   if(p==='/api/finance/review'){const e=route.request().postDataJSON();entries[0].status=e.status;body={ok:true};}
   return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  }
  if(url.hostname!=='bluejay-qa.local')return route.fulfill({body:''});
  const file=p==='/'?'index.html':p.slice(1);return route.fulfill({body:await readFile(resolve(build,file)),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://bluejay-qa.local/');await page.getByRole('button',{name:'Thu–chi & HĐKD',exact:true}).click();
 await page.getByLabel('Từ ngày',{exact:true}).fill('2026-08-01');
 await page.getByLabel('Đến ngày',{exact:true}).fill('2026-08-31');
 await page.getByRole('button',{name:'Xem báo cáo',exact:true}).click();
 await page.getByRole('button',{name:'Tổng hợp HĐKD',exact:true}).click();
 await page.getByRole('button',{name:'Xuất CSV',exact:true}).waitFor();
 assert.match(await page.locator('.finance-kpis').innerText(),/Doanh thu đã ghi nhận\n—/);
 await page.getByRole('button',{name:'Nhập liệu',exact:true}).click();
 await page.getByLabel('Ngày phát sinh',{exact:true}).fill('2026-08-01');
 await page.getByLabel('Số tiền thực thu/chi / giá trị (VND)',{exact:true}).fill('500000');
 await page.getByLabel('Nội dung',{exact:true}).fill('Nhận cọc thử nghiệm');
 await page.getByLabel('Mã cọc liên kết',{exact:true}).fill('BK001');
 await page.getByLabel('Hạng mục',{exact:true}).selectOption('deposit');
 await page.getByRole('button',{name:'Lưu chờ duyệt',exact:true}).click();
 await page.getByRole('cell').filter({hasText:'Nhận cọc thử nghiệm'}).waitFor();
 await page.getByRole('button',{name:'Tổng hợp HĐKD',exact:true}).click();
 assert.match(await page.locator('.finance-kpis').innerText(),/Tiền đã thu\n0 ₫/);
 await page.getByRole('button',{name:'Sổ nghiệp vụ',exact:true}).click();
 await page.getByPlaceholder('Ví dụ: đã kiểm tra hóa đơn và đối chiếu quỹ').fill('Đối soát xong');
 await page.getByRole('button',{name:'Duyệt',exact:true}).click();
 await page.getByText('Đã ghi sổ',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tổng hợp HĐKD',exact:true}).click();
 assert.match(await page.locator('.finance-kpis').innerText(),/Tiền đã thu\n500.000 ₫/);
 assert.match(await page.locator('.finance-kpis').innerText(),/Doanh thu đã ghi nhận\n—/);
 await page.screenshot({path:resolve(build,'finance-qa.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
 assert.deepEqual(errors,[]);console.log('Finance UI: draft/save/review, deposit vs revenue, API references and mobile passed (fixtures).');
}finally{await browser.close();}
