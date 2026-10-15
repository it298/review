import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {validateFinanceEntry,validateDay,reconcileDay,inventorySummary,depositSummary} from '../../shared/finance.js';
import {validateDocument} from '../src/modules/finance/files.js';
const entry=(v={})=>validateFinanceEntry({requestId:randomUUID(),date:'2026-08-01',kind:'receipt',category:'room',method:'cash',amount:100,description:'Nghiệp vụ thử',...v});
const daily=date=>validateDay({date,shift:'Ca sáng / Lan',note:'Đối chiếu',opening:{cash:0,bank:0,card:0,platform:0},counted:{cash:100,bank:0,card:0,platform:0}});
test('split settlement reconciles without duplicating cash, VAT and deposits; document signatures validated',()=>{
 const e=entry({amount:90,payments:[{method:'cash',amount:40},{method:'bank',amount:50}],settlement:{gross:100,commission:5,cardFee:2,discount:3,vat:8}});const r=reconcileDay([{...e,status:'draft'},{...e,status:'void'}],{cash:10},{cash:50,bank:50});assert.equal(r[0].expected,50);assert.equal(r[0].difference,0);assert.equal(r[1].expected,50);
 assert.throws(()=>entry({item:{name:'Nước',unit:'chai',quantity:2,unitPrice:10}}));
 const itemEntry=entry({amount:20,item:{name:'Nước',unit:'chai',quantity:2,unitPrice:10}});assert.equal(itemEntry.item.quantity,2);
 assert.throws(()=>entry({payments:[{method:'cash',amount:1}]}));assert.throws(()=>entry({settlement:{gross:100,commission:0,cardFee:0,discount:0,vat:101}}));
 assert.throws(()=>entry({kind:'deposit_use',category:'deposit',method:'none'}));
 const deposits=depositSummary([{...entry({category:'deposit',depositRef:'B1'}),status:'posted'},{...entry({kind:'deposit_use',category:'deposit',method:'none',depositRef:'B1',amount:30}),status:'posted'}]);assert.equal(deposits[0].balance,70);
 assert.throws(()=>validateDay({...daily('2026-08-01'),counted:{cash:''}}));assert.throws(()=>validateDocument('image/png',Buffer.from('not image')));validateDocument('application/pdf',Buffer.from('%PDF-1.7 example'));
});
test('moving weighted cost reflects stock consumption and loss, separate from payments',()=>{
 const rows=[entry({kind:'stock',category:'inventory',method:'none',stock:{sku:'WATER',name:'Nước',unit:'chai',mode:'opening',quantity:10,unitCost:5}}),entry({kind:'stock',category:'inventory',method:'none',stock:{sku:'WATER',name:'Nước',unit:'chai',mode:'in',quantity:10,unitCost:7}}),entry({kind:'stock',category:'inventory',method:'none',stock:{sku:'WATER',name:'Nước',unit:'chai',mode:'out',quantity:5,unitCost:0}})].map((e,i)=>({...e,id:i+1,status:'posted'}));
 const summary=inventorySummary(rows,'2026-08-01','2026-08-31');assert.equal(summary.costOfGoods,30);assert.equal(summary.items[0].quantity,15);assert.equal(summary.items[0].value,90);
 assert.throws(()=>inventorySummary([...rows,{...rows[2],id:4,stock:{...rows[2].stock,quantity:100}}],'2026-08-01','2026-08-31'));
});
test('workflow SQL supports return/edit, day close/reopen, inventory/deposit bounds, attachments and privacy',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of ['finance-module.sql','finance-workflow.sql','finance-workflow.sql'])await db.exec(await readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 await db.exec('set role service_role');const call=async p=>(await db.query('select public.review_tracker_finance($1::jsonb) as v',[JSON.stringify(p)])).rows[0].v;
 const admin={unit:'hotel',actor:'admin',actorName:'Quản lý',admin:true},staff={unit:'hotel',actor:'staff',actorName:'Nhân viên',admin:false};
 await call({...admin,action:'scope',userId:'staff',access:'editor'});await call({...admin,action:'scope',userId:'viewer',access:'viewer'});
 const first=entry();const saved=await call({...staff,action:'save',entry:first});assert.equal((await call({...staff,action:'save',entry:first})).id,saved.id);
 await assert.rejects(()=>call({...staff,actor:'viewer',action:'save',entry:entry()}));
 await call({...admin,action:'review',id:saved.id,status:'returned',reason:'Thiếu chứng từ'});
 await assert.rejects(()=>call({...staff,actor:'other',action:'edit',id:saved.id,entry:first}));
 await call({...staff,action:'edit',id:saved.id,entry:{...first,counterparty:'Khách hàng'}});
 await call({...staff,action:'file_add',id:saved.id,fileId:randomUUID(),name:'invoice.pdf',mime:'application/pdf',bytes:20,path:randomUUID()});
 const duplicate=entry({reference:'INV001'});await call({...staff,action:'save',entry:duplicate});await assert.rejects(()=>call({...staff,action:'save',entry:{...duplicate,requestId:randomUUID()}}));const confirmed=await call({...staff,action:'save',entry:{...duplicate,requestId:randomUUID(),duplicateReason:'Hai đợt thu riêng'}});await call({...admin,action:'review',id:confirmed.id,status:'void',reason:'Không đưa vào thử quỹ'});const dupRow=(await call({...staff,action:'read',from:'2026-08-01',to:'2026-08-01'})).entries.find(e=>e.reference==='INV001'&&e.status!=='void');await call({...admin,action:'review',id:dupRow.id,status:'void',reason:'Không đưa vào thử quỹ'});
 const day=daily('2026-08-01');await call({...staff,action:'day_save',date:day.date,report:day});await call({...staff,action:'day_submit',date:day.date});
 await assert.rejects(()=>call({...staff,action:'save',entry:entry()}));await assert.rejects(()=>call({...admin,action:'review',id:saved.id,status:'posted',reason:'Bypass'}));
 await call({...admin,action:'day_review',date:day.date,status:'returned',reason:'Kiểm tra lại'});await call({...staff,action:'day_save',date:day.date,report:day});await call({...staff,action:'day_submit',date:day.date});await call({...admin,action:'day_review',date:day.date,status:'closed',reason:'Đã đối chiếu'});
 let report=await call({...staff,action:'read',from:'2026-08-01',to:'2026-08-31'});assert.equal(report.days[0].status,'closed');assert.equal(report.entries.find(e=>e.id===saved.id).status,'posted');assert.equal(report.files.length,1);assert.equal(report.files[0].object_path,undefined);assert.equal(report.entries.find(e=>e.id===saved.id).actorName,'Nhân viên');
 await assert.rejects(()=>call({...staff,action:'edit',id:saved.id,entry:first}));
 const later=daily('2026-08-02');later.opening.cash=100;later.counted.cash=100;await call({...staff,action:'day_save',date:later.date,report:later});await call({...staff,action:'day_submit',date:later.date});await call({...admin,action:'day_review',date:later.date,status:'closed',reason:'Không phát sinh'});await assert.rejects(()=>call({...admin,action:'day_review',date:day.date,status:'returned',reason:'Mở ngược'}));
 await call({...admin,action:'day_review',date:later.date,status:'returned',reason:'Mở lại'});await call({...admin,action:'day_review',date:day.date,status:'returned',reason:'Điều chỉnh'});
 await assert.rejects(()=>call({...staff,action:'month_review',month:'2026-08',status:'locked',reason:'test'}));
 await assert.rejects(()=>call({...admin,action:'month_review',month:'2026-08',status:'locked',reason:'Thiếu ngày'}));
 await db.exec("insert into public.review_tracker_finance_days(unit,day,status,report,actor) select 'month-test',v::date,'closed','{}','admin' from generate_series('2026-02-01'::timestamp,'2026-02-28'::timestamp,interval '1 day')v");
 await call({...admin,unit:'month-test',action:'month_review',month:'2026-02',status:'locked',reason:'Đã chốt đủ tháng'});
 await assert.rejects(()=>call({...admin,unit:'month-test',action:'save',entry:entry({date:'2026-02-01'})}));
 await assert.rejects(()=>call({...admin,unit:'month-test',action:'day_review',date:'2026-02-28',status:'returned',reason:'Không được vượt khóa tháng'}));
 await call({...admin,unit:'month-test',action:'month_review',month:'2026-02',status:'open',reason:'Mở kỳ kiểm tra'});
 const stock=(mode,quantity)=>entry({date:'2026-08-03',kind:'stock',category:'inventory',method:'none',stock:{sku:'A',name:'Hàng A',unit:'chai',mode,quantity,unitCost:10}});
 const input=await call({...staff,action:'save',entry:stock('opening',5)});await call({...admin,action:'review',id:input.id,status:'posted',reason:'Nhập đầu'});
 const output=await call({...staff,action:'save',entry:stock('out',6)});await assert.rejects(()=>call({...admin,action:'review',id:output.id,status:'posted',reason:'Vượt tồn'}));
 const use=await call({...staff,action:'save',entry:entry({date:'2026-08-03',kind:'deposit_use',category:'deposit',method:'none',depositRef:'NO-DEPOSIT'})});await assert.rejects(()=>call({...admin,action:'review',id:use.id,status:'posted',reason:'Vượt cọc'}));
 await db.exec('reset role;set role authenticated');await assert.rejects(()=>call({...admin,action:'read',from:'2026-08-01',to:'2026-08-31'}));await assert.rejects(()=>db.query('select * from public.review_tracker_finance_files'));
 }finally{await db.close();}
});
