import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateReviewBatch,reviewScales,ingestGoogleReviews} from '../src/review-alerts.js';
import {googleReviewRecords} from '../src/google.js';
import {buildAlerts,buildWeeklyReport,vietnamDay} from '../src/insights.js';
import {alertText,visibleAlerts} from '../../frontend/src/lib/insight-labels.js';
const stamp=offset=>new Date(Date.now()+offset).toISOString();
const batch=(source='google',changes={})=>({entityKey:'hotel',source,sourceUrl:'https://example.com/'+source,method:'api',capturedAt:stamp(-1000),reviews:[{reviewId:'review-1',rating:reviewScales[source]===5?1:2,ratingMax:reviewScales[source],reviewedAt:stamp(-3000),updatedAt:stamp(-2000),content:'Review'}],...changes});
test('all nine sources use native scales, strict individual IDs and timestamps, and discard credentials',()=>{
 for(const source of Object.keys(reviewScales)){const p=batch(source);p.cookie='private';assert.equal(validateReviewBatch(p).reviews[0].ratingMax,reviewScales[source]);assert.equal(JSON.stringify(validateReviewBatch(p)).includes('private'),false);}
 for(const p of [batch('unknown'),batch('google',{reviews:[{...batch().reviews[0],rating:1.5}]}),batch('google',{reviews:[...batch().reviews,...batch().reviews]}),batch('google',{method:'ocr'}),batch('google',{sourceUrl:'https://u:secret@example.com'}),batch('google',{reviews:[{...batch().reviews[0],updatedAt:'invalid'}]})])assert.throws(()=>validateReviewBatch(p),e=>e.status===400);
 const r={reviewId:'abc_DEF-1',starRating:'ONE',createTime:stamp(-3000),updateTime:stamp(-2000),name:'accounts/1/locations/2/reviews/abc_DEF-1',comment:'A'};
 assert.equal(googleReviewRecords([r],'accounts/1','locations/2')[0].rating,1);
 assert.throws(()=>googleReviewRecords([{...r,name:'accounts/1/locations/99/reviews/abc_DEF-1'}],'accounts/1','locations/2'));
 assert.throws(()=>googleReviewRecords([{...r,starRating:'STAR_RATING_UNSPECIFIED'}],'accounts/1','locations/2'));
});
test('baseline import, delayed history, repeated scans, edited reviews, source isolation, and private storage',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['schema.sql','directory.sql','review-alerts.sql','review-alerts.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('hotel','Hotel','hotel','managed',null),('rival','Rival','hotel','comparison',null);");
  for(const source of Object.keys(reviewScales))await db.query('insert into review_tracker_directory_sources(entity_key,source,source_url) values($1,$2,$3)',['hotel',source,'https://example.com/'+source]);
  const first=stamp(-60000),second=stamp(-10000),posted=stamp(-30000);
  const ingest=p=>db.query('select review_tracker_reviews_ingest($1::jsonb) result',[JSON.stringify(validateReviewBatch(p))]);
  for(const source of Object.keys(reviewScales)){
   const r={...batch(source).reviews[0],reviewId:'old',reviewedAt:stamp(-100000),updatedAt:stamp(-100000)};
   assert.equal((await ingest(batch(source,{capturedAt:first,reviews:[r]}))).rows[0].result.alertsAdded,0);
   const fresh={...r,reviewId:'new',reviewedAt:posted,updatedAt:posted};
   assert.equal((await ingest(batch(source,{capturedAt:second,reviews:[r,fresh]}))).rows[0].result.alertsAdded,1);
   assert.equal((await ingest(batch(source,{capturedAt:second,reviews:[fresh]}))).rows[0].result.alertsAdded,0);
   const delayed={...r,reviewId:'old-late',updatedAt:stamp(-20000)};
   assert.equal((await ingest(batch(source,{capturedAt:second,reviews:[delayed]}))).rows[0].result.alertsAdded,0);
  }
  const high={...batch().reviews[0],reviewId:'edited',rating:5,reviewedAt:stamp(-100000),updatedAt:stamp(-15000)};
  await ingest(batch('google',{capturedAt:second,reviews:[high]}));
  assert.equal((await ingest(batch('google',{capturedAt:stamp(-5000),reviews:[{...high,rating:1,updatedAt:stamp(-6000)}]}))).rows[0].result.alertsAdded,1);
  await assert.rejects(()=>ingest(batch('google',{sourceUrl:'https://wrong.test/'})),/identity mismatch/);
  await assert.rejects(()=>ingest(batch('google',{entityKey:'rival'})),/identity mismatch/);
  const read=(await db.query('select review_tracker_review_alerts_read(7) result')).rows[0].result;
  assert.equal(read.lowReviews.length,10);assert.equal(read.reviewMonitoring.length,9);
  assert.equal(read.lowReviews.find(v=>v.source==='google'&&v.reason==='changed').rating,1);
  const data={directory:[{entity_key:'hotel',name:'Hotel',category:'hotel',relationship:'managed',sources:[{source:'google'}]}],changes:[],daily:[],statuses:[],readKeys:['review:'+read.lowReviews[0].id],...read};
  const alerts=buildAlerts(data);assert.equal(alerts.length,10);assert.equal(alerts.some(a=>a.read),true);assert.equal(visibleAlerts(alerts).length,10);assert.match(alertText(alerts.find(a=>a.source==='google')),/1 sao/);assert.match(alertText(alerts.find(a=>a.source==='traveloka')),/2\/10/);
  const today=vietnamDay(new Date());assert.equal(buildWeeklyReport(data,today,today).alerts.length,10);
  await db.exec('set role anon');await assert.rejects(()=>db.query('select review_tracker_review_alerts_read(7)'),/permission denied/);await assert.rejects(()=>db.query('select * from review_tracker_reviews'),/permission denied/);
 }finally{await db.close();}
});
test('Google pagination overlaps updates, maps the explicit managed place, and resumes a long read',async()=>{
 const oldFetch=global.fetch;process.env.SUPABASE_URL='https://review-alert-test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const pending=new Map(),saved=[];let calls=0;
 global.fetch=async(url,options)=>{const fn=String(url).split('/').pop(),p=JSON.parse(options.body);
  if(fn==='review_tracker_review_targets_read')return Response.json([{source:'google',google_place_id:8,entity_key:'hotel',source_url:'https://example.com/google'}]);
  if(fn==='review_tracker_kv_get')return Response.json(pending.get(p.p_key)||null);
  if(fn==='review_tracker_kv_set'){pending.set(p.p_key,p.p_value);return Response.json(null);}
  if(fn==='review_tracker_kv_delete'){pending.delete(p.p_key);return Response.json(null);}
  if(fn==='review_tracker_reviews_ingest'){saved.push(p.p);return Response.json({status:'success'});}
  throw new Error('Unexpected RPC');
 };
 const place={id:8,google_account:'accounts/1',google_location:'locations/2'};
 const page=async(_a,_l,token)=>{calls++;const index=Number(token||0);return {reviews:[{...batch().reviews[0],reviewId:'review-'+index}],nextPageToken:index<20?String(index+1):null};};
 try{
  assert.equal((await ingestGoogleReviews({...place,id:999},page)).status,'unmapped');assert.equal(calls,0);
  assert.equal((await ingestGoogleReviews(place,page)).status,'partial');assert.equal(calls,20);
  assert.equal((await ingestGoogleReviews(place,page)).status,'success');assert.equal(calls,21);assert.equal(pending.size,0);assert.equal(saved.length,21);assert.equal(saved[20].reviews[0].reviewId,'review-20');
 }finally{global.fetch=oldFetch;}
});
