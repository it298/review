import {test} from 'node:test';import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
import {recordKey} from '../src/modules/bluejay/store.js';
import {normalizeOccupancy} from '../src/modules/bluejay/normalize.js';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('Blue Jay cache is isolated by hotel, dataset and exact filters; missing occupancy never fabricates zeros',()=>{
 assert.equal(recordKey('occupancy',5381,{from:'2026-10-13',to:'2026-10-13'}),recordKey('occupancy','5381',{to:'2026-10-13',from:'2026-10-13'}));
 assert.notEqual(recordKey('occupancy',5381,{}),recordKey('occupancy',6836,{}));assert.notEqual(recordKey('occupancy',5381,{}),recordKey('services',5381,{}));
 assert.throws(()=>normalizeOccupancy({}));
});
test('Blue Jay cache migration keeps 366-day retention private and cannot overwrite review/OAuth keys',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated; create role service_role; create table public.review_tracker_kv(key text primary key,value jsonb,expires_at timestamptz); grant select,insert,update on public.review_tracker_kv to service_role;');
  const sql=await readFile(new URL('../../supabase/bluejay-module.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec('set role service_role');
  await db.query('select public.review_tracker_bluejay_cache_set($1,$2::jsonb)',['bluejay:record:'+'a'.repeat(64),JSON.stringify({score:80})]);
  const {rows}=await db.query("select expires_at>now()+interval '365 days' as retained from public.review_tracker_kv");assert.equal(rows[0].retained,true);
  await assert.rejects(()=>db.query('select public.review_tracker_bluejay_cache_set($1,$2::jsonb)',['google:oauth',JSON.stringify({anything:true})]));
  await db.exec('reset role; set role anon');await assert.rejects(()=>db.query('select public.review_tracker_bluejay_cache_set($1,$2::jsonb)',['bluejay:index','{}']));
 }finally{await db.close();}
});
test('both modules share authentication; Blue Jay rejects invalid inputs, keeps missing data distinct and reads persistent cache',async()=>{
 const originalFetch=globalThis.fetch;process.env.APP_PASSWORD='module-test-password-12345';process.env.SUPABASE_URL='https://supabase.test';process.env.SUPABASE_SECRET_KEY='test-only-key';delete process.env.BLUEJAY_API_KEY;
 const records=new Map();let providerCalls=0,providerData=null;
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);if(u.hostname==='supabase.test'){
   const body=JSON.parse(options.body),name=u.pathname.split('/').at(-1);let result=null;
   if(name==='review_tracker_kv_get')result=records.get(body.p_key)||null;
   if(name==='review_tracker_bluejay_cache_set'){records.set(body.p_key,body.p_value);result=true;}
   if(name==='review_tracker_lock'||name==='review_tracker_unlock')result=true;
   return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  }
  if(u.hostname==='api-pms.bluejaypms.com'){providerCalls++;assert.equal(options.headers.ApiKey,'test-provider-key');assert.equal(options.redirect,'error');if(!providerData)throw Error('Unexpected provider call without credentials');return new Response(JSON.stringify(providerData),{headers:{'Content-Type':'application/json'}});}
  return originalFetch(url,options);
 };
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+process.env.APP_PASSWORD};
 try{
  assert.equal((await fetch(base+'/api/bluejay/hotels')).status,401);
  let r=await fetch(base+'/api/bluejay/hotels',{headers}),hotels=await r.json();assert.equal(r.status,200);assert.equal(hotels.length,4);assert.ok(hotels.every(h=>h.entityKey));
  assert.equal((await fetch(base+'/api/bluejay/dashboard?from=2026-02-30&to=2026-03-01',{headers})).status,400);
  assert.equal((await fetch(base+'/api/bluejay/hotels/999/occupancy?from=2026-10-13&to=2026-10-13',{headers})).status,404);
  assert.equal((await fetch(base+'/api/bluejay/sync',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({from:'2026-10-13',to:'2026-10-13',hotelIds:[999],datasets:['occupancy']})})).status,400);
  let data=await(await fetch(base+'/api/bluejay/dashboard?from=2026-10-13&to=2026-10-13',{headers})).json();assert.equal(data.aggregate.occupancyRate,null);assert.equal(data.aggregate.total,null);assert.equal(data.aggregate.availableHotels,0);assert.equal(providerCalls,0);assert.ok(data.hotels.every(h=>h.error==='Chưa cấu hình BLUEJAY_API_KEY trên backend Render.'));
  const params={dateType:'1',from:'2026-10-13',to:'2026-10-13'},raw={data:{GrandTotal:{GrandTotalRoomOccupied:8,GrandTotalRoom:10,GrandTotalRoomEmpty:2,GrandTotalBlocked:0,GrandTotalOccupancyRate:80,RoomTypes:[]}}};
  records.set(recordKey('occupancy',5381,params),{savedAt:'2026-10-13T01:00:00Z',value:raw});
  data=await(await fetch(base+'/api/bluejay/hotels/5381/occupancy?from=2026-10-13&to=2026-10-13',{headers})).json();assert.equal(data.source,'cache');assert.equal(data.data.summary.occupancyRate,80);assert.equal(providerCalls,0);
  const status=await(await fetch(base+'/api/bluejay/status',{headers})).json();assert.equal(status.configured,false);assert.equal(status.autoSync,false);
  process.env.BLUEJAY_API_KEY='test-provider-key';providerData=raw;
  const refreshed=await fetch(base+'/api/bluejay/hotels/5381/occupancy?from=2026-10-13&to=2026-10-13&refresh=1',{headers});data=await refreshed.json();assert.equal(data.source,'live');assert.equal(data.data.summary.occupancyRate,80);assert.ok(records.has('bluejay:index'));assert.equal(JSON.stringify(data).includes('test-provider-key'),false);assert.equal(providerCalls,1);
  providerData=structuredClone(raw);providerData.data.GrandTotal.RoomTypes=[{RoomTypeId:99,RoomTypeName:'M-standard',RoomTypeTotalRoomOccupied:3,RoomTypeTotalRoom:4,RoomTypeTotalRoomEmpty:1},{RoomTypeId:1,RoomTypeName:'Standard',RoomTypeTotalRoomOccupied:5,RoomTypeTotalRoom:6,RoomTypeTotalRoomEmpty:1}];
  data=await(await fetch(base+'/api/bluejay/hotels/5381/occupancy?from=2026-10-13&to=2026-10-13&refresh=1',{headers})).json();assert.equal(data.data.summary.total,6);assert.equal(data.data.summary.occupied,5);assert.equal(data.data.roomTypes.length,1);
  delete process.env.BLUEJAY_API_KEY;
  data=await(await fetch(base+'/api/bluejay/dashboard?from=2026-10-13&to=2026-10-13',{headers})).json();assert.equal(data.aggregate.total,6);assert.equal(data.aggregate.occupied,5);assert.equal(data.aggregate.occupancyRate,83.33);assert.equal(data.hotels[0].source,'cache');assert.equal(data.hotels[0].data.roomTypes[0].name,'Standard');
 }finally{await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;}
});
