import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {methodLabel,readingMethods,observationAge} from '../../frontend/src/lib/provenance.js';
import {mergeReading} from '../../frontend/src/lib/directory.js';

test('provenance describes actual fields, including mixed methods and zero reviews',()=>{
 assert.equal(methodLabel('extranet'),'Đọc từ Extranet');
 assert.deepEqual(readingMethods({review_count:0,count_method:'extranet',rating_method:'manual',collection_method:'manual'}),[{method:'extranet',label:'Đọc từ Extranet',fields:'Tổng đánh giá'}]);
 const mixed=readingMethods({rating:4.9,review_count:77,rating_method:'dom',count_method:'manual',collection_method:'manual'});
 assert.deepEqual(mixed.map(m=>m.method),['dom','manual']);
 const at='2026-10-10T07:24:14Z';
 assert.equal(mergeReading({rating:4.9,rating_captured_at:at,rating_method:'extranet'},{rating:4.9,captured_at:at,collection_method:'dom'}).rating_method,'extranet');
 assert.equal(mergeReading({rating:4.9,rating_captured_at:at,rating_method:'extranet'},{rating:5,captured_at:'2026-10-10T08:00:00Z',collection_method:'dom'}).rating_method,'dom');
});

test('age uses capture time and does not claim freshness for invalid or future times',()=>{
 const now=Date.parse('2026-10-10T08:00:00Z');
 for(const [offset,label] of [[0,'Vừa ghi nhận'],[60000,'1 phút trước'],[59*60000,'59 phút trước'],[3600000,'1 giờ trước'],[86400000,'1 ngày trước']])assert.equal(observationAge(new Date(now-offset).toISOString(),now),label);
 assert.equal(observationAge('bad',now),'');assert.equal(observationAge(new Date(now+1000).toISOString(),now),'');
});

test('Extranet correction is repeatable, preserves captures and excludes other manual entries',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
  for(const name of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','tripadvisor-ranking.sql','manual-summary.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory(entity_key,name,category,relationship) values('sontra-sea-hotel','Sontra','hotel','managed');insert into review_tracker_directory_sources(entity_key,source,source_url) values('sontra-sea-hotel','tripadvisor','https://www.tripadvisor.com/Hotel_Review-g1-d24979323-Reviews-Sontra.html');");
  const payload={entityKey:'sontra-sea-hotel',source:'tripadvisor',rating:4.9,reviewCount:159,capturedAt:'2026-10-10T07:17:55.816Z',requestId:'0a261010-0000-4000-8000-000000000001',note:'Tripadvisor Management Center · đọc từ tài khoản đã cấp quyền; locationId=24979323 · Hạng 708/708 khách sạn tại Đà Nẵng'};
  // Fixture uses the observed historical timestamp independent of today's clock.
  await db.query("insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key,note,entered_at) values($1,'tripadvisor',$2,'success',4.9,5,159,$2,$2,'manual','manual',$3,$4,'2026-10-10T08:00:00Z')",[payload.entityKey,payload.capturedAt,payload.requestId,payload.note]);
  await db.exec("update review_tracker_directory_sources set rating=4.9,review_count=159,rating_captured_at='2026-10-10T07:17:55.816Z',count_captured_at='2026-10-10T07:17:55.816Z';");
  await db.query("insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,method,origin,origin_key,note) values($1,'tripadvisor','2026-10-10T06:00:00Z','partial',4.8,5,'manual','manual','ordinary-input',$2)",[payload.entityKey,payload.note]);
  const before=(await db.query('select * from review_tracker_source_history order by id')).rows;
  const migration=await fs.readFile(new URL('../../supabase/tripadvisor-extranet-provenance.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  const after=(await db.query('select * from review_tracker_source_history order by id')).rows;
  assert.deepEqual(after,[{...before[0],method:'extranet'},before[1]]);
  const source=(await db.query('select review_tracker_directory_read() as data')).rows[0].data[0].sources[0];
  assert.equal(source.rating_method,'extranet');assert.equal(source.count_method,'extranet');
 }finally{await db.close();}
});
