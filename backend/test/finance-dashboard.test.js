import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {financeReport} from '../src/modules/finance/report.js';
import {buildFinanceDashboard,dashboardTotals,groupDashboardTrend} from '../../shared/finance-dashboard.js';
import {createFinanceRouter} from '../src/modules/finance/router.js';
const e=(kind,amount,extra={})=>({date:'2026-10-01',kind,amount,category:'room',method:'cash',status:'posted',...extra});
const report=entries=>financeReport({entries,history:entries.filter(e=>e.kind==='stock'),days:[],files:[]},'2026-10-01','2026-10-03');
test('dashboard respects missing data, partial revenue, signed corrections and filter totals',()=>{
 const first=report([e('receipt',100),e('receipt',-10),e('payment',20,{category:'operations',recognizeExpense:true}),e('revenue',200),e('expense',30,{category:'rent'}),e('receipt',999,{status:'draft'})]);
 first.days=[{day:'2026-10-02',status:'submitted',report:{expected:{cash:10},counted:{cash:15},shift:'Lan'}}];
 const second=report([e('receipt',300),e('payment',60)]);
 const empty=report([]),closedEmpty=report([]);closedEmpty.days=[{day:'2026-10-02',status:'closed',report:{expected:{cash:0},counted:{cash:0}}}];
 const response=buildFinanceDashboard([{unit:{key:'a',name:'Hotel A',category:'hotel'},report:first},{unit:{key:'b',name:'Hotel B',category:'hotel'},report:second},{unit:{key:'c',name:'Shop C',category:'store'},report:empty},{unit:{key:'d',name:'Cafe D',category:'cafe'},report:closedEmpty},{unit:{key:'x',name:'Unknown'},error:'failed'}],'2026-10-01','2026-10-03','2026-10-02');
 assert.deepEqual(response.dates,['2026-10-01','2026-10-02']);
 const total=dashboardTotals(response.units,response.dates);assert.equal(total.receipts,390);assert.equal(total.payments,80);assert.equal(total.cashChange,310);assert.equal(total.revenue,200);assert.equal(total.expenses,50);assert.equal(total.result,150);assert.equal(total.known,3);assert.equal(total.recognized,1);assert.equal(total.unavailable,1);assert.equal(total.expected,8);assert.equal(total.statuses.missing,6);assert.equal(total.statuses.submitted,1);assert.equal(total.closeRate,13);assert.equal(total.pendingEntries,1);assert.equal(total.differences[0].difference,5);assert.equal(total.daily[1].receipts,0);assert.equal(total.daily[1].revenue,null);assert.equal(total.costs.reduce((s,c)=>s+c.amount,0),50);
 const selected=dashboardTotals(response.units.filter(u=>u.category==='store'),response.dates);assert.equal(selected.receipts,null);assert.equal(selected.result,null);assert.equal(selected.daily[0].receipts,null);
 const noData=dashboardTotals(response.units.filter(u=>!u.available),response.dates);assert.equal(noData.expected,0);assert.equal(noData.closeRate,null);assert.equal(JSON.stringify(response).includes('999'),false);
});
test('dashboard costs match inventory-aware report and month/week grouping preserves gaps',()=>{
 const stock=(mode,quantity,unitCost,id)=>e('stock',1,{id,method:'none',category:'inventory',stock:{mode,quantity,unitCost,sku:'A',unit:'chai',name:'Water'}});
 const entries=[stock('opening',10,5,1),stock('out',2,0,2),e('expense',20,{category:'rent'}),e('payment',5,{category:'operations',recognizeExpense:true}),e('revenue',100)];
 const r=report(entries);assert.equal(r.summary.expenses,35);assert.equal(r.summary.days[0].expenses,35);
 const data=buildFinanceDashboard([{unit:{key:'a',name:'A'},report:r}],'2026-10-01','2026-10-03','2026-10-03'),t=dashboardTotals(data.units,data.dates);assert.equal(t.costs.reduce((n,c)=>n+c.amount,0),35);assert.equal(t.result,65);assert.equal(t.daily[1].receipts,null);
 const grouped=groupDashboardTrend(t.daily,'month');assert.equal(grouped.length,1);assert.equal(grouped[0].revenue,100);assert.equal(grouped[0].expenses,35);
 assert.equal(groupDashboardTrend([{date:'2026-10-04',receipts:1},{date:'2026-10-05',receipts:2}],'week').length,2);
});
test('dashboard endpoint is admin-only, validates dates, limits concurrency and preserves a failed unit',async()=>{
 const old=globalThis.fetch,env={...process.env};process.env.SUPABASE_URL='https://dashboard-test.local';process.env.SUPABASE_SECRET_KEY='test-only';let concurrent=0,max=0,calls=0;
 globalThis.fetch=async(url,options={})=>{if(new URL(url).hostname!=='dashboard-test.local')return old(url,options);const p=JSON.parse(options.body).p;assert.equal(p.actor,'session-user');assert.equal(p.admin,true);assert.equal(p.action,'read');calls++;concurrent++;max=Math.max(max,concurrent);await new Promise(r=>setTimeout(r,5));concurrent--;if(p.unit==='sontra-sea-hotel')return Response.json({message:'private provider error'},{status:500});return Response.json({entries:[],days:[],history:[]});};
 const app=express();app.use((req,_res,next)=>{req.user={id:'session-user',role:req.headers['test-role']||'member'};next();});app.use('/finance',createFinanceRouter());app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/finance/dashboard';
 try{assert.equal((await old(base+'?from=2026-10-01&to=2026-10-03&admin=true')).status,403);assert.equal(calls,0);assert.equal((await old(base+'?from=2026-02-30&to=2026-10-03',{headers:{'test-role':'admin'}})).status,400);assert.equal((await old(base+'?from=2024-01-01&to=2026-10-03',{headers:{'test-role':'admin'}})).status,400);
 const response=await old(base+'?from=2026-10-01&to=2026-10-03',{headers:{'test-role':'admin'}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.units.length,14);assert.equal(data.units.filter(u=>!u.available).length,1);assert.equal(max,3);assert.equal(JSON.stringify(data).includes('private provider'),false);assert.equal(data.units.find(u=>u.key==='sontra-sea-hotel').available,false);
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=old;process.env=env;}
});
