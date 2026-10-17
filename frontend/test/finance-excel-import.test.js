import test from 'node:test';
import assert from 'node:assert/strict';
import {readFinanceExcel,detectFinanceBlocks,previewFinanceImport,identifyImportedRows,guessCategory,guessMethod,importTargets} from '../src/lib/finance-excel-import.js';
import {validateGridRows} from '../src/lib/finance-grid.js';
import ExcelJS from 'exceljs';
const sheet=(name,rows,date1904=false)=>({name,date1904,rows:rows.map(r=>r.map(v=>v!=null&&typeof v==='object'?v:{v}))});
const opts={from:'2026-08-01',to:'2026-08-31'};
test('flat reordered headers, numeric dates, labels, zero-padded identifiers and explicit financial classifications',async()=>{
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Giao dịch');ws.addRow(['BÁO CÁO THÁNG 8']);ws.addRow(['Nội dung','Số tiền','Ngày','Loại','Phương thức','Mã booking','Hạng mục']);ws.addRow(['Thu tiền phòng',125000,new Date('2026-08-02T00:00:00Z'),'Thu','CK',123,'Tiền phòng']);ws.getCell('C3').numFmt='dd/mm/yyyy';ws.getCell('F3').numFmt='000000';
 const bytes=await wb.xlsx.writeBuffer(),book=await readFinanceExcel({name:'cash.xlsx',size:bytes.byteLength,arrayBuffer:async()=>bytes});const s=book.sheets[0],blocks=detectFinanceBlocks(s);assert.equal(blocks[0].header,1);const p=previewFinanceImport(s,blocks,opts);assert.equal(p.entries.length,1);assert.equal(p.invalid,0);assert.equal(p.entries[0].row.bookingCode,'000123');assert.equal(p.entries[0].row.date,'2026-08-02');assert.equal(p.entries[0].row.method,'bank');assert.equal(p.receipts,125000);
});
test('two side-by-side cash ledgers exclude summary tables and split signed payment methods',()=>{
 const s=sheet('THU CHI MINIMART',[
 ['BẢNG KÊ THU CHI'],['THU MINI MART','','','','','','','','','BẢNG CHI MINI MART'],
 ['DATE','NỘI DUNG','THU TIỀN MẶT','TÀI KHOẢN','SHOPEE FOOD','GRAB FOOD','TỔNG HÀNG HUỶ','THUÊ PHAO','GHI CHÚ','DATE','Hạn mục','Nội dung chi','TIỀN MẶT','TÀI KHOẢN','Hạn mục','Tiền mặt','Tiên TK','TỔNG'],
 ['2026-08-01','Thu tiền bán hàng',100,200,0,-50,10,0,'','2026-08-02','Chi sửa chữa','Sửa cửa',300,400,'Chi khác',99999,99999,199998],
 ['TỔNG','',100,200,0,-50,'','','','TỔNG','','',300,400]
 ]),blocks=detectFinanceBlocks(s),p=previewFinanceImport(s,blocks,opts);
 assert.equal(blocks.length,2);assert.equal(blocks[0].kind,'receipt');assert.equal(blocks[1].kind,'payment');assert.equal(blocks[1].end,14);assert.equal(p.entries.length,5);assert.equal(p.receipts,250);assert.equal(p.payments,700);assert.equal(p.invalid,0);assert.equal(p.entries[2].row.source,'Grab Food');assert.ok(p.skipped.length);
});
test('two-row hotel headers exclude previously collected deposits and do not turn commissions/discounts into new cash',()=>{
 const s=sheet('BK THU KS',[
 ['BẢNG KÊ THU TIỀN KHÁCH SẠN'],
 ['NGÀY THÁNG','ID HỆ THỐNG','NỀN TẢNG','HÌNH THỨC THANH TOÁN','DỊCH VỤ','GHU CHÚ','SỐ PHÒNG TT','TIỀN CỌC ĐÃ NHẬN','','THU TIỀN KHÁCH SẠN','','','','','','Khoản giảm trừ doanh thu'],
 ['','','','','','','','Cọc tiền mặt Đã ở','Cọc tiền TK Đã ở','Tiền măt','Cọc tiền TM chưa ở','Tiền TK','Cọc tiền TK chưa ở','Tiền quẹt thẻ','Tiền TK thẻ Visa','Hoa hồng nền tảng'],
 ['2026-08-01','009698','Booking','TT trực tiếp','Tiền phòng','','102',1500,600,400,200,700,300,100,50,40]
 ]),b=detectFinanceBlocks(s),p=previewFinanceImport(s,b,opts);assert.equal(b[0].depth,2);assert.equal(p.entries.length,6);assert.equal(p.receipts,1750);assert.equal(p.entries.filter(e=>e.row.category==='deposit').length,2);assert.ok(p.entries.every(e=>e.row.bookingCode==='009698'));assert.equal(p.invalid,0);
});
test('stored formula values load by default; explicit opt-out remains reversible and 1904 dates keep calendar day',()=>{
 const s=sheet('Thu',[['Ngày','Nội dung','Thu tiền mặt'],[44774,{v:'Thu phòng',f:'"Thu phòng"'},{v:100,f:'50+50'}]],true),blocks=detectFinanceBlocks(s),p=previewFinanceImport(s,blocks,{...opts,from:'2026-01-01',to:'2026-12-31',allowCached:false});assert.equal(p.entries[0].row.date,'2026-08-02');assert.equal(p.invalid,1);assert.ok(validateGridRows([p.entries[0].row],opts).get(p.entries[0].row.requestId).errors.description);const cached=previewFinanceImport(s,blocks,opts);assert.equal(cached.entries[0].row.amount,100);assert.equal(cached.cached,1);assert.equal(cached.invalid,0);
});
test('inference keeps unknown fields and blank dates for correction; repeated imports have stable IDs scoped to unit',async()=>{
 assert.equal(guessCategory('Chi tiền điện nước'),'operations');assert.equal(guessCategory('Mua hàng hóa NK'),'inventory');assert.equal(guessCategory('Không rõ chi gì'),'');assert.equal(guessMethod('TT trực tiếp'),'');
 const s=sheet('Thu',[['Ngày','Nội dung','Số tiền','Loại','Phương thức'],['','abc',100,'Thu','không rõ'],['2026-08-03','Điều chỉnh',-50,'Thu','TM']]),p=previewFinanceImport(s,detectFinanceBlocks(s),opts);assert.equal(p.entries.length,2);assert.equal(p.entries[0].row.date,'');assert.equal(p.entries[0].row.method,'không rõ');assert.ok(p.entries[0].errors.date);assert.ok(p.entries[0].errors.category);const a=await identifyImportedRows(p.entries,'sontra'),b=await identifyImportedRows(p.entries,'sontra'),c=await identifyImportedRows(p.entries,'minimart');assert.equal(a[0].requestId,b[0].requestId);assert.notEqual(a[0].requestId,c[0].requestId);assert.notEqual(a[0].requestId,a[1].requestId);assert.match(a[0].requestId,/^[a-f0-9-]{36}$/);
});
test('invalid files, oversize content and ambiguous mappings fail explicitly rather than silently dropping input',async()=>{
 await assert.rejects(readFinanceExcel({name:'a.exe',size:100}),/xlsx/);await assert.rejects(readFinanceExcel({name:'a.xlsx',size:11*1024*1024}),/10 MB/);await assert.rejects(readFinanceExcel({name:'a.xlsx',size:0}),/xlsx/);
 const s=sheet('Sheet1',[['Ngày','Nội dung','Số tiền','Ghi chú'],['2026-08-01','Thu',10,'abc']]),b=detectFinanceBlocks(s);b[0].columns[3]={index:3,label:'Ghi chú',target:'description'};const p=previewFinanceImport(s,b,opts);assert.match(p.warnings[0],/nhiều cột/);assert.equal(p.entries.length,0);
});

