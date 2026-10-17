import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {financeSummary,validateFinanceEntry,reconcileDay} from '../../shared/finance.js';
const fixture=()=>({requestId:'11111111-1111-4111-8111-111111111111',date:'2026-08-01',kind:'receipt',category:'deposit',method:'bank',amount:500000,description:'Nhận cọc',depositRef:'BK001'});
test('card settlement preserves method balances and cannot become another revenue or expense',()=>{
 const entry=extra=>({...validateFinanceEntry({...fixture(),category:'card_settlement',description:'Đối soát tiền thẻ',...extra}),status:'posted'}),entries=[entry({category:'minibar',method:'card',amount:100000}),entry({method:'bank',amount:97000}),entry({method:'card',amount:-100000})],summary=financeSummary(entries),balances=reconcileDay(entries);
 assert.equal(summary.receipts,97000);assert.equal(summary.cashChange,97000);assert.equal(summary.revenue,null);assert.equal(summary.expenses,0);assert.equal(balances.find(r=>r.method==='card').expected,0);assert.equal(balances.find(r=>r.method==='bank').expected,97000);
 for(const kind of ['revenue','expense'])assert.throws(()=>entry({kind,method:'none',amount:100}),/chỉ điều chỉnh dòng tiền/);assert.throws(()=>entry({kind:'payment',method:'bank',amount:100,recognizeExpense:true}),/xử lý riêng/);
});
test('cash, revenue and expenses are separate; drafts/void do not affect results, signed adjustments preserved',()=>{
 const r=validateFinanceEntry(fixture());
 const s=financeSummary([{...r,status:'posted'},{...r,kind:'payment',category:'operations',amount:100000,recognizeExpense:true,status:'posted'},{...r,kind:'payment',category:'inventory',amount:200000,status:'posted'},{...r,kind:'revenue',category:'room',amount:900000,status:'posted'},{...r,kind:'expense',category:'rent',amount:150000,status:'posted'},{...r,kind:'receipt',amount:-50000,status:'posted'},{...r,amount:9999999,status:'draft'},{...r,amount:9999999,status:'void'}]);
 assert.equal(s.receipts,450000);assert.equal(s.payments,300000);assert.equal(s.revenue,900000);assert.equal(s.expenses,250000);assert.equal(s.provisionalResult,650000);assert.equal(s.cashChange,150000);assert.equal(s.drafts,1);
 assert.equal(financeSummary([{...r,status:'posted'}]).revenue,null);
 assert.throws(()=>validateFinanceEntry({...fixture(),kind:'revenue',method:'none'}));
 assert.throws(()=>validateFinanceEntry({...fixture(),kind:'payment',category:'inventory',recognizeExpense:true}));
 assert.throws(()=>validateFinanceEntry({...fixture(),date:'2026-02-30'}));
 assert.throws(()=>validateFinanceEntry({...fixture(),amount:1.2}));
 assert.throws(()=>validateFinanceEntry({...fixture(),category:'constructor'}));
});
test('finance SQL isolates units, idempotent writes, review trail and private service-only access',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const sql=await readFile(new URL('../../supabase/finance-module.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec('set role service_role');
  const call=async p=>(await db.query('select public.review_tracker_finance($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
  const admin={actor:'admin',admin:true,unit:'sontra-sea-hotel'};
  await call({...admin,action:'scope',userId:'member',access:'editor'});
  const member={actor:'member',admin:false,unit:admin.unit},entry=validateFinanceEntry(fixture());
  await assert.rejects(()=>call({...member,action:'read',unit:'another',from:'2026-08-01',to:'2026-08-31'}));
  const saved=await call({...member,action:'save',entry});assert.equal((await call({...member,action:'save',entry})).id,saved.id);
  await assert.rejects(()=>call({...member,action:'save',entry:{...entry,amount:100}}));
  await assert.rejects(()=>call({...member,action:'review',id:saved.id,status:'posted',reason:'test'}));
  await call({...admin,action:'review',id:saved.id,status:'posted',reason:'Đối soát'});
  let report=await call({...member,action:'read',from:'2026-08-01',to:'2026-08-31'});assert.equal(report.entries.length,1);assert.equal(report.entries[0].status,'posted');
  await call({...admin,action:'review',id:saved.id,status:'void',reason:'Điều chỉnh'});
  report=await call({...member,action:'read',from:'2026-08-01',to:'2026-08-31'});assert.equal(report.entries[0].status,'void');
  assert.equal((await db.query('select count(*)::int as n from public.review_tracker_finance_audit')).rows[0].n,4);
  await db.exec('reset role;set role anon');await assert.rejects(()=>call({...admin,action:'read',from:'2026-08-01',to:'2026-08-31'}));
  await assert.rejects(()=>db.query('select * from public.review_tracker_finance_entries'));
 }finally{await db.close();}
});

test('finance HTTP derives identity from session and refuses cross-property and administrative writes',async()=>{
 const {default:express}=await import('express');const {once}=await import('node:events');const {createFinanceRouter}=await import('../src/modules/finance/router.js');
 const previousFetch=globalThis.fetch,previousUrl=process.env.SUPABASE_URL,previousKey=process.env.SUPABASE_SECRET_KEY,calls=[];
 process.env.SUPABASE_URL='https://finance-test.local';process.env.SUPABASE_SECRET_KEY='test-only';
 globalThis.fetch=async(url,options)=>{
  if(new URL(url).hostname!=='finance-test.local')return previousFetch(url,options);
  const p=JSON.parse(options.body).p;calls.push(p);
  return new Response(JSON.stringify(p.action==='scopes'?[{unit:'sontra-sea-hotel',access:'editor'}]:{ok:true,id:1}),{headers:{'Content-Type':'application/json'}});
 };
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:'real-member',role:'member'};next();});app.use('/finance',createFinanceRouter());app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/finance',headers={'Content-Type':'application/json'};
 try{
  const write=await fetch(url+'/entries',{method:'POST',headers,body:JSON.stringify({...fixture(),unit:'sontra-sea-hotel',admin:true,actor:'spoofed'})});assert.equal(write.status,200);
  const saved=calls.find(c=>c.action==='save');assert.equal(saved.actor,'real-member');assert.equal(saved.admin,false);assert.equal(saved.entry.actor,undefined);
  assert.equal((await fetch(url+'/entries',{method:'POST',headers,body:JSON.stringify({...fixture(),unit:'quy-nhon-sea-hotel'})})).status,403);
  assert.equal((await fetch(url+'/review',{method:'POST',headers,body:JSON.stringify({unit:'sontra-sea-hotel',id:1,status:'posted',reason:'x',admin:true})})).status,403);
  assert.equal((await fetch(url+'/entries',{method:'POST',headers,body:JSON.stringify({...fixture(),unit:'sontra-sea-hotel',kind:'revenue',category:'room',method:'none'})})).status,403);
  assert.equal((await fetch(url+'/scope',{method:'POST',headers,body:'{}'})).status,403);
 }finally{
  await new Promise(r=>server.close(r));globalThis.fetch=previousFetch;
  if(previousUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=previousUrl;
  if(previousKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=previousKey;
 }
});
