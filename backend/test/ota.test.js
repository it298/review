import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {validateOtaResult} from '../src/ota-validation.js';
import {createApp} from '../src/app.js';
test('Worker routes require the dedicated secret and reject invalid results before database access',async()=>{
 const previous=process.env.OTA_WORKER_SECRET;process.env.OTA_WORKER_SECRET='worker-test-secret-24-characters';
 const server=createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(url+'/api/ota/worker/targets')).status,401);assert.equal((await fetch(url+'/api/ota/worker/results',{method:'POST',headers:{Authorization:'Bearer '+process.env.OTA_WORKER_SECRET,'Content-Type':'application/json'},body:'{}'})).status,400);}finally{await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.OTA_WORKER_SECRET;else process.env.OTA_WORKER_SECRET=previous;}
});
test('OTA validation rejects malformed reviews, OCR without agreement and future dates',()=>{const base={source:'agoda',propertyId:'64821141',method:'dom',status:'success',capturedAt:new Date().toISOString(),summary:{rating:9.4,ratingMax:10,count:471},reviews:[]};assert.equal(validateOtaResult(base).summary.count,471);assert.throws(()=>validateOtaResult({...base,method:'ocr'}));assert.throws(()=>validateOtaResult({...base,capturedAt:'2099-01-01'}));assert.throws(()=>validateOtaResult({...base,reviews:[{reviewId:'1',rating:9,reviewedAt:'2026-02-31',content:'x'}]}));});
test('OTA ingestion keeps good data on failure, upserts daily observations, enforces access and ignores delayed deliveries',async()=>{
const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(await fs.readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
 await db.exec("create table public.review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));grant all on public.review_tracker_ota_pilot to service_role;");
 for(const f of ['ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','ota-automation.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+f,import.meta.url),'utf8'));
 await db.exec("insert into public.review_tracker_ota_targets(source,property_id,property_name,hotel_key,source_url) values('agoda','64821141','Yzistel','yzistel','https://www.agoda.com/vi-vn/yzistel-hoi-an/hotel/hoi-an-vn.html');set role service_role;");
 const ingest=async p=>(await db.query('select public.review_tracker_ota_ingest($1::jsonb) as r',[JSON.stringify(p)])).rows[0].r;
 const p={source:'agoda',propertyId:'64821141',method:'dom',status:'success',capturedAt:'2026-10-08T02:00:00Z',summary:{rating:9.4,count:471},reviews:[{reviewId:'123',rating:10,reviewedAt:'2026-09-25',content:'x'}]};
 await ingest(p);await ingest(p);await ingest({...p,status:'failed',error:'blocked'});
 let result=(await db.query('select rating,review_count,last_error from public.review_tracker_ota_summary')).rows[0];assert.equal(Number(result.rating),9.4);assert.equal(Number(result.review_count),471);assert.equal(result.last_error,'blocked');
 assert.equal((await db.query('select count(*)::int as n from public.review_tracker_ota_daily')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int as n from public.review_tracker_ota_pilot')).rows[0].n,1);
 assert.equal((await ingest({...p,capturedAt:'2026-10-07T02:00:00Z',summary:{rating:8,count:1}})).status,'stale');
 await db.exec('reset role');assert.equal((await db.query("select has_function_privilege('anon','public.review_tracker_ota_ingest(jsonb)','execute') as allowed")).rows[0].allowed,false);
 await assert.rejects(()=>ingest({...p,propertyId:'unknown'}));
}finally{await db.close();}});
