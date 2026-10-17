import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '@e965/xlsx';
import {readFinanceExcel} from '../../shared/finance-excel-import.js';
import {analyzeWorkbook,dashboardFromReports,monthFromFilename,normalizeManagementReport,groupReportIssues,REPORT_VERSION} from '../../shared/excel-dashboard.js';
import {checkExcelArchive} from '../src/modules/excel-reports/archive.js';
import {managementFixture} from '../../scripts/lib/management-fixture.mjs';
const sheet=(name,rows)=>({name,rows:rows.map(r=>r.map(v=>v&&typeof v==='object'?v:{v}))});
const cashBook=()=>({name:'KT THU CHI T8_2026.xlsx',sheets:[sheet('BK THU KS',[['Ngày','Dịch vụ','Ghi chú','Tiền TK','Mã booking'],['2026-08-01','Tiền phòng','',100000,'BK1'],['2026-08-02','','Phí chuyển khoản expedia',-2200,''],['2026-08-03','','',7650000,'BK2'],['2026-07-31','Tiền phòng','',999999,'OTHER']]),sheet('BK CHI KS',[['Ngày','Hạng mục','Nội dung chi','Chi tiền mặt'],['2026-08-02','Casual HK','Casual HK',300000]]),sheet('DV Ngoài',[['DATE (ngày đặt)','Nhân viên','ID PHÒNG','Dịch vụ','Diễn giải','Giá DV thuê','Giá bán DV','Lợi nhuận','Chiết khấu 20%'],['2026-08-01','Linh','BK1','DV Xe máy','Thuê xe',90000,160000,70000,14000],['2026-08-02','','BK2','Giặt ủi','',null,50000,50000,10000]]),sheet('Tổng hợp tham chiếu',[['Tổng',999999999999]])]});
test('workbook dashboard preserves cash signs, original duplicate cells and incomplete descriptions without duplicate detail totals',()=>{
 const b=cashBook();b.sheets[0].rows.push(b.sheets[0].rows[1]);const r=analyzeWorkbook(b,'2026-08');assert.equal(r.entries.length,5);assert.equal(r.totals.receipts,7847800);assert.equal(r.totals.payments,300000);assert.equal(r.services.length,2);assert.equal(r.services[1].cost,null);assert.equal(r.services[1].margin,null);assert.equal(r.quality.outsidePeriod,1);assert.ok(r.issues.some(i=>i.message.includes('Diễn giải')));assert.ok(r.issues.some(i=>i.message.includes('giống')));assert.equal(r.sheets.find(s=>s.type==='reference').sourceRows.length,1);assert.equal(monthFromFilename(b.name),'2026-08');assert.throws(()=>analyzeWorkbook(b,'2026-13'));
 const dashboard=dashboardFromReports([{...r,unit:'a',unitName:'A'}],{from:'2026-08-01',to:'2026-08-31'});assert.equal(dashboard.serviceTotals.sale,210000);assert.equal(dashboard.serviceTotals.margin,null);assert.equal(dashboard.serviceTotals.reportedProfit,120000);assert.equal(dashboard.totals.receipts,r.totals.receipts);assert.equal(dashboard.business.revenue,null);
});
test('cash file wins over copied ledgers in HĐKD; subtotal rows and wrong-month statements never inflate results',()=>{
 const cash={...analyzeWorkbook(cashBook(),'2026-08'),unit:'a',unitName:'A'};
 const book=cashBook();book.sheets.push(sheet('KQ HĐKD',[['Kết quả'],['STT','Chỉ tiêu','Mã số',46235],['','I, TỔNG DOANH THU (I=1-2)','',500],['','Tiền phòng','',400],['','II, TỔNG CHI PHÍ HĐKD','',250.25],['','III, Lợi nhuận thuần từ HĐKD','',249.75]]));
 const business={...analyzeWorkbook(book,'2026-08'),unit:'a',unitName:'A'},range={from:'2026-08-01',to:'2026-08-31'},d=dashboardFromReports([cash,business],range);assert.equal(d.totals.receipts,cash.totals.receipts);assert.equal(d.services.length,2);assert.equal(d.business.revenue,500);assert.equal(d.business.profit,249.75);assert.equal(dashboardFromReports([cash,business],{...range,to:'2026-08-15'}).business.revenue,null);
 book.sheets.at(-1).rows[1][3].v=46204;const wrong={...analyzeWorkbook(book,'2026-08'),unit:'a'};assert.equal(wrong.statements[0].sourceMonth,'2026-07');assert.ok(wrong.issues.some(i=>i.message.includes('khác tháng')));assert.equal(dashboardFromReports([cash,wrong],range).business.revenue,null);
});
test('missing cached formulas do not become zero, and unsupported/error sheets fail without changing a prior snapshot',()=>{
 const b=cashBook();b.sheets[0].rows[1][3]={f:'SUM(A1:A2)',cacheAvailable:false};const r=analyzeWorkbook(b,'2026-08');assert.equal(r.quality.missingAmounts,1);assert.equal(r.entries.some(e=>e.bookingCode==='BK1'),false);assert.throws(()=>analyzeWorkbook({name:'x.xlsx',sheets:[sheet('Unknown',[['X',123]])]},'2026-08'),/Chưa nhận diện/);assert.throws(()=>analyzeWorkbook({name:'x.xlsx',sheets:[{name:'too big',error:'Vượt giới hạn'}]},'2026-08'),/Vượt/);
});
test('actual HTTP uploads are durable snapshots, idempotent across users, scope protected, replacement atomic and leave legacy ledger untouched',async()=>{
 const f=await managementFixture();const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Ngày','Dịch vụ','Ghi chú','Tiền TK'],['2026-08-01','Tiền phòng','Thu phòng',100000]]),'BK THU KS');const binary=()=>Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
 const url=f.origin+'/api/management-reports',upload=(role,bytes=binary(),unit='sontra-sea-hotel')=>f.fetch(url+'?'+new URLSearchParams({unit,month:'2026-08',name:'KT THU CHI T8_2026.xlsx'}),{method:'POST',headers:{Authorization:'Bearer '+role,'Content-Type':'application/octet-stream'},body:bytes}),read=(role,unit='all')=>f.fetch(url+'?'+new URLSearchParams({unit,month:'2026-08'}),{headers:{Authorization:'Bearer '+role}});
 try{
  assert.equal((await upload('viewer')).status,403);assert.equal((await upload('member',binary(),'yzistel-hoi-an-39-le-quy-don')).status,403);assert.equal(f.objects.size,0);
  const first=await upload('member');assert.equal(first.status,200);const saved=await first.json();assert.ok(saved.report.id);assert.equal(saved.report.entries,undefined);assert.equal(saved.report.totals,undefined);assert.equal(f.objects.size,3);
  let reports=(await (await read('admin')).json()).reports;assert.equal(reports.length,1);assert.equal(reports[0].totals.receipts,100000);assert.equal(reports[0].sheets[0].sourceRows,undefined);
  const activeKey=[...f.objects.keys()].find(k=>k.includes('/active/')),old=JSON.parse(f.objects.get(activeKey));old.version=1;old.entries[0].notes=['Chọn hạng mục hợp lệ.'];f.objects.set(activeKey,Buffer.from(JSON.stringify(old)));reports=(await (await read('admin')).json()).reports;assert.equal(reports[0].version,REPORT_VERSION);assert.ok(reports[0].entries[0].notes[0].includes('Chưa phân loại'));assert.equal(JSON.parse(f.objects.get(activeKey)).version,1);const bytes=binary(),same=await (await upload('admin',bytes)).json();assert.equal(same.report.version,REPORT_VERSION);assert.equal(same.unchanged,true);assert.equal(same.report.id,saved.report.id);assert.equal(f.objects.size,3);
  const metadata=await (await read('member')).json();assert.equal(metadata.reports[0].entries,undefined);assert.equal((await f.fetch(url+'/source?unit=sontra-sea-hotel&month=2026-08&family=cash',{headers:{Authorization:'Bearer member'}})).status,403);assert.equal((await read('manager','yzistel-hoi-an-39-le-quy-don')).status,403);
  const source=await (await f.fetch(url+'/source?unit=sontra-sea-hotel&month=2026-08&family=cash',{headers:{Authorization:'Bearer admin'}})).json();assert.equal(source.sheets[0].sourceRows.length,2);
  book.Sheets['BK THU KS'].D2.v=200000;f.setFailActive(true);assert.equal((await upload('admin')).status,503);reports=(await (await read('admin')).json()).reports;assert.equal(reports[0].totals.receipts,100000);f.setFailActive(false);
  const updated=await (await upload('admin')).json();assert.equal(updated.replaced,true);assert.notEqual(updated.report.id,saved.report.id);assert.equal(updated.report.totals.receipts,200000);assert.equal((await (await read('admin')).json()).reports.length,1);
  assert.equal((await upload('admin',Buffer.from('not excel'))).status,400);assert.equal((await (await read('admin')).json()).reports[0].totals.receipts,200000);
  assert.equal((await f.db.query('select count(*)::int n from public.review_tracker_finance_entries')).rows[0].n,0);
 }finally{await f.close();}
});

