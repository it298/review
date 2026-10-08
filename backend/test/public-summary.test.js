import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublicSummary,publicSourceIdentity} from '../src/public-summary-validation.js';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {directoryRows} from '../../frontend/src/lib/directory.js';
const booking={entityKey:'yzistel-hoi-an-39-le-quy-don',source:'booking',status:'success',method:'dom',sourceUrl:'https://www.booking.com/hotel/vn/yzistel.vi.html',resolvedUrl:'https://www.booking.com/hotel/vn/yzistel.en-gb.html?chal_t=123',rating:9.5,reviewCount:175,capturedAt:new Date().toISOString()};
test('accepts language redirect for same property, rejects a different hotel',()=>{assert.equal(validatePublicSummary(booking).sourceToken,'vn/yzistel');assert.throws(()=>validatePublicSummary({...booking,resolvedUrl:'https://www.booking.com/hotel/vn/some-other-hotel.vi.html'}));});
test('rejects off-platform redirect, wrong scale and stale OCR input',()=>{assert.throws(()=>validatePublicSummary({...booking,resolvedUrl:'https://www.booking.com.evil.test/hotel/vn/yzistel.vi.html'}));assert.throws(()=>validatePublicSummary({...booking,rating:10.1}));assert.throws(()=>validatePublicSummary({...booking,method:'ocr'}));assert.throws(()=>validatePublicSummary({...booking,capturedAt:'2020-01-01'}));});
test('does not convert ShopeeFood 10+ into an exact count or missing rating into zero',()=>{const p=validatePublicSummary({...booking,source:'shopee',sourceUrl:'https://shopeefood.vn/now-food/shop/1288503',resolvedUrl:'https://shopeefood.vn/now-food/shop/1288503',rating:null,reviewCount:null,countDisplay:'10+'});assert.equal(p.rating,null);assert.equal(p.reviewCount,null);assert.equal(p.countDisplay,'10+');assert.throws(()=>validatePublicSummary({...p,reviewCount:10}));});
test('Grab ratings remain distinguishable from written reviews',()=>{const p=validatePublicSummary({...booking,source:'grab',sourceUrl:'https://r.grab.com/g/foo-5-C7A1JXMWFGADDE',resolvedUrl:'https://food.grab.com/vn/en/restaurant/vintage-delivery/5-C7A1JXMWFGADDE',rating:4.7,reviewCount:46,countKind:'ratings'});assert.equal(p.countKind,'ratings');assert.equal(publicSourceIdentity('tripadvisor','https://www.tripadvisor.com.vn/Hotel_Review-g298082-d33037118-Reviews-Yzistel.html'),'33037118');});
test('public ingestion preserves values on failures, protects identity, scale, stale fields and service-role access',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_targets(source text,hotel_key text,enabled boolean);grant select on review_tracker_ota_targets to service_role;');
  for(const f of ['schema.sql','directory.sql','google-public-summary.sql','public-source-summary.sql','public-source-summary.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('yzistel-hoi-an-39-le-quy-don','Yzistel','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('yzistel-hoi-an-39-le-quy-don','booking','https://www.booking.com/hotel/vn/yzistel.vi.html');set role service_role;");
  const ingest=async p=>(await db.query('select review_tracker_public_summary_ingest($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
  const p=validatePublicSummary(booking);await ingest(p);await ingest({...p,rating:9.6,reviewCount:null,capturedAt:new Date(Date.now()+1000).toISOString()});await ingest({...p,status:'failed',error:'blocked'});
  const dir=(await db.query('select review_tracker_directory_read() as data')).rows[0].data;
  const saved=directoryRows(dir,{places:[],rows:[]},[],[])[0].readings.booking;assert.equal(Number(saved.rating),9.6);assert.equal(saved.review_count,175);assert.equal(Number(saved.rating_max),10);assert.equal(saved.last_error,'blocked');assert.notEqual(saved.rating_captured_at,saved.count_captured_at);
  assert.equal((await ingest({...p,capturedAt:'2020-01-01T00:00:00Z'})).status,'stale');
  await assert.rejects(()=>ingest({...p,sourceUrl:'https://www.booking.com/hotel/vn/another.vi.html'}),/identity changed/);await assert.rejects(()=>ingest({...p,ratingMax:5}),/scale/);
  await db.exec("reset role;insert into review_tracker_directory_sources(entity_key,source,source_url) values('yzistel-hoi-an-39-le-quy-don','shopee','https://shopeefood.vn/now-food/shop/1');set role service_role;");
  const shopee={...p,source:'shopee',sourceUrl:'https://shopeefood.vn/now-food/shop/1',sourceToken:'1',ratingMax:5,rating:null,reviewCount:1};await ingest(shopee);await ingest({...shopee,reviewCount:null,countDisplay:'10+',capturedAt:new Date(Date.now()+2000).toISOString()});
  const partial=(await db.query("select review_count,count_display,count_captured_at,count_display_captured_at from review_tracker_directory_sources where source='shopee'")).rows[0];assert.equal(partial.review_count,1);assert.equal(partial.count_display,'10+');assert.notEqual(partial.count_captured_at,partial.count_display_captured_at);
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select review_tracker_public_targets_read()'),/permission denied/);
 }finally{await db.close();}
});
