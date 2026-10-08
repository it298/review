import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateGoogleSummary} from '../src/google-summary-validation.js';
import {directoryRows} from '../../frontend/src/lib/directory.js';
test('Google partial readings retain old counts with independent timestamps and restrict access',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  for(const name of ['schema.sql','directory.sql','google-public-summary.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
  await db.exec("insert into review_tracker_directory values('cafe','Cafe','cafe','managed',null);insert into review_tracker_directory_sources(entity_key,source,source_url) values('cafe','google','https://www.google.com/maps/place/Cafe');set role service_role;");
  const ingest=async p=>(await db.query('select review_tracker_google_summary_ingest($1::jsonb) as result',[JSON.stringify(p)])).rows[0].result;
  const base={entityKey:'cafe',status:'success',method:'dom',placeToken:'0xab:0xcd',capturedAt:'2026-10-08T01:00:00Z',rating:4.8,reviewCount:100};
  await ingest(base);assert.equal((await ingest({...base,rating:4.9,reviewCount:null,capturedAt:'2026-10-08T02:00:00Z'})).status,'partial');
  await ingest({...base,rating:4.1,reviewCount:99,capturedAt:'2026-10-08T00:00:00Z'});
  const rows=(await db.query('select review_tracker_directory_read() as data')).rows[0].data;
  const reading=directoryRows(rows,{places:[],rows:[]},[],[])[0].readings.google;
  assert.equal(reading.rating,4.9);assert.equal(reading.review_count,100);assert.equal(reading.rating_max,5);
  assert.notEqual(reading.rating_captured_at,reading.count_captured_at);
  await assert.rejects(()=>ingest({...base,placeToken:'0xab:0xee'}),/identity changed/i);
  await ingest({entityKey:'cafe',status:'failed',error:'blocked',method:'dom'});
  const saved=(await db.query('select rating,review_count from review_tracker_directory_sources')).rows[0];assert.equal(saved.rating,'4.9');assert.equal(saved.review_count,100);
  await db.exec('reset role;set role anon;');await assert.rejects(()=>db.query('select review_tracker_google_targets_read()'),/permission denied/i);
 }finally{await db.close();}
});
test('Google validation permits missing totals and explicit zero, and rejects bad stars and OCR guesses',()=>{
 const p={entityKey:'cafe',status:'success',method:'dom',placeToken:'0xab:0xcd',capturedAt:new Date().toISOString(),rating:4.9,reviewCount:null};
 assert.equal(validateGoogleSummary(p).reviewCount,null);assert.equal(validateGoogleSummary({...p,reviewCount:0}).reviewCount,0);
 assert.throws(()=>validateGoogleSummary({...p,rating:9.4}));assert.throws(()=>validateGoogleSummary({...p,rating:null}));assert.throws(()=>validateGoogleSummary({...p,method:'ocr'}));
});
