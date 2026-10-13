import {test} from 'node:test';import assert from 'node:assert/strict';import {once} from 'node:events';
import {createApp} from '../src/app.js';import {validatePayables,summarizePayables} from '../../shared/bluejay-payables.js';
import {parsePayablesRows} from '../../frontend/src/modules/bluejay/payables-import.js';
const fixture=()=>({hotelId:5381,from:'2026-10-01',to:'2026-10-31',currency:'VND',capturedAt:'2026-10-13T02:00:00Z',rows:[{bookingCode:'001',channelCode:'1234',roomType:'Standard',status:'Check Out',source:'Agoda',checkInDay:'2026-10-01',checkOutDay:'2026-10-02',totalPrice:1000,payment:100,balance:700,deposit:200,cityLedger:null}],reportedTotals:{totalPrice:1000,payment:100,balance:700,deposit:200}});
test('payables preserve actual balance separately from deposits and reject incomplete or invalid reports',()=>{
 const r=validatePayables(fixture());assert.equal(summarizePayables(r).groups[0].balance,700);assert.equal(r.rows[0].deposit,200);
 const bad=fixture();bad.rows[0].balance=null;assert.throws(()=>validatePayables(bad));const missing=fixture();missing.rows=[];assert.throws(()=>validatePayables(missing));
 const wrong=fixture();wrong.to='2026-02-30';assert.throws(()=>validatePayables(wrong));const currency=fixture();currency.currency='USD';assert.throws(()=>validatePayables(currency));
 const spoof=fixture();spoof.rows[0].guestName='not retained';spoof.anything='not retained';const clean=validatePayables(spoof);assert.equal(clean.rows[0].guestName,undefined);assert.equal(clean.anything,undefined);
});
test('Bluejay Excel parser keeps identifiers, dates and checks provider grand total',()=>{
 const matrix=[['BÁO CÁO CÔNG NỢ'],['Từ ngày 01/10/2026 0:00 đến ngày 31/10/2026 23:59 | Nguồn: Tất cả | Đơn vị tính: VND'],[],[],['Mã','Channel Code','Khách','Loại phòng','Trạng thái','Ngày nhận phòng','Ngày trả phòng','Nguồn','Số tiền','Thanh toán','Dư nợ','Đặt cọc','City ledger'],[],[null,null,null,null,null,null,null,null,'Tổng',1000,100,700,200],['0001','1234','Private guest','Standard','No Show',46296,46297,'Agoda',1000,100,700,200,'']];
 const r=parsePayablesRows(matrix,{hotelId:5381});assert.equal(r.rows[0].bookingCode,'0001');assert.equal(r.rows[0].checkOutDay,'2026-10-02');assert.equal(r.rows[0].status,'No Show');assert.equal(r.rows[0].guestName,undefined);
 matrix[7][10]=699;assert.throws(()=>parsePayablesRows(matrix,{hotelId:5381}));
});
test('authenticated payables imports persist snapshots and exact ranges while missing hotels stay blank',async()=>{
 process.env.APP_PASSWORD='payables-test-password-long';process.env.AUTH_MODE='password';process.env.SUPABASE_URL='https://supabase.test';process.env.SUPABASE_SECRET_KEY='test-only-key';const original=globalThis.fetch,records=new Map();globalThis.fetch=async(url,options)=>{const u=new URL(url);if(u.hostname!=='supabase.test')return original(url,options);const b=JSON.parse(options.body),name=u.pathname.split('/').at(-1);let result=null;if(name==='review_tracker_kv_get')result=records.get(b.p_key)||null;if(name==='review_tracker_bluejay_cache_set'){records.set(b.p_key,b.p_value);result=true;}if(name==='review_tracker_lock'||name==='review_tracker_unlock')result=true;return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});};
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port+'/api/bluejay',headers={Authorization:'Bearer '+process.env.APP_PASSWORD,'Content-Type':'application/json'};
 try{assert.equal((await fetch(base+'/payables?from=2026-10-01&to=2026-10-31')).status,401);
  assert.equal((await fetch(base+'/payables/import',{method:'POST',headers,body:JSON.stringify({...fixture(),hotelId:999})})).status,400);
  const imported=await fetch(base+'/payables/import',{method:'POST',headers,body:JSON.stringify(fixture())});assert.equal(imported.status,200);assert.equal((await imported.json()).data.totals.balance,700);
  const report=await(await fetch(base+'/payables?from=2026-10-01&to=2026-10-31',{headers})).json();assert.equal(report.availableHotels,1);assert.equal(report.hotels.length,4);assert.equal(report.hotels[1].data,null);
  const other=await(await fetch(base+'/payables?from=2026-10-02&to=2026-10-31',{headers})).json();assert.equal(other.availableHotels,0);
  const log=await(await fetch(base+'/payables/history?hotelId=5381',{headers})).json();assert.equal(log.length,1);assert.equal(log[0].balance,700);
  assert.equal((await fetch(base+'/payables?from=2026-02-30&to=2026-10-31',{headers})).status,400);
 }finally{await new Promise(r=>server.close(r));globalThis.fetch=original;}
});
