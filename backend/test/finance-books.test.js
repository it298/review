import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateBook,planBook,bookDebts,splitValue} from '../../shared/finance-books.js';
import {financeReport} from '../src/modules/finance/report.js';
const make=(type,data={},extra={})=>({id:randomUUID(),type,date:'2026-10-01',reference:randomUUID(),note:'Đã đối chiếu',data,...extra});
const sale=()=>make('invoice',{lines:[{sku:'WATER',name:'Nước',unit:'chai',quantity:2,price:30000,issueStock:true}],discount:1000,vat:4000,paid:40000,method:'bank',dueDate:'2026-10-10',counterparty:'Khách A'});
test('invoice, stay, payroll and allocations preserve amounts without duplicating actual cash',()=>{
 const s=planBook(sale());assert.deepEqual(s.entries.map(e=>[e.kind,e.amount]),[['revenue',55000],['receipt',40000],['stock',1]]);
 const stay=planBook(make('stay',{checkIn:'2026-10-01',checkOut:'2026-10-04',room:'101',source:'Agoda',total:1000000,counterparty:'OTA'}));assert.deepEqual(stay.entries.map(e=>e.date),['2026-10-01','2026-10-02','2026-10-03']);assert.equal(stay.entries.reduce((n,e)=>n+e.amount,0),1000000);assert.equal(stay.entries.some(e=>e.kind==='receipt'),false);
 const pay=planBook(make('payroll',{employee:'EMP1',days:26,rate:300000,allowance:200000,employerInsurance:500000,employeeInsurance:300000,deductions:100000}));assert.equal(pay.book.data.net,7600000);assert.equal(pay.entries[0].amount,8500000);assert.equal(pay.entries[0].kind,'expense');
 const alloc=planBook(make('allocation',{name:'Thuê nhà',category:'rent',months:3,total:1000000}));assert.deepEqual(alloc.entries.map(e=>e.date),['2026-10-01','2026-11-01','2026-12-01']);assert.equal(alloc.entries.reduce((n,e)=>n+e.amount,0),1000000);assert.equal(splitValue(5,3).reduce((a,b)=>a+b),5);
 assert.throws(()=>validateBook({...sale(),data:{...sale().data,paid:9999999}}));assert.throws(()=>validateBook(make('allocation',{name:'A',category:'assets',months:0,total:1})));assert.throws(()=>planBook(make('stocktake',{lines:[{sku:'WATER',name:'Nước',unit:'chai',counted:3,unitCost:10}],expected:[{sku:'WATER',quantity:2}]}),{inventory:{items:[{sku:'WATER',quantity:4,unit:'chai'}]}}),/Tồn kho đã thay đổi/);
 const book={...s.book,status:'posted'},debt=bookDebts([book],[{id:1,reference:book.reference,date:'2026-10-01',kind:'receipt',category:'sales',amount:40000,status:'posted'},{reference:book.reference,date:'2026-10-01',kind:'receipt',category:'deposit',amount:10000,status:'posted'}],'2026-10-11')[0];assert.equal(debt.balance,19000);assert.equal(debt.overdue,true);assert.deepEqual(debt.entryIds,[1]);
});
test('business SQL is private, transactional, idempotent, scoped and protects linked entries, shifts and stocktake',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const f of ['finance-module.sql','finance-workflow.sql','finance-books.sql'])await db.exec(await readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/finance-books.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const call=async p=>(await db.query('select public.review_tracker_finance($1::jsonb) result',[JSON.stringify(p)])).rows[0].result;
  const admin={actor:'admin',admin:true,unit:'test-unit'},member={actor:'staff',unit:'test-unit'};
  await call({...admin,action:'scope',userId:'staff',access:'editor'});await call({...admin,action:'scope',userId:'manager',access:'manager'});
  assert.equal((await call({actor:'manager',action:'scopes'}))[0].access,'manager');
  const save=async(book,actor=admin)=>call({...actor,action:'books_save',id:book.id,book:validateBook(book),version:0});
  const read=()=>call({...admin,action:'read',from:'2026-10-01',to:'2026-12-31'});
  const post=async(b,status='posted',plan)=>{const data=await read();return call({...admin,action:'books_review',id:b.id,status,reason:'Đối chiếu',version:b.version,plan:plan||planBook(b.data,{entries:data.entries,inventory:financeReport(data,'2026-10-01','2026-12-31').inventory})});};
  let inv=await save(sale(),member);assert.equal((await save(inv.data,member)).version,1);
  await assert.rejects(()=>call({...member,action:'books_review',id:inv.id,status:'posted',version:1,reason:'X'}));
  await assert.rejects(()=>post(inv),/Xuất vượt tồn kho/);assert.equal((await read()).entries.length,0,'failed stock issue rolls back cash and revenue');
  const entry={date:'2026-10-01',kind:'stock',method:'none',category:'inventory',amount:1,description:'Tồn đầu',requestId:randomUUID(),stock:{mode:'opening',sku:'WATER',name:'Nước',unit:'chai',quantity:10,unitCost:10000}};
  const stock=await call({...admin,action:'save',entry});await call({...admin,action:'review',id:stock.id,status:'posted',reason:'Kiểm tồn'});
  inv=await post(inv);assert.equal(inv.entry_ids.length,3);const report=financeReport(await read(),'2026-10-01','2026-12-31');assert.equal(report.summary.receipts,40000);assert.equal(report.summary.revenue,55000);assert.equal(report.summary.expenses,20000);
  await assert.rejects(()=>post(inv),/Trạng thái/);assert.equal((await read()).entries.length,4);
  await assert.rejects(()=>call({...admin,action:'review',id:inv.entry_ids[0],status:'void',reason:'X'}),/phiếu liên kết/);
  const debt=await call({...admin,action:'books_read',to:'2026-12-31'});assert.equal(bookDebts(debt.books,debt.matches,'2026-10-11')[0].balance,19000);
  const carried=await call({...admin,action:'books_read',from:'2026-11-01',to:'2026-11-30'});assert.equal(carried.books.find(b=>b.id===inv.id).reference,inv.reference,'unpaid earlier invoices remain in a later-period debt report');
  const overpay={...entry,requestId:randomUUID(),kind:'receipt',category:'sales',method:'cash',amount:20000,reference:inv.reference};delete overpay.stock;
  const receipt=await call({...admin,action:'save',entry:overpay});await assert.rejects(()=>call({...admin,action:'review',id:receipt.id,status:'posted',reason:'X'}),/vượt công nợ/);
  await assert.rejects(()=>save(make('payroll',{employee:'A',days:1,rate:1}),member),/Chỉ quản lý/);
  const payroll=await post(await save(make('payroll',{employee:'EMP1',days:1,rate:100000,employerInsurance:10000})));
  const recognition={...entry,requestId:randomUUID(),kind:'expense',category:'payroll',amount:110000,reference:payroll.reference};delete recognition.stock;
  await assert.rejects(()=>call({...admin,action:'save',entry:recognition}),/không nhập lặp/);
  const visible=await call({...member,action:'books_read',to:'2026-12-31'});assert.equal(visible.books.some(b=>b.id===payroll.id),false);assert.equal(visible.matches.length,0);
  const take=await save(make('stocktake',{lines:[{sku:'WATER',name:'Nước',unit:'chai',counted:7,unitCost:0}],expected:[{sku:'WATER',quantity:8}]}),member);let takePlan=planBook(take.data,{inventory:report.inventory});
  // Simulate a competing change after the server calculated its plan.
  await call({...admin,action:'save',entry:{...entry,requestId:randomUUID(),stock:{...entry.stock,mode:'in',quantity:1}}}).then(s=>call({...admin,action:'review',id:s.id,status:'posted',reason:'Nhập thêm'}));
  await assert.rejects(()=>post(take,'posted',takePlan),/Tồn kho đã thay đổi/);
  const shift=await save(make('shift',{code:'morning',employee:'Staff',entryIds:[String(inv.entry_ids[1])],opening:{cash:0,bank:0,card:0,platform:0},counted:{cash:0,bank:40000,card:0,platform:0}}),member);const closed=await post(shift);
  const repeated=await save(make('shift',shift.data.data),member);await assert.rejects(()=>post(repeated),/bàn giao ở ca khác/);
  await assert.rejects(()=>call({...member,unit:'another-unit',action:'books_read',to:'2026-12-31'}));
  // A draft has optimistic concurrency; overwriting a newer revision is refused.
  const draft=await save(make('receivable',{counterparty:'B',total:100,dueDate:'2026-10-10'}));await call({...admin,action:'books_save',id:draft.id,version:1,book:{...draft.data,note:'Đã sửa'}});await assert.rejects(()=>call({...admin,action:'books_save',id:draft.id,version:1,book:{...draft.data,note:'Phiên cũ'}}),/Phiếu đã thay đổi/);
  const stay=await post(await save(make('stay',{checkIn:'2026-10-01',checkOut:'2026-10-04',room:'101',source:'Agoda',total:1000000,counterparty:'Guest'})));assert.equal(stay.entry_ids.length,3);
  const scheduled=await post(await save(make('allocation',{name:'Phí quản lý',category:'operations',months:2,total:2000})));assert.equal((await call({...admin,action:'books_read',from:'2026-11-01',to:'2026-11-30'})).books.some(b=>b.id===scheduled.id),true,'active schedules remain visible in their later months');
  await db.exec("insert into public.review_tracker_finance_months(unit,month,status,actor,reason) values('test-unit','2026-12','locked','admin','QA')");
  const allocation=await save(make('allocation',{name:'Thuê nhà',category:'rent',months:2,total:1000000},{date:'2026-11-01'}));await assert.rejects(()=>post(allocation),/Tháng đã khóa/);assert.equal((await read()).entries.some(e=>e.bookId===allocation.id),false,'later locked month rolls back the entire allocation');
  const own=await call({...member,action:'save',entry:{...overpay,requestId:randomUUID(),reference:'DOC-1'}}),fileId=randomUUID();await call({...member,action:'file_add',id:own.id,fileId,name:'wrong.pdf',mime:'application/pdf',bytes:20,path:'private-object'});await call({...member,action:'file_remove',fileId,reason:'Nhầm hóa đơn'});await assert.rejects(()=>call({...member,action:'file_read',fileId}),/File not found/);assert.equal((await db.query("select count(*)::int n from public.review_tracker_finance_audit where action='file_remove'")).rows[0].n,1);
  assert.equal(closed.status,'posted');await db.exec('reset role;set role anon');await assert.rejects(()=>call({...admin,action:'books_read',to:'2026-12-31'}));await assert.rejects(()=>db.query('select * from public.review_tracker_finance_books'));
 }finally{await db.close();}
});