test('repeated merged headers, right-side reconciliation and daily summaries never inflate ledger totals',()=>{
 const s=sheet('BK CHI KS',[
 ['CHI KHÁCH SẠN'],['Ngày','Hạng Mục','Nội Dung Chi','chi Tiền mặt','Chi Tiền CK thẻ visa','GHI CHÚ','','Chi tiểu','Tiền mặt','Tổng'],
 ['Ngày','Hạng Mục','Nội Dung Chi',{v:100,f:'SUM(D4:D8)'},{v:200,f:'SUM(E4:E8)'},'','','Chi tiểu',999999,999999],
 ['2026-08-02','Chi sửa chữa','Sửa cửa',100,200,'','','Sửa chữa',999999,999999]
 ]),blocks=detectFinanceBlocks(s),p=previewFinanceImport(s,blocks,{...opts,allowCached:true});assert.equal(p.entries.length,2);assert.equal(p.payments,300);assert.equal(p.entries[1].row.method,'bank');assert.equal(p.invalid,0);
 const thu=sheet('BK THU KS',[
 ['BẢNG KÊ THU TIỀN KHÁCH SẠN'],['Ngày','Nội dung','Thu tiền mặt','Tiền so Bluejay','Ngày tháng','Tiền mặt'],['2026-08-02','Thu phòng',100,99999,'2026-08-02',99999]
 ]),b=detectFinanceBlocks(thu),v=previewFinanceImport(thu,b,opts);assert.equal(b.length,1);assert.equal(v.entries.length,1);assert.equal(v.receipts,100);
});

