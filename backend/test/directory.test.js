import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {directoryRows,safeSourceUrl} from '../../frontend/src/lib/directory.js';
test('directory import is repeatable, preserves explicit mappings and restricts access',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  const read=name=>fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8');
  await db.exec(await read('schema.sql'));
  await db.exec("create table public.review_tracker_ota_targets(source text,property_id text,property_name text,hotel_key text,source_url text,primary key(source,property_id));");
  for(let i=0;i<2;i++){await db.exec(await read('directory.sql'));await db.exec(await read('company-directory-seed.sql'));}
  await db.exec('set role service_role;');
  const rows=(await db.query('select public.review_tracker_directory_read() as data')).rows[0].data;
  assert.equal(rows.length,21);assert.equal(rows.filter(r=>r.relationship==='managed').length,14);
  assert.equal(rows.reduce((n,r)=>n+r.sources.length,0),85);
  assert.equal(rows.find(r=>r.name==='Trandoc mini Mart 24h').sources.length,3);
  assert.ok(rows.find(r=>r.name==='Cho thuê phao bơi').sources.find(s=>s.source==='tripadvisor').warning);
  const mapped=directoryRows(rows,{places:[],rows:[]},[{source:'trip',property_id:'126921251',hotel_key:'yzistel-hoi-an-39-le-quy-don',rating:9.5,review_count:372}],[]);
  assert.equal(mapped.length,21);assert.equal(mapped.find(r=>r.name==='Yzistel Hoi An').readings.trip.review_count,372);
  assert.equal(directoryRows(rows,{places:[{id:1,name:'Yzistel Hoi An'}],rows:[]},[],[]).length,22,'a matching name alone does not authorize a Google merge');
  await db.exec('reset role;set role anon;');
  await assert.rejects(()=>db.query('select public.review_tracker_directory_read()'),/permission denied/i);
  await assert.rejects(()=>db.query('select * from public.review_tracker_directory_sources'),/permission denied/i);
 }finally{await db.close();}
});
test('directory source links exclude executable URLs and embedded credentials',()=>{
 assert.equal(safeSourceUrl('javascript:alert(1)'),null);
 assert.equal(safeSourceUrl('https://user:secret@example.com'),null);
 assert.equal(safeSourceUrl('https://www.trip.com/'),'https://www.trip.com/');
});
test('hotel view never inherits unmatched Google cafes or stores as hotels; explicit directory categories win',()=>{
 const directory=[{entity_key:'hotel-a',name:'Hotel A',category:'hotel',relationship:'managed',google_place_id:1,sources:[]},{entity_key:'cafe-a',name:'Cafe A',category:'cafe',relationship:'managed',google_place_id:2,sources:[{source:'grab',property_id:'grab-cafe-a'}]},{entity_key:'store-a',name:'Store A',category:'store',relationship:'managed',google_place_id:3,sources:[]}];
 const rows=directoryRows(directory,{places:[{id:1,name:'Hotel A'},{id:2,name:'Cafe A'},{id:3,name:'Store A'},{id:4,name:'Unmapped Cafe'},{id:5,name:'Cafe A'}],rows:[]},[{source:'grab',property_id:'grab-cafe-a',hotel_key:'legacy-alias',property_name:'Cafe A from Grab',rating:4.8},{source:'shopee',property_id:'unknown-store',property_name:'Unmapped Store'}],[]);
 assert.deepEqual(rows.filter(r=>r.category==='hotel').map(r=>r.name),['Hotel A']);assert.equal(rows.filter(r=>r.category==='cafe').length,1);assert.equal(rows.filter(r=>r.category==='store').length,1);assert.equal(rows.filter(r=>r.category===null).length,3);assert.equal(rows.find(r=>r.key==='cafe-a').readings.grab.rating,4.8);assert.equal(rows.find(r=>r.key==='google:5').category,null,'matching a name does not authorize changing category or merging identities');
});
