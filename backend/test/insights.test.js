import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildAlerts,buildWeeklyReport,weekRange} from '../src/insights.js';
import {comparableGrowth} from '../../frontend/src/lib/comparison.js';
import {pngInfo} from '../src/evidence.js';
const data={directory:[{entity_key:'hotel',name:'Khách sạn',category:'hotel',relationship:'managed',sources:[{source:'google'},{source:'shopee'}]},{entity_key:'rival',name:'Đối chiếu',category:'hotel',relationship:'comparison',sources:[{source:'google'}]}],readKeys:['change:1:rating'],changes:[{id:1,entity_key:'hotel',source:'google',metric:'rating',value:4.7,previous:4.9,rating_max:5,at:'2026-10-08T02:00:00Z'}],statuses:[{id:3,entity_key:'hotel',source:'google',status:'failed',consecutive_failures:3,rating_at:'2026-10-05T00:00:00Z',count_at:'2026-10-08T00:00:00Z',attempted_at:'2026-10-08T03:00:00Z',error:'blocked'}],daily:[{entity_key:'hotel',source:'google',day:'2026-10-05',rating:4.9,rating_max:5,review_count:100,count_kind:'reviews'},{entity_key:'hotel',source:'google',day:'2026-10-08',rating:4.7,rating_max:5,review_count:105,count_kind:'reviews'},{entity_key:'rival',source:'google',day:'2026-10-04',review_count:1000,count_kind:'reviews'},{entity_key:'rival',source:'google',day:'2026-10-05',review_count:1002,count_kind:'reviews'},{entity_key:'rival',source:'google',day:'2026-10-08',review_count:1006,count_kind:'reviews'}]};
test('alerts distinguish drops, persistent failures and stale fields; read status persists and comparison uses the same dates',()=>{
 const alerts=buildAlerts(data,new Date('2026-10-08T05:00:00Z'));assert.equal(alerts.length,3);assert.equal(alerts[0].read,true);assert.equal(alerts.filter(a=>a.type==='stale').length,1);
 const comparison=comparableGrowth(data.daily,'hotel','rival','google');assert.equal(comparison.start,'2026-10-05');assert.equal(comparison.leftChange,5);assert.equal(comparison.rightChange,4);assert.equal(comparison.points[1].left,null);
 const mixed=structuredClone(data.daily);mixed.filter(p=>p.entity_key==='rival').forEach(p=>p.count_kind='ratings');assert.equal(comparableGrowth(mixed,'hotel','rival','google').points.length,0);
});
test('weekly report keeps missing and approximate data distinct from zero, includes source coverage and native scales',()=>{
 assert.deepEqual(weekRange('2026-10-08'),{start:'2026-10-05',end:'2026-10-11'});const report=buildWeeklyReport(data,'2026-10-05','2026-10-11',new Date('2026-10-08T05:00:00Z'));
 assert.equal(report.locations,1);assert.equal(report.rows[0].count_change,5);assert.equal(report.rows[0].rating_change,-0.2);assert.equal(report.rows[1].review_count,null);assert.equal(report.rows[1].status,'missing');assert.equal(report.top_growth.length,1);
 assert.throws(()=>pngInfo(Buffer.from('<svg>bad</svg>')),/PNG/);
});
test('insights SQL returns daily field-specific data, deduplicates observations, matches evidence and blocks anon',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
  for(const f of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','insights.sql','insights.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('hotel','Khách sạn','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('hotel','google','https://google.com/maps');set role service_role;");
  const t=new Date(Date.now()-10000).toISOString(),t2=new Date(Date.now()-5000).toISOString();
  for(const [at,rating,count] of [[t,4.9,100],[t2,4.8,null]])await db.query('select review_tracker_google_summary_ingest($1::jsonb)',[JSON.stringify({entityKey:'hotel',placeToken:'hotel',status:'success',method:'dom',rating,reviewCount:count,capturedAt:at})]);
  const inputs=(await db.query('select review_tracker_insights_read(30) as data')).rows[0].data;assert.equal(inputs.daily.length,1);assert.equal(inputs.daily[0].review_count,100);assert.equal(Number(inputs.daily[0].rating),4.8);assert.equal(inputs.changes.length,1);
  const h=(await db.query("select review_tracker_evidence_context('hotel','google','',$1::timestamptz) as data",[t2])).rows[0].data;assert.ok(h.id);assert.equal((await db.query("select review_tracker_evidence_context('hotel','google','',now()) as data")).rows[0].data,null);
  const hash='a'.repeat(64);await db.query('select review_tracker_evidence_save($1,$2,$3,100)',[h.id,hash+'.png',hash]);assert.equal((await db.query("select review_tracker_evidence_read('hotel','google') as data")).rows[0].data[0].has_image,true);
  await db.query('select review_tracker_report_save($1,$2::jsonb)',['2026-10-05',JSON.stringify({start:'2026-10-05'})]);await db.query('select review_tracker_report_save($1,$2::jsonb)',['2026-10-05',JSON.stringify({start:'wrong'})]);assert.equal((await db.query('select review_tracker_reports_read() as data')).rows[0].data[0].payload.start,'2026-10-05');
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select review_tracker_insights_read(30)'),/permission denied/);await assert.rejects(()=>db.query('select * from review_tracker_evidence'),/permission denied/);
 }finally{await db.close();}
});