test('explicit default day fills an incomplete transaction while a number-only total is still excluded',()=>{
 const s=sheet('Thu',[['Ngày','Hạng mục','Thu tiền mặt'],['','Tiền phòng',100],['','',9999]]),b=detectFinanceBlocks(s),p=previewFinanceImport(s,b,{...opts,defaultDate:'2026-08-03'});assert.equal(p.entries.length,1);assert.equal(p.entries[0].row.date,'2026-08-03');assert.equal(p.entries[0].row.description,'Tiền phòng');assert.equal(p.receipts,100);assert.equal(p.invalid,0);
});

test('formula-driven dates, descriptions and money all load automatically, zero is skipped and old balances stay excluded',()=>{
 const f=v=>({v,f:'external_or_local_formula()'}),s=sheet('THU MINI MART',[
 ['Ngày','Nội dung','Thu tiền mặt','Shopee Food'],
 [f(''),f(''),null,f(1182)],
 [f(46235),f('Thu tiền bán hàng'),f(100),null],
 [f(46235),f('Thu tiền bán hàng'),f(0),f(-50)]
 ]),p=previewFinanceImport(s,detectFinanceBlocks(s),opts);assert.equal(p.entries.length,2);assert.equal(p.invalid,0);assert.equal(p.receipts,50);assert.equal(p.entries[0].row.date,'2026-08-01');assert.equal(p.missingFormula,0);assert.ok(p.skipped.some(e=>e.row===2));assert.ok(!JSON.stringify(p.entries).includes('#CÔNG THỨC:'));
});

test('missing formula cache is distinct from zero and has a single actionable error per field',()=>{
 const s=sheet('Thu',[['Ngày','Nội dung','Thu tiền mặt'],['2026-08-01','Thu phòng',{f:'50+50'}],['2026-08-02',{f:'LOOKUP(A1)'},100]]),p=previewFinanceImport(s,detectFinanceBlocks(s),opts);assert.equal(p.entries.length,2);assert.equal(p.invalid,2);assert.equal(p.missingFormula,2);assert.match(p.entries[0].errors.amount,/chưa có kết quả/);assert.equal(p.entries[0].errors.rule,undefined);assert.match(p.entries[1].errors.description,/chưa có kết quả/);
});

test('binary XLSX keeps formula cache availability for actual cached dates, blank optional fields and missing results',async()=>{
 const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Thu');ws.addRow(['Ngày','Nội dung','Thu tiền mặt']);ws.addRow([{formula:'DATE(2026,8,1)',result:46235},{formula:'"Thu phòng"',result:'Thu phòng'},{formula:'50+50',result:100}]);ws.addRow(['2026-08-02','Thu phòng chưa lưu',{formula:'1+2'}]);const bytes=await wb.xlsx.writeBuffer(),book=await readFinanceExcel({name:'formula.xlsx',size:bytes.length,arrayBuffer:async()=>bytes});const s=book.sheets[0],p=previewFinanceImport(s,detectFinanceBlocks(s),opts);assert.equal(p.entries[0].row.date,'2026-08-01');assert.equal(p.entries[0].row.amount,100);assert.equal(Object.keys(p.entries[0].errors).length,0);assert.equal(p.missingFormula,1);assert.match(p.entries[1].errors.amount,/chưa có kết quả/);
});

test('reference is removed from mapping options, ignored in older files and does not replace booking IDs',()=>{
 assert.ok(!importTargets.some(t=>t.key==='reference'));
 const s=sheet('Thu',[['Ngày','Nội dung','Thu tiền mặt','Số chứng từ','ID HỆ THỐNG','Phòng'],['2026-08-01','Thu phòng',100,'CT-OLD','BOOK-123','201']]),blocks=detectFinanceBlocks(s),p=previewFinanceImport(s,blocks,opts);assert.equal(blocks[0].columns.find(c=>c.index===3).target,'');assert.equal(p.entries[0].row.reference,'');assert.equal(p.entries[0].row.bookingCode,'BOOK-123');assert.equal(p.entries[0].row.room,'201');assert.equal(p.invalid,0);
});
