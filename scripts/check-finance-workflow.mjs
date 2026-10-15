import {chromium} from '../worker/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';import assert from 'node:assert/strict';
import {financeSummary,validateFinanceEntry,inventorySummary,depositSummary} from '../shared/finance.js';
const build=resolve('frontend/dist'),entries=[],days=[],files=[],errors=[];let role='member';
const browser=await chromium.launch({executablePath:'C:/Users/PC/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('vjh-session','fixture'));
 await page.route('**/*',async route=>{const request=route.request(),url=new URL(request.url()),p=url.pathname;let body=[];
 if(p.startsWith('/api/')){
 if(p==='/api/auth/config')body={mode:'supabase'};
 if(p==='/api/session')body={ok:true,user:{id:role==='admin'?'admin':'member',role,email:role+'@example.com'},expiresAt:new Date(Date.now()+3600000).toISOString()};
 if(p==='/api/insights')body={alerts:[],daily:[],directory:[]};
 if(p==='/api/auth/users')body={users:[]};
 if(p==='/api/finance/dashboard')body={units:[],dates:[],generatedAt:new Date().toISOString()};
 if(p==='/api/finance/units')body={units:[{key:'sontra-sea-hotel',name:'Sontra Sea Hotel',category:'hotel',access:role==='admin'?'admin':'editor'}]};
 if(p==='/api/finance/report')body={entries,days,files,history:entries.filter(e=>e.status==='posted'),summary:financeSummary(entries),inventory:inventorySummary(entries,'2026-08-01','2026-08-31'),deposits:depositSummary(entries),audit:[]};
 if(p==='/api/finance/operations')body={connected:true,occupancy:null,reservations:{savedAt:'2026-08-31T08:00:00Z',data:{count:1,roomPrice:9000000},bookings:[{bookingCode:'BK1',room:'101',source:'Agoda'}]}};
 if(p==='/api/finance/entries'){const e=validateFinanceEntry(request.postDataJSON());entries.push({...e,id:entries.length+1,actor:'member',status:'draft'});body={ok:true,id:entries.length};}
 if(/^\/api\/finance\/entries\/\d+$/.test(p)&&request.method()==='PATCH'){const e=validateFinanceEntry(request.postDataJSON());Object.assign(entries[0],e,{status:'draft'});body={ok:true,id:entries[0].id};}
 if(p.endsWith('/files')&&request.method()==='POST'){files.push({id:'file-1',entry_id:1,name:url.searchParams.get('name')});body={ok:true};}
 if(p==='/api/finance/days'){const e=request.postDataJSON();const existing=days.find(d=>d.day===e.date);const d={day:e.date,report:e,status:'draft',actor:'member',updated_at:new Date().toISOString()};if(existing)Object.assign(existing,d);else days.push(d);body={ok:true};}
 if(p==='/api/finance/days/submit'){days[0].status='submitted';body={ok:true};}
 if(p==='/api/finance/days/review'){const e=request.postDataJSON();days[0].status=e.status;days[0].reason=e.reason;if(e.status==='closed')entries.forEach(e=>e.status='posted');body={ok:true};}
 return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 }
 if(url.hostname!=='bluejay-qa.local')return route.fulfill({body:''});const file=p==='/'?'index.html':p.slice(1);return route.fulfill({body:await readFile(resolve(build,file)),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 const open=async()=>{await page.goto('https://bluejay-qa.local/');await page.getByRole('button',{name:'Thu–chi & HĐKD',exact:true}).click();await page.getByRole('button',{name:'Nhập liệu',exact:true}).click();await page.getByLabel('Từ ngày',{exact:true}).fill('2026-08-01');await page.getByLabel('Đến ngày',{exact:true}).fill('2026-08-31');await page.getByRole('button',{name:'Xem báo cáo',exact:true}).click();await page.getByRole('button',{name:'Xuất CSV',exact:true}).waitFor();};
 await open();assert.equal(await page.getByRole('button',{name:'Dashboard quản lý',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Duyệt',exact:true}).count(),0);
 await page.getByLabel('Ngày phát sinh',{exact:true}).fill('2026-08-01');await page.getByLabel('Số tiền thực thu/chi / giá trị (VND)',{exact:true}).fill('500');await page.getByLabel('Nội dung',{exact:true}).fill('Phiếu thử chia thanh toán');
 await page.getByLabel('Điền thông tin từ booking Bluejay',{exact:true}).selectOption('0');assert.equal(await page.getByLabel('Phòng (nếu có)',{exact:true}).inputValue(),'101');
 await page.getByLabel('Chia tiền theo nhiều phương thức',{exact:true}).check();await page.getByLabel('Thanh toán Tiền mặt',{exact:true}).fill('200');await page.getByLabel('Thanh toán Chuyển khoản',{exact:true}).fill('300');
 await page.getByLabel('Chi tiết tiền gộp / phí / giảm giá / VAT',{exact:true}).check();await page.getByLabel('Tiền gộp',{exact:true}).fill('550');await page.getByLabel('Hoa hồng khấu trừ',{exact:true}).fill('50');
 await page.locator('input[type=file]').setInputFiles({name:'invoice-test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7 test only')});await page.getByRole('button',{name:'Lưu chờ duyệt',exact:true}).click();await page.getByRole('button',{name:'invoice-test.pdf',exact:true}).waitFor();assert.equal(entries[0].payments.length,2);
 await page.getByRole('button',{name:'Sửa',exact:true}).click();await page.getByLabel('Nội dung',{exact:true}).fill('Phiếu đã sửa');await page.getByRole('button',{name:'Lưu bản sửa',exact:true}).click();await page.getByRole('cell').filter({hasText:'Phiếu đã sửa'}).waitFor();
 await page.getByRole('button',{name:'Báo cáo ngày',exact:true}).click();
 await page.getByLabel('Ngày đối chiếu',{exact:true}).fill('2026-08-01');await page.getByLabel('Ca / người bàn giao',{exact:true}).fill('Ca sáng / Nhân viên test');await page.getByLabel('Thực tế Tiền mặt',{exact:true}).fill('200');await page.getByLabel('Thực tế Chuyển khoản',{exact:true}).fill('300');
 await page.getByRole('button',{name:'Lưu đối chiếu ngày',exact:true}).click();await page.getByRole('button',{name:'Gửi báo cáo ngày',exact:true}).click();await page.locator('strong').filter({hasText:'Đã gửi duyệt'}).waitFor();assert.equal(await page.getByRole('button',{name:'Duyệt & chốt ngày',exact:true}).count(),0);
 role='admin';await open();await page.getByRole('button',{name:'Báo cáo ngày',exact:true}).click();await page.getByLabel('Ngày đối chiếu',{exact:true}).fill('2026-08-01');await page.getByLabel('Lý do xử lý ngày',{exact:true}).fill('Chứng từ đúng');await page.getByRole('button',{name:'Duyệt & chốt ngày',exact:true}).click();await page.getByRole('button',{name:'Mở lại ngày',exact:true}).waitFor();assert.equal(days[0].status,'closed');assert.equal(entries[0].status,'posted');
 await page.getByRole('button',{name:'Nhập liệu',exact:true}).click();await page.getByLabel('Loại nghiệp vụ',{exact:true}).selectOption('stock');await page.getByLabel('Nội dung',{exact:true}).fill('Nhập nước thử');await page.getByLabel('Mã hàng',{exact:true}).fill('WATER');await page.getByLabel('Tên hàng',{exact:true}).fill('Nước');await page.getByLabel('Đơn vị tính',{exact:true}).fill('chai');await page.getByLabel('Số lượng',{exact:true}).fill('2');await page.getByLabel('Đơn giá vốn nhập (VND)',{exact:true}).fill('50');await page.getByRole('button',{name:'Lưu chờ duyệt',exact:true}).click();await page.getByRole('cell').filter({hasText:'Nhập nước thử'}).waitFor();assert.equal(entries[1].kind,'stock');assert.equal(entries[1].stock.quantity,2);
 await page.getByRole('button',{name:'Báo cáo ngày',exact:true}).click();
 await page.screenshot({path:resolve(build,'finance-workflow-qa.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.deepEqual(errors,[]);console.log('Finance workflow UI passed: employee split/fees, API booking fill, PDF attachment, edit, submit, admin close and mobile (fixtures).');
}finally{await browser.close();}