test('XLSX expansion guard rejects unsupported, encrypted/zip64 and oversized archives before parsing',()=>{
 assert.throws(()=>checkExcelArchive(Buffer.from('not excel')),/File Excel/);const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['test',1]]),'Sheet1');const bytes=Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));assert.doesNotThrow(()=>checkExcelArchive(bytes));const offset=bytes.indexOf(Buffer.from([80,75,1,2]));bytes.writeUInt32LE(101*1024*1024,offset+24);assert.throws(()=>checkExcelArchive(bytes),/100 MB/);
});


test('source profit is independent of missing cost; cached values, zero and negative profit survive while missing formulas stay unavailable',()=>{
 const b=cashBook(),s=b.sheets[2];s.rows[1][7]={v:-1.25};s.rows[2][7]={v:0};let report=analyzeWorkbook(b,'2026-08'),d=dashboardFromReports([{...report,unit:'a'}]);assert.equal(d.serviceTotals.reportedProfit,-1.25);assert.equal(d.serviceTotals.margin,null);assert.equal(d.services[1].cost,null);assert.equal(d.services[1].reportedProfit,0);
 s.rows[2][7]={f:'G3-F3',cacheAvailable:false};report=analyzeWorkbook(b,'2026-08');d=dashboardFromReports([{...report,unit:'a'}]);assert.equal(d.serviceTotals.reportedProfit,null);assert.equal(d.serviceTotals.missingReportedProfit,1);assert.equal(report.services[1].reportedProfit,null);
 s.rows[2][7]={f:'G3-F3',v:50000,cacheAvailable:true};assert.equal(analyzeWorkbook(b,'2026-08').services[1].reportedProfit,50000);
});

