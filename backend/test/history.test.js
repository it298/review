import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {dailyHistory,historyChange,localDay} from '../../frontend/src/lib/history.js';
test('daily series respects Vietnam midnight, missing days, partial observations and approximate totals',()=>{
 const rows=[{status:'success',rating:4.8,review_count:100,rating_at:'2026-10-05T18:00:00Z',count_at:'2026-10-05T18:00:00Z'},{status:'partial',rating:4.7,rating_at:'2026-10-08T00:00:00Z'},{status:'partial',count_display:'50+',review_count:50,count_at:'2026-10-08T01:00:00Z'},{status:'failed',rating:0,rating_at:'2026-10-08T02:00:00Z'}];
 const points=dailyHistory(rows);assert.equal(localDay(rows[0].rating_at),'2026-10-06');assert.equal(points.length,3);assert.equal(points[1].rating,null);assert.equal(points[2].review_count,null);assert.equal(historyChange(points,'rating').change,-0.1);assert.equal(historyChange(points,'review_count').change,null);
});
test('history preserves each refresh without relabeling retained data as freshly read; deferred OTA trigger reads committed summary',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));grant all on review_tracker_ota_pilot to service_role;');
  for(const f of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','source-history.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('test','Hotel','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('test','google','https://google.com/maps/test');insert into review_tracker_ota_targets(source,property_id,property_name,hotel_key,source_url) values('agoda','1','Hotel','test','https://agoda.com/hotel');set role service_role;");
  const google=p=>db.query('select review_tracker_google_summary_ingest($1::jsonb)',[JSON.stringify({entityKey:'test',placeToken:'test',method:'dom',...p})]);
  await google({status:'success',rating:4.8,reviewCount:100,capturedAt:new Date(Date.now()-3000).toISOString()});
  await google({status:'success',rating:4.7,reviewCount:null,capturedAt:new Date(Date.now()-1000).toISOString()});
  await google({status:'failed',error:'blocked'});
  let rows=(await db.query("select * from review_tracker_source_history where source='google' order by id")).rows;
  assert.deepEqual(rows.map(r=>r.status),['success','partial','failed']);assert.equal(rows[1].review_count,null);assert.equal(rows[2].rating,null);
  const ota=p=>db.query('select review_tracker_ota_ingest($1::jsonb)',[JSON.stringify({source:'agoda',propertyId:'1',method:'dom',reviews:[],...p})]);
  await ota({status:'success',summary:{rating:9.3,count:150},capturedAt:new Date().toISOString()});
  await ota({status:'failed',error:'blocked'});
  rows=(await db.query("select * from review_tracker_source_history where source='agoda' order by id")).rows;
  assert.equal(rows[0].status,'success');assert.equal(Number(rows[0].rating),9.3);assert.equal(rows[0].review_count,150);assert.equal(rows[1].status,'failed');assert.equal(rows[1].review_count,null);
  const read=(await db.query("select review_tracker_source_history_read('test','agoda',30) as data")).rows[0].data;assert.equal(read.observations.length,1);assert.equal(read.runs.length,2);
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query("select review_tracker_source_history_read('test','google',30)"),/permission denied/);
 }finally{await db.close();}
});
