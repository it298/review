import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {buildWeeklyReport,vietnamDay,shiftDay} from '../src/insights.js';
import {reportView,reportGroups} from '../../frontend/src/lib/report-view.js';
test('report groups exact entity IDs once and filters rankings, alerts and export rows together',()=>{
 const report={rows:[{entity_key:'a',name:'Quy Nhơn',category:'hotel',source:'google',status:'confirmed',count_change:0},{entity_key:'a',name:'Quy Nhơn',category:'hotel',source:'agoda',status:'confirmed',count_change:7},{entity_key:'b',name:'Café',category:'cafe',source:'google',status:'confirmed',count_change:5}],alerts:[{entity_key:'a',source:'agoda'},{entity_key:'b',source:'google'}]};
 assert.equal(reportGroups(report.rows).length,2);const view=reportView(report,{query:'quy nhon',source:'agoda',category:'hotel',movement:'up'});assert.equal(view.rows.length,1);assert.equal(view.locations,1);assert.equal(view.top_growth.length,1);assert.equal(view.alerts.length,1);assert.equal(report.rows.length,3);
 assert.equal(reportView(report,{movement:'changed'}).rows.length,2);
 assert.equal(reportView({...report,rows:[{...report.rows[0],name:'Đà Nẵng'}]},{query:'da nang'}).rows.length,1);
});
test('two distinct dates expose true first/last values; mixed count kinds and YCS never create growth',()=>{
 const data={directory:[{entity_key:'a',name:'A',category:'hotel',relationship:'managed',sources:[{source:'agoda'}]}],changes:[],statuses:[],readKeys:[],daily:[{entity_key:'a',source:'agoda',day:'2026-10-08',rating:9.3,rating_max:10,review_count:150,count_kind:'reviews',method:'dom'},{entity_key:'a',source:'agoda',day:'2026-10-09',rating:9.4,rating_max:10,review_count:143,count_kind:'reviews',method:'api'}]};
 let r=buildWeeklyReport(data,'2026-10-08','2026-10-09').rows[0];assert.equal(r.rating,9.3);assert.equal(r.review_count,150);assert.equal(r.count_change,null);assert.equal(r.count_days,1);
 data.daily.push({...data.daily[0],day:'2026-10-09'});r=buildWeeklyReport(data,'2026-10-08','2026-10-09').rows[0];assert.equal(r.count_change,0);assert.equal(r.review_count_first,150);assert.equal(r.rating_change,0);assert.equal(r.rating_first_day,'2026-10-08');
 data.daily.push({...data.daily[0],day:'2026-10-10',count_kind:'ratings',review_count:151});assert.equal(buildWeeklyReport(data,'2026-10-08','2026-10-10').rows[0].count_change,null);
 data.changes=[{id:1,entity_key:'a',source:'agoda',metric:'review_count',value:143,previous:150,previous_at:'2026-10-08T00:00:00Z',at:'2026-10-09T00:00:00Z',rating_max:10}];
 assert.equal(buildWeeklyReport(data,'2026-10-09','2026-10-09',new Date('2026-10-10')).alerts.length,0);
});
test('new report reader excludes YCS before daily selection and alert deltas, preserves raw history and private access',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
  for(const file of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','insights.sql','report-public-scope.sql','report-public-scope.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('a','A','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('a','agoda','https://www.agoda.com/a/hotel/b.html');set role service_role;");
  const today=vietnamDay(new Date()),yesterday=shiftDay(today,-1);
  for(const [day,count,rating,method] of [[yesterday,150,9.3,'dom'],[today,143,9.4,'api']]){const at=day+'T00:00:00Z';await db.query("insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key) values('a','agoda',$1,'success',$2,10,$3,$1,$1,$4,'test',$4)",[at,rating,count,method]);}
  let data=(await db.query('select review_tracker_report_inputs_read(30) as data')).rows[0].data;assert.equal(data.daily.length,1);assert.equal(data.daily[0].review_count,150);assert.equal(data.changes.length,0);
  const at=today+'T01:00:00Z';await db.query("insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key) values('a','agoda',$1,'success',9.3,10,150,$1,$1,'dom','test','public-again')",[at]);
  data=(await db.query('select review_tracker_report_inputs_read(30) as data')).rows[0].data;const report=buildWeeklyReport(data,yesterday,today);assert.equal(report.rows[0].count_change,0);assert.equal(report.rows[0].rating_change,0);assert.equal(report.alerts.length,0);assert.equal((await db.query('select count(*) n from review_tracker_source_history')).rows[0].n,3);
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select review_tracker_report_inputs_read(30)'),/permission denied/);
 }finally{await db.close();}
});