test('legacy snapshots recover explicit profit from source cells without altering original objects; identical notes group with all row positions',()=>{
 const legacy={...analyzeWorkbook(cashBook(),'2026-08'),version:1,unit:'a'};for(const service of legacy.services)delete service.reportedProfit;legacy.issues=legacy.issues.map(i=>i.sheet==='DV Ngoài'?{...i,message:'Dịch vụ thiếu giá thuê hoặc giá bán; chưa tính đủ lợi nhuận.'}:i);const original=JSON.stringify(legacy),upgraded=normalizeManagementReport(legacy);assert.equal(upgraded.services[1].reportedProfit,50000);assert.equal(upgraded.services[1].cost,null);assert.equal(upgraded.services[1].margin,null);assert.ok(upgraded.issues.some(i=>i.message.includes('cột Lợi nhuận')));assert.equal(JSON.stringify(legacy),original);
 const groups=groupReportIssues([{...upgraded,issues:[{sheet:'DV Ngoài',row:10,message:'Blank cost'},{sheet:'DV Ngoài',row:11,message:'Blank cost'},{sheet:'BK THU KS',row:303,message:'Missing description'}]}]);assert.equal(groups.length,2);assert.deepEqual(groups[0].rows,[10,11]);assert.equal(groups[0].count,2);
 const noSource=normalizeManagementReport({...legacy,sheets:[]});assert.equal(noSource.services[1].reportedProfit,null);
});


