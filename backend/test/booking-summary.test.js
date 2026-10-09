import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateBookingSummary} from '../src/booking-summary-validation.js';
import {createApp} from '../src/app.js';
const input=()=>({entityKey:'vistara-gia-lai-sea-hotel',source:'booking',method:'dom',extranetPropertyId:'17212594',sourceUrl:'https://www.booking.com/hotel/vn/vistara-gia-lai-sea.vi.html',status:'success',rating:10,reviewCount:2,capturedAt:new Date().toISOString()});
test('normalizes Booking totals without retaining portal secrets, guest data or inferred counts',()=>{
 const value=validateBookingSummary({...input(),resolvedUrl:'secret',cookies:'secret',guestName:'secret'});
 assert.equal(value.ratingMax,10);assert.equal(value.sourceToken,'vn/vistara-gia-lai-sea');assert.equal(JSON.stringify(value).includes('secret'),false);
 for(const patch of [{source:'agoda'},{method:'api'},{extranetPropertyId:'vn/slug'},{rating:11},{rating:'10'},{reviewCount:'2'},{reviewCount:2.5},{reviewCount:null},{rating:null},{capturedAt:'2020-01-01'},{sourceUrl:'https://evil.test/hotel/vn/vistara-gia-lai-sea.vi.html'}])assert.throws(()=>validateBookingSummary({...input(),...patch}));
 assert.equal(validateBookingSummary({...input(),rating:0,reviewCount:0}).reviewCount,0);
});
test('Booking endpoints require the existing private worker secret',async()=>{
 const server=createApp().listen(0);try{const base='http://localhost:'+server.address().port;for(const [method,path] of [['GET','targets'],['POST','results']]){const response=await fetch(base+'/api/booking/worker/'+path,{method,headers:{Authorization:'Bearer wrong'}});assert.equal(response.status,401);}}finally{await new Promise(done=>server.close(done));}
});
test('enrolled ID and public identity bind each write; history, stale data and failed refreshes are preserved',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));grant all on review_tracker_ota_pilot to service_role;');
  for(const file of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('vistara-gia-lai-sea-hotel','Vistara Gia Lai Sea Hotel','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('vistara-gia-lai-sea-hotel','booking','https://www.booking.com/hotel/vn/vistara-gia-lai-sea.vi.html');");
  const sql=await fs.readFile(new URL('../../supabase/booking-extranet.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);await db.exec('set role service_role;');
  const ingest=async p=>(await db.query('select review_tracker_booking_summary_ingest($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
  const p=validateBookingSummary(input());assert.equal((await ingest(p)).status,'success');
  const targets=(await db.query('select review_tracker_booking_targets_read() as data')).rows[0].data;assert.equal(targets.length,1);assert.equal(targets[0].extranet_property_id,'17212594');
  for(const patch of [{extranetPropertyId:'1'},{extranetPropertyId:null},{method:'ocr'},{collectionContext:null},{source:null},{sourceUrl:p.sourceUrl.replace('vistara-gia-lai-sea','other')},{rating:11},{reviewCount:null},{capturedAt:null}])await assert.rejects(()=>ingest({...p,...patch}));
  assert.equal((await ingest({...p,capturedAt:new Date(Date.now()-1000).toISOString(),rating:9})).status,'stale');
  await ingest(validateBookingSummary({...input(),status:'failed',error:'login_required'}));
  const saved=(await db.query("select rating,review_count,collection_method from review_tracker_directory_sources where source='booking'")).rows[0];assert.equal(Number(saved.rating),10);assert.equal(saved.review_count,2);assert.equal(saved.collection_method,'dom');
  const history=(await db.query("select * from review_tracker_source_history where source='booking' order by id")).rows;assert.equal(history.length,2);assert.equal(history[0].status,'success');assert.equal(history[0].review_count,2);assert.equal(history[1].status,'failed');assert.equal(history[1].rating,null);
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select review_tracker_booking_targets_read()'),/permission denied/);await assert.rejects(()=>ingest(p),/permission denied/);
 }finally{await db.close();}
});
