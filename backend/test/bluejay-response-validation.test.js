import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blueJayGet,getAllReservations} from '../src/modules/bluejay/bluejay.js';
import {normalizeReservations,normalizeServices} from '../src/modules/bluejay/normalize.js';
import {putRecord,getRecord,recordKey} from '../src/modules/bluejay/store.js';

test('HTTP 200 malformed provider responses are rejected before pagination or storage writes',async()=>{
 const previous=globalThis.fetch,oldKey=process.env.BLUEJAY_API_KEY;
 process.env.BLUEJAY_API_KEY='test-only';
 let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({message:'Unavailable',data:null}),{headers:{'Content-Type':'application/json'}});};
 try{
  for(const path of ['report-room-occupancy','reservation','extraservice-sumary'])await assert.rejects(()=>blueJayGet(path));
  await assert.rejects(()=>getAllReservations({hotelId:5381}));
  const before=calls;
  for(const type of ['occupancy','reservations','services'])await assert.rejects(()=>putRecord(type,5381,{},{}));
  assert.equal(calls,before,'invalid data must never call persistent storage');
  globalThis.fetch=async()=>new Response(JSON.stringify({errors:{status:'Unauthorized'},data:{attributes:{reservations:[]}}}));
  await assert.rejects(()=>getAllReservations({hotelId:5381}));
  assert.throws(()=>normalizeReservations({errors:{status:'Unauthorized'},data:{attributes:{reservations:[]}}}));
 }finally{globalThis.fetch=previous;if(oldKey===undefined)delete process.env.BLUEJAY_API_KEY;else process.env.BLUEJAY_API_KEY=oldKey;}
});

test('explicit valid empty collections remain legitimate empty reports',()=>{
 assert.equal(normalizeReservations({attributes:{reservations:[]}}).totals.count,0);
 assert.equal(normalizeServices({data:[]}).groups.length,0);
 assert.throws(()=>normalizeReservations({data:null}));
 assert.throws(()=>normalizeServices({message:'No access'}));
});

test('successful refresh preserves previous valid snapshot and ignores invalid legacy cache',async()=>{
 const previous=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldSecret=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://cache.test';process.env.SUPABASE_SECRET_KEY='test-only';
 const records=new Map(),params={from:'2026-10-14',to:'2026-10-14',dateType:'3'},key=recordKey('reservations',5381,params);
 const original={type:'reservations',savedAt:'2026-10-14T01:16:00Z',value:{attributes:{reservations:[{bookingCode:'B1'}]}}};records.set(key,original);
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body),name=new URL(url).pathname.split('/').at(-1);let result=true;if(name==='review_tracker_kv_get')result=records.get(body.p_key)||null;if(name==='review_tracker_bluejay_cache_set')records.set(body.p_key,body.p_value);return new Response(JSON.stringify(result));};
 try{
  await putRecord('reservations',5381,params,{attributes:{reservations:[]}});
  assert.equal((await getRecord('reservations',5381,params)).value.attributes.reservations.length,0);
  records.set(key,{value:{errors:{status:'Unauthorized'}}});
  assert.deepEqual(await getRecord('reservations',5381,params),original);
  records.delete(recordKey('reservations',5381,{...params,__lastValid:true}));
  assert.equal(await getRecord('reservations',5381,params),null);
 }finally{globalThis.fetch=previous;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldSecret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldSecret;}
});