test('cash-source repair and asset maintenance stay distinct in charts and restored v2 reports; amounts never move twice',()=>{
 const b=cashBook();b.sheets[1]=sheet('BK CHI KS',[
 ['Ngày','Hạng mục','Nội dung chi','Chi tiền mặt','Chi Tiền CK'],
 ['2026-08-01','Chi sửa chữa','Thay thiết bị',4946000,null],
 ['2026-08-02','Chi bảo dưỡng tài sản','Bảo dưỡng định kỳ',5150000,null],
 ['2026-08-03','Chi mua đồ dùng KS (CCDC)','Đồ dùng',463000,null],
 ['2026-08-04','Chi phí khác','Khác',1210000,null],
 ['2026-08-05','Chi sửa chữa','Điều chỉnh',null,-10000]]);
 const fresh={...analyzeWorkbook(b,'2026-08'),unit:'a'},d=dashboardFromReports([fresh]),payments=d.categories.filter(c=>c.kind==='payment');assert.equal(payments.find(c=>c.label==='Sửa chữa').amount,4936000);assert.equal(payments.find(c=>c.label==='Bảo dưỡng tài sản').amount,5150000);assert.equal(payments.find(c=>c.label==='Tài sản / công cụ').amount,463000);assert.equal(payments.find(c=>c.label==='Khác').amount,1210000);assert.equal(payments.reduce((n,c)=>n+c.amount,0),d.totals.payments);assert.equal(d.totals.payments,11759000);
 const legacy={...fresh,version:2,entries:fresh.entries.map(({sourceCategory,...entry})=>entry)},original=JSON.stringify(legacy),restored=normalizeManagementReport(legacy);assert.deepEqual(dashboardFromReports([restored]).categories,d.categories);assert.equal(JSON.stringify(legacy),original);assert.equal(restored.services[0].reportedProfit,fresh.services[0].reportedProfit);
 // Without raw cells, retain the broad historical label rather than inventing a split.
 const unavailable=normalizeManagementReport({...legacy,sheets:[]});assert.equal(dashboardFromReports([unavailable]).categories.find(c=>c.category==='repair').label,'Sửa chữa / bảo dưỡng');
});


test('saved-period history survives reload, groups families, paginates and confines metadata to permitted units',async()=>{
 const f=await managementFixture(),url=f.origin+'/api/management-reports',headers=role=>({Authorization:'Bearer '+role}),history=(role,unit='all')=>f.fetch(url+'/history?'+new URLSearchParams({unit}),{headers:headers(role)});
 try{
  assert.deepEqual((await (await history('admin')).json()).periods,[]);assert.equal(f.objects.size,0);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Ngày','Dịch vụ','Ghi chú','Tiền TK'],['2026-08-01','Tiền phòng','Saved amount',100000]]),'BK THU KS');const bytes=Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));const uploaded=await f.fetch(url+'?unit=sontra-sea-hotel&month=2026-08&name=KT_T8_2026.xlsx',{method:'POST',headers:{...headers('admin'),'Content-Type':'application/octet-stream'},body:bytes});assert.equal(uploaded.status,200);const base=(await uploaded.json()).report;
  // Existing objects from before this feature are discoverable; no migration or upload is required.
  f.objects.set('sontra-sea-hotel/active/2026-08--business.json',Buffer.from(JSON.stringify({...base,family:'business'})));f.objects.set('yzistel-hoi-an-39-le-quy-don/active/2026-09--cash.json',Buffer.from(JSON.stringify({...base,unit:'yzistel-hoi-an-39-le-quy-don',unitName:'Yzistel Hoi An',month:'2026-09'})));
  for(let n=0;n<1000;n++)f.objects.set('sontra-sea-hotel/active/0000-junk-'+String(n).padStart(4,'0')+'.json',Buffer.from('{}'));f.objects.set('sontra-sea-hotel/history/2027-01--cash--unpublished.json',Buffer.from(JSON.stringify(base)));
  const size=f.objects.size,all=await (await history('admin')).json();assert.equal(all.periods.length,2);assert.equal(all.periods[0].month,'2026-09');const sontra=all.periods.find(p=>p.unit==='sontra-sea-hotel');assert.deepEqual(sontra.families,['business','cash']);assert.equal(sontra.month,'2026-08');assert.equal(sontra.updatedAt,base.uploadedAt);assert.equal(f.objects.size,size);
  for(const role of ['member','manager','viewer']){const visible=await (await history(role)).json();assert.equal(visible.periods.length,1);assert.equal(visible.periods[0].unit,'sontra-sea-hotel');assert.equal(JSON.stringify(visible).includes('entries'),false);assert.equal(JSON.stringify(visible).includes('100000'),false);assert.equal((await history(role,'yzistel-hoi-an-39-le-quy-don')).status,403);}
  // Reopen the stored period through the existing read endpoint, without another upload.
  const reopened=await f.fetch(url+'?unit=sontra-sea-hotel&month='+sontra.month,{headers:headers('admin')});const reports=(await reopened.json()).reports;assert.equal(reports.length,2);assert.equal(dashboardFromReports(reports).totals.receipts,100000);assert.equal(f.objects.size,size);
  f.setFailListing(true);assert.equal((await history('admin')).status,503);f.setFailListing(false);assert.equal((await history('admin')).status,200);
 }finally{await f.close();}
});


