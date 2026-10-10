import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {validateManualSummary} from '../src/manual-summary.js';
import {createApp} from '../src/app.js';
import {directoryRows} from '../../frontend/src/lib/directory.js';
const uuid='cf381121-7c51-4dc1-8703-e54106305039';
test('manual validation accepts partial/zero values and rejects invalid counts, scales, notes and dates',()=>{
 const now=new Date('2026-10-09T03:00:00Z'),base={entityKey:'hotel',source:'google',requestId:uuid,capturedAt:now.toISOString()};
 assert.equal(validateManualSummary({...base,rating:0,reviewCount:0},now).ratingMax,5);assert.equal(validateManualSummary({...base,reviewCount:12},now).rating,null);
 for(const change of [{},{rating:5.1},{reviewCount:-1},{reviewCount:1.2},{rating:'4.7'},{reviewCount:NaN},{rating:4.7,capturedAt:'2027-01-01T00:00:00Z'},{rating:4.7,capturedAt:'2026-10-09T03:00'},{rating:4.7,note:'x'.repeat(501)}])assert.throws(()=>validateManualSummary({...base,...change},now),e=>e.status===400);
 assert.equal(validateManualSummary({...base,source:'agoda',rating:9.1},now).ratingMax,10);
});
test('manual fields survive older worker/Google summaries and newer automatic fields resume updates',()=>{
 const directory=[{entity_key:'hotel',google_place_id:1,sources:[{source:'google',rating:4.7,review_count:177,rating_captured_at:'2026-10-09T01:00:00Z',count_captured_at:'2026-10-09T01:00:00Z',rating_method:'manual',count_method:'manual'},{source:'agoda',rating:9.3,review_count:150,rating_captured_at:'2026-10-09T01:00:00Z',count_captured_at:'2026-10-09T01:00:00Z',rating_method:'manual',count_method:'manual'}]}];
 const g={places:[{id:1}],rows:[{values:{1:{rating:4.6,reviews:170,capturedAt:'2026-10-08T01:00:00Z'}}}]},old={source:'agoda',property_id:'1',hotel_key:'hotel',rating:9.1,review_count:149,captured_at:'2026-10-08T01:00:00Z',collection_method:'ocr'};
 let row=directoryRows(directory,g,[old],[])[0];assert.equal(row.readings.google.review_count,177);assert.equal(row.readings.agoda.rating,9.3);assert.equal(row.readings.agoda.rating_method,'manual');
 row=directoryRows(directory,g,[{...old,rating:9.4,captured_at:'2026-10-09T02:00:00Z'}],[])[0];assert.equal(row.readings.agoda.rating,9.4);assert.equal(row.readings.agoda.rating_method,'ocr');
});
test('manual endpoint requires app authentication and sends validated data only',async()=>{
 const realFetch=global.fetch;process.env.APP_PASSWORD='test-manual-password-16plus';process.env.OTA_WORKER_SECRET='test-manual-worker-secret-24plus';process.env.SUPABASE_URL='https://manual-example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_manual_test';let writes=0;
 global.fetch=async(url,options)=>{if(!String(url).startsWith('https://manual-example.supabase.co'))return realFetch(url,options);writes++;const p=JSON.parse(options.body).p;assert.equal(p.ratingMax,5);assert.equal(p.reviewCount,null);return Response.json({ok:true,id:1});};
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port+'/api/manual-summary';
 try{const send=(body,secret)=>realFetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(body)});
 assert.equal((await send({rating:4.7},process.env.OTA_WORKER_SECRET)).status,401);assert.equal((await send({entityKey:'hotel',source:'google',rating:99},process.env.APP_PASSWORD)).status,400);
 assert.equal((await send({entityKey:'hotel',source:'google',rating:4.7,ratingMax:10,requestId:uuid},process.env.APP_PASSWORD)).status,200);assert.equal(writes,1);
 }finally{global.fetch=realFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('manual SQL is repeatable, immutable and restricted; history/charts retain partial/backdated readings and field provenance',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
 for(const name of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','tripadvisor-ranking.sql','insights.sql','manual-summary.sql','manual-summary.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 await db.exec("insert into review_tracker_directory values('hotel','Hotel','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url,resolved_place_token) values('hotel','google','https://google.com/maps','real-place');set role service_role;");
 const old=new Date(Date.now()-3600000).toISOString(),fresh=new Date(Date.now()-60000).toISOString(),manual=p=>db.query('select review_tracker_manual_summary_ingest($1::jsonb) as data',[JSON.stringify(p)]),payload={entityKey:'hotel',source:'google',requestId:uuid,rating:4.7,reviewCount:177,capturedAt:fresh,note:'Đọc trên trang'};
 await manual(payload);assert.equal((await manual(payload)).rows[0].data.duplicate,true);assert.equal((await db.query('select count(*) from review_tracker_source_history')).rows[0].count,1);
 await manual({...payload,requestId:'df381121-7c51-4dc1-8703-e54106305039',rating:4.1,reviewCount:null,capturedAt:old,note:''});
 let row=(await db.query('select * from review_tracker_directory_sources')).rows[0];assert.equal(Number(row.rating),4.7);assert.equal(row.review_count,177);assert.equal(row.resolved_place_token,'real-place');assert.equal(row.last_attempt_at,null);
 await db.query('select review_tracker_google_summary_ingest($1::jsonb)',[JSON.stringify({entityKey:'hotel',status:'failed',error:'blocked',method:'ocr'})]);
 row=(await db.query('select review_tracker_directory_read() as data')).rows[0].data[0].sources[0];assert.equal(row.rating_method,'manual');assert.equal(row.count_method,'manual');
 await db.query('select review_tracker_google_summary_ingest($1::jsonb)',[JSON.stringify({entityKey:'hotel',status:'success',rating:4.8,reviewCount:null,capturedAt:new Date(Date.now()-1000).toISOString(),placeToken:'real-place',method:'dom'})]);
 row=(await db.query('select review_tracker_directory_read() as data')).rows[0].data[0].sources[0];assert.equal(row.rating_method,'dom');assert.equal(row.count_method,'manual');assert.equal(row.review_count,177);
 const data=(await db.query('select review_tracker_insights_read(30) as data')).rows[0].data;assert.equal(data.daily[0].review_count,177);assert.equal(data.daily[0].rating,4.8);
 const history=(await db.query("select * from review_tracker_source_history where origin='manual' order by id")).rows;assert.equal(history[0].note,'Đọc trên trang');assert.ok(history[0].entered_at);assert.equal(history[1].review_count,null);
 await assert.rejects(()=>manual({...payload,rating:4.9}),/đã được lưu/);await assert.rejects(()=>manual({...payload,requestId:'ef381121-7c51-4dc1-8703-e54106305039',entityKey:'missing'}),/Không tìm thấy/);
 await db.exec('reset role;set role anon;');await assert.rejects(()=>manual(payload),/permission denied/);
 }finally{await db.close();}
});
