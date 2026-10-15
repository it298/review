import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {createFinanceRouter} from '../src/modules/finance/router.js';
test('HTTP staff cannot fetch management data; manager authority is confined to assigned units',async()=>{
 const old=globalThis.fetch,env={...process.env},calls=[];
 process.env.SUPABASE_URL='https://roles-test.local';process.env.SUPABASE_SECRET_KEY='fixture';
 globalThis.fetch=async(url,options)=>{
  if(new URL(url).hostname!=='roles-test.local')return old(url,options);
  const p=JSON.parse(options.body).p;calls.push(p);
  if(p.action==='scopes')return Response.json(p.actor==='manager'?[{unit:'sontra-sea-hotel',access:'manager'},{unit:'quy-nhon-sea-hotel',access:'editor'}]:[{unit:'sontra-sea-hotel',access:'editor'}]);
  if(p.action==='read')return Response.json({entries:[{id:1,kind:'receipt',amount:10,date:'2026-10-01',method:'cash',status:'posted',category:'sales'},{id:2,kind:'expense',description:'PRIVATE PAYROLL',category:'payroll',amount:50000,date:'2026-10-01',method:'none',status:'posted'}],history:[],days:[],audit:[{private:'audit'}],files:[{id:'a',entry_id:1},{id:'b',entry_id:2}]});
  return Response.json({ok:true});
 };
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.user={id:req.headers['test-role']||'member',role:req.headers['test-role']||'member'};next();});app.use('/finance',createFinanceRouter());app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/finance',query='?unit=sontra-sea-hotel&from=2026-10-01&to=2026-10-02';
 try{
  const r=await old(base+'/report'+query),staff=await r.json();assert.equal(r.status,200);assert.equal(staff.summary,undefined);assert.equal(staff.audit,undefined);assert.equal(staff.entries.length,1);assert.equal(staff.files.length,1);assert.equal(JSON.stringify(staff).includes('PRIVATE PAYROLL'),false);assert.equal(staff.inventory.costOfGoods,undefined);
  assert.equal((await old(base+'/dashboard?from=2026-10-01&to=2026-10-02')).status,403);
  const managerHeaders={'test-role':'manager','Content-Type':'application/json'};
  const units=await (await old(base+'/units',{headers:managerHeaders})).json();assert.deepEqual(units.units.map(u=>u.key),['sontra-sea-hotel']);
  const manager=await old(base+'/report'+query,{headers:managerHeaders});assert.equal(manager.status,200);assert.equal((await manager.json()).summary.expenses,50000);assert.equal(calls.findLast(c=>c.action==='read').admin,true);
  assert.equal((await old(base+'/report'+query.replace('sontra-sea-hotel','quy-nhon-sea-hotel'),{headers:managerHeaders})).status,403);
  assert.equal((await old(base+'/scope',{method:'POST',headers:managerHeaders,body:'{}'})).status,403);
  const dashboard=await (await old(base+'/dashboard?from=2026-10-01&to=2026-10-02',{headers:managerHeaders})).json();assert.equal(dashboard.units.length,1);
  assert.equal((await old(base+'/books/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin:true,status:'posted'})})).status,403);
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=old;process.env=env;}
});
