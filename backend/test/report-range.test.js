import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../src/app.js';
import {validateReportRange,buildWeeklyReport,vietnamDay,shiftDay} from '../src/insights.js';
test('report range validates real calendar dates, inclusive days, Vietnam midnight and one-year history',()=>{
 const now=new Date('2026-10-09T16:59:59Z');assert.deepEqual(validateReportRange('2026-10-09','2026-10-09',now),{start:'2026-10-09',end:'2026-10-09',days:1});
 for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-10-09','2026-10-08'],['2026-10-09','2026-10-10'],['2025-10-09','2026-10-09'],['2026-10-01',undefined],[['2026-10-01'],'2026-10-09']])assert.throws(()=>validateReportRange(start,end,now),e=>e.status===400);
 assert.equal(validateReportRange('2026-10-10','2026-10-10',new Date('2026-10-09T17:00:00Z')).days,1);
 const start=shiftDay('2026-10-09',-364);assert.equal(validateReportRange(start,'2026-10-09',now).days,365);
});
test('custom reports include both boundary dates, omit outside data, and keep a single observation delta null',()=>{
 const data={directory:[{entity_key:'a',name:'A',relationship:'managed',category:'hotel',sources:[{source:'google'}]}],statuses:[],changes:[],readKeys:[],daily:[{entity_key:'a',source:'google',day:'2026-09-30',rating:1,rating_max:5,review_count:1,count_kind:'reviews'},{entity_key:'a',source:'google',day:'2026-10-01',rating:4.7,rating_max:5,review_count:100,count_kind:'reviews'},{entity_key:'a',source:'google',day:'2026-10-08',rating:4.8,rating_max:5,review_count:112,count_kind:'reviews'},{entity_key:'a',source:'google',day:'2026-10-09',rating:2,rating_max:5,review_count:113,count_kind:'reviews'}]};
 let report=buildWeeklyReport(data,'2026-10-01','2026-10-08');assert.equal(report.rows[0].count_change,12);assert.equal(report.rows[0].rating_change,0.1);assert.equal(report.rows[0].count_days,2);
 report=buildWeeklyReport(data,'2026-10-08','2026-10-08');assert.equal(report.rows[0].count_change,null);assert.equal(report.rows[0].review_count,112);
});
test('custom report API requires app auth, rejects invalid query before database access and only reads the needed history',async()=>{
 const realFetch=global.fetch;process.env.APP_PASSWORD='report-range-test-password';process.env.SUPABASE_URL='https://report-range-example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_only';let calls=0;
 const today=vietnamDay(new Date()),start=shiftDay(today,-120);
 global.fetch=async(url,options)=>{if(!String(url).startsWith('https://report-range-example.supabase.co'))return realFetch(url,options);calls++;assert.ok(String(url).endsWith('review_tracker_report_inputs_read'));assert.equal(JSON.parse(options.body).p_days,121);return Response.json({directory:[],daily:[],changes:[],statuses:[],readKeys:[]});};
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/api/reports';
 try{
 assert.equal((await realFetch(url+'?start='+start+'&end='+today)).status,401);
 const get=query=>realFetch(url+query,{headers:{Authorization:'Bearer '+process.env.APP_PASSWORD}});
 assert.equal((await get('?start='+start)).status,400);assert.equal(calls,0);
 const response=await get('?start='+start+'&end='+today);assert.equal(response.status,200);const result=await response.json();assert.equal(result.mode,'custom');assert.equal(result.report.start,start);assert.equal(result.report.end,today);assert.equal(calls,1);
 }finally{global.fetch=realFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('expanded report SQL reads older-than-90-day observations with Vietnam date buckets, is repeatable and stays private',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
 for(const name of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','insights.sql','report-range.sql','report-range.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 await db.exec("insert into review_tracker_directory values('a','A','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('a','google','https://google.com/maps');set role service_role;");
 const old=new Date(Date.now()-120*86400000).toISOString();await db.query("insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key) values('a','google',$1,'success',4.8,5,99,$1,$1,'manual','manual','test-old')",[old]);
 assert.equal((await db.query('select review_tracker_insights_read(90) as data')).rows[0].data.daily.length,0);const data=(await db.query('select review_tracker_insights_read(365) as data')).rows[0].data;assert.equal(data.daily.length,1);assert.equal(data.daily[0].day,vietnamDay(old));assert.equal(data.daily[0].review_count,99);
 await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select review_tracker_insights_read(365)'),/permission denied/);
 }finally{await db.close();}
});
