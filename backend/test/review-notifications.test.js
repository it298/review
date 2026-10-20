import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateReviewBatch} from '../src/review-alerts.js';
import {buildAlerts} from '../src/insights.js';
import {visibleAlerts,alertText} from '../../frontend/src/lib/insight-labels.js';
test('new review events are idempotent, baseline is quiet, low scores take priority and reads persist',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const file of ['schema.sql','directory.sql','review-alerts.sql'])await db.exec(await readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));
  await db.exec("create table public.review_tracker_source_history(id bigint generated always as identity primary key,entity_key text,source text,count_at timestamptz,review_count bigint,count_kind text,rating_max integer,status text,count_display text,attempted_at timestamptz,method text);");
  const extension=await readFile(new URL('../../supabase/review-notifications.sql',import.meta.url),'utf8');await db.exec(extension);await db.exec(extension);
  await db.exec("insert into review_tracker_directory values('hotel','Hotel','hotel','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('hotel','google','https://example.com/google'),('hotel','booking','https://example.com/booking');");
  const at=n=>new Date(Date.now()-n*1000).toISOString(),review=(id,score,posted)=>({reviewId:id,rating:score,ratingMax:5,reviewedAt:posted,updatedAt:posted,content:'Actual review content'}),ingest=async(reviews,capturedAt)=> (await db.query('select review_tracker_reviews_ingest($1::jsonb) value',[JSON.stringify(validateReviewBatch({entityKey:'hotel',source:'google',sourceUrl:'https://example.com/google',method:'api',capturedAt,reviews}))])).rows[0].value;
  assert.equal((await ingest([review('old',1,at(200))],at(120))).alertsAdded,0);
  assert.equal((await ingest([review('new',5,at(90)),review('low',1,at(80))],at(60))).alertsAdded,2);
  assert.equal((await ingest([review('new',5,at(90)),review('low',1,at(80))],at(50))).alertsAdded,0);
  await ingest([review('late',5,at(300))],at(40));
  const edited=review('new',1,at(90));edited.updatedAt=at(30);assert.equal((await ingest([edited],at(20))).alertsAdded,1);
  for(const [source,count,stamp,kind,method]of [['google',100,at(150),'reviews','dom'],['google',102,at(55),'reviews','dom'],['booking',10,at(140),'reviews','dom'],['booking',12,at(45),'reviews','dom'],['booking',20,at(35),'ratings','dom']])await db.query("insert into review_tracker_source_history(entity_key,source,count_at,review_count,count_kind,rating_max,status,attempted_at,method) values('hotel',$1,$2,$3,$4,5,'success',$2,$5)",[source,stamp,count,kind,method]);
  const data=(await db.query('select review_tracker_review_alerts_read(7) value')).rows[0].value;assert.equal(data.lowReviews.length,2);assert.equal(data.newReviews.length,1);assert.equal(data.countIncreases.length,2);
  const inputs={...data,directory:[{entity_key:'hotel',name:'Hotel',relationship:'managed',category:'hotel',sources:[]}],changes:[],statuses:[],readKeys:['review:'+data.newReviews[0].id]};const alerts=visibleAlerts(buildAlerts(inputs));assert.equal(alerts[0].type,'low_review');assert.equal(alerts.filter(a=>a.type==='count_increase').length,1);assert.equal(alerts.find(a=>a.type==='count_increase').source,'booking');assert.equal(alerts.find(a=>a.type==='new_review').read,true);assert.match(alertText(alerts.find(a=>a.type==='new_review')),/5 sao/);assert.match(alertText(alerts.find(a=>a.type==='count_increase')),/chưa có nội dung/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select review_tracker_review_alerts_read(7)'));await db.exec('reset role');}
 }finally{await db.close();}
});
