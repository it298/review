import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateManualSummary} from '../src/manual-summary.js';
import {validatePublicSummary} from '../src/public-summary-validation.js';

test('lodging rankings retain their exact Tripadvisor comparison group through migration and history',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
  for(const name of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','tripadvisor-ranking.sql','manual-summary.sql']){
   const sql=await fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8');
   await db.exec(sql.replaceAll(",'b_and_b','specialty_lodging'",''));
  }
  const migration=await fs.readFile(new URL('../../supabase/tripadvisor-lodging-categories.sql',import.meta.url),'utf8');
  await db.exec(migration);await db.exec(migration);
  await db.exec("insert into review_tracker_directory(entity_key,name,category,relationship) values('yzistel','Yzistel','hotel','managed'),('gia-lai','Gia Lai','hotel','managed');insert into review_tracker_directory_sources(entity_key,source,source_url) values('yzistel','tripadvisor','https://www.tripadvisor.com/Hotel_Review-g1-d33037118-Reviews-Yzistel.html'),('gia-lai','tripadvisor','https://www.tripadvisor.com/Hotel_Review-g1-d34666891-Reviews-Gia_Lai.html');set role service_role;");
  const capturedAt=new Date(Date.now()-60000).toISOString();
  for(const [i,entityKey,rankCategory,rankPosition,rankTotal,rankArea] of [[1,'yzistel','b_and_b',1,1,'Cam Pho'],[2,'gia-lai','specialty_lodging',8,99,'Quy Nhơn']]){
   const p=validateManualSummary({entityKey,source:'tripadvisor',rating:4.9,reviewCount:77,rankCategory,rankPosition,rankTotal,rankArea,capturedAt,requestId:'00000000-0000-4000-8000-00000000000'+i});
   await db.query('select review_tracker_manual_summary_ingest($1::jsonb)',[JSON.stringify(p)]);
  }
  const history=(await db.query('select entity_key,rank_category,rank_position,rank_total from review_tracker_source_history order by entity_key')).rows;
  assert.deepEqual(history.map(r=>[r.entity_key,r.rank_category,r.rank_position,r.rank_total]),[['gia-lai','specialty_lodging',8,99],['yzistel','b_and_b',1,1]]);
  const sourceUrl='https://www.tripadvisor.com/Hotel_Review-g1-d33037118-Reviews-Yzistel.html';
  const automatic=validatePublicSummary({entityKey:'yzistel',source:'tripadvisor',status:'success',method:'dom',sourceUrl,resolvedUrl:sourceUrl,rating:4.9,reviewCount:78,rankPosition:1,rankTotal:1,rankCategory:'b_and_b',rankArea:'Cam Pho',capturedAt:new Date(Date.now()-1000).toISOString()});
  await db.query('select review_tracker_public_summary_ingest($1::jsonb)',[JSON.stringify(automatic)]);
  const row=(await db.query("select rank_category,rank_total,review_count from review_tracker_directory_sources where entity_key='yzistel'")).rows[0];
  assert.equal(row.rank_category,'b_and_b');assert.equal(row.rank_total,1);assert.equal(row.review_count,78);
  assert.throws(()=>validateManualSummary({...automatic,rankCategory:'unknown'}));
  await db.exec('reset role;');await db.exec(migration);
  assert.equal((await db.query('select count(*) from review_tracker_source_history')).rows[0].count,3);
 }finally{await db.close();}
});