test('delete all history requires admin and explicit confirmation; removes all report files, handles failure, concurrency, retries and post-delete upload',async()=>{
 const f=await managementFixture(),url=f.origin+'/api/management-reports',headers=role=>({Authorization:'Bearer '+role,'Content-Type':'application/json'}),remove=(role,body={scope:'all',confirmation:'XOA TAT CA'})=>f.fetch(url+'/history',{method:'DELETE',headers:headers(role),body:JSON.stringify(body)});
 try{
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Ngày','Dịch vụ','Ghi chú','Tiền TK'],['2026-08-01','Tiền phòng','Saved amount',100000]]),'BK THU KS');const bytes=Buffer.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),upload=()=>f.fetch(url+'?unit=sontra-sea-hotel&month=2026-08&name=KT_T8_2026.xlsx',{method:'POST',headers:{Authorization:'Bearer admin','Content-Type':'application/octet-stream'},body:bytes});assert.equal((await upload()).status,200);
  const initial=f.objects.size;for(const role of ['member','manager','viewer'])assert.equal((await remove(role)).status,403);assert.equal((await remove('admin',{scope:'all'})).status,400);assert.equal((await remove('admin',{scope:'one',confirmation:'XOA TAT CA'})).status,400);assert.equal(f.objects.size,initial);assert.equal(f.getDeleteCalls(),0);
  f.locks.add('management-reports:write');assert.equal((await remove('admin')).status,409);assert.equal((await upload()).status,409);f.locks.delete('management-reports:write');
  // Include old/removed units and more than one page of old versions/binaries.
  f.objects.set('retired-unit/active/2025-01--cash.json',Buffer.from('{}'));for(let n=0;n<1004;n++)f.objects.set('retired-unit/history/version-'+String(n).padStart(4,'0')+'.json',Buffer.from('{}'));f.objects.set('retired-unit/original/source.bin',Buffer.from('binary'));
  f.setFailListing(true);assert.equal((await remove('admin')).status,503);assert.equal(f.getDeleteCalls(),0);f.setFailListing(false);f.setFailDeleteAfter(0);assert.equal((await remove('admin')).status,503);assert.equal(f.objects.size,initial+1006);
  f.setFailDeleteAfter(1);const partial=await remove('admin');assert.equal(partial.status,503);assert.ok((await partial.json()).error.includes('chưa xác nhận xóa hết'));assert.ok(f.objects.size>0);assert.equal([...f.objects.keys()].some(k=>k.includes('/active/')),false);assert.equal(f.locks.size,0);
  f.setFailDeleteAfter(null);const done=await remove('admin');assert.equal(done.status,200);assert.equal(f.objects.size,0);assert.deepEqual((await (await f.fetch(url+'/history',{headers:headers('admin')})).json()).periods,[]);assert.deepEqual((await (await f.fetch(url+'?month=2026-08',{headers:headers('admin')})).json()).reports,[]);assert.equal((await remove('admin')).status,200);assert.equal((await upload()).status,200);assert.equal(f.objects.size,3);assert.equal(f.locks.size,0);
  assert.equal((await f.db.query('select count(*)::int n from public.review_tracker_finance_entries')).rows[0].n,0);
 }finally{await f.close();}
});
