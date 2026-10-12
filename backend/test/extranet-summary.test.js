import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import {validateExtranetSummary} from '../src/extranet-summary-validation.js';
import {createApp} from '../src/app.js';
const input=()=>({entityKey:'sontra-sea-hotel',source:'traveloka',extranetPropertyId:'20057470',sourceUrl:'https://www.traveloka.com/en-en/hotel/vietnam/sontra-sea-hotel-9000000986772',method:'extranet-auto',status:'success',rating:9.5,reviewCount:209,capturedAt:new Date().toISOString()});
test('Extranet normalization removes portal credentials and rejects wrong counts, hosts and scales',()=>{
 const p=validateExtranetSummary({...input(),cookie:'PRIVATE',portalUrl:'PRIVATE'});assert.equal(p.method,'extranet-auto');assert.equal(p.collectionContext,'traveloka-extranet');assert.equal(p.ratingMax,10);assert.equal(JSON.stringify(p).includes('PRIVATE'),false);
 for(const patch of [{extranetPropertyId:''},{source:'booking'},{method:'dom'},{rating:null},{rating:11},{reviewCount:2.5},{reviewCount:null},{sourceUrl:'https://tera.traveloka.com/vi-vn/guest-review/'},{capturedAt:'2020-01-01'}])assert.throws(()=>validateExtranetSummary({...input(),...patch}));
});
test('new Extranet routes never fall through to app authentication or permit wrong worker keys',async()=>{
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');try{const base='http://127.0.0.1:'+server.address().port;for(const [method,path] of [['GET','targets'],['POST','results']]){const r=await fetch(base+'/api/extranet/worker/'+path,{method,headers:{Authorization:'Bearer wrong'}});assert.equal(r.status,401);}}finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
});
test('migration is repeatable and preserves old values, immutable history and private access',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table review_tracker_ota_pilot(source text,property_id text,review_id text,payload jsonb,imported_at timestamptz default now(),primary key(source,property_id,review_id));');
 for(const name of ['schema.sql','directory.sql','google-public-summary.sql','ota-summary.sql','ota-hotel-key.sql','ota-automation.sql','public-source-summary.sql','source-history.sql','tripadvisor-ranking.sql','manual-summary.sql'])await db.exec(await fs.readFile(new URL('../../supabase/'+name,import.meta.url),'utf8'));
 const raw=input();await db.query("insert into review_tracker_directory values($1,'Sontra','hotel','managed',null);",[raw.entityKey]);await db.query("insert into review_tracker_directory_sources(entity_key,source,source_url) values($1,'traveloka',$2)",[raw.entityKey,raw.sourceUrl]);
 const sql=await fs.readFile(new URL('../../supabase/extranet-workers.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);await db.exec('set role service_role');
 const targets=(await db.query('select review_tracker_extranet_targets_read() as value')).rows[0].value;assert.equal(targets.length,1);assert.equal(targets[0].extranet_property_id,'20057470');
 const p=validateExtranetSummary(raw),ingest=async p=>(await db.query('select review_tracker_extranet_summary_ingest($1::jsonb) as value',[JSON.stringify(p)])).rows[0].value;
 assert.equal((await ingest(p)).status,'success');
 const publicAttempt=(await db.query('select review_tracker_public_summary_ingest($1::jsonb) as value',[JSON.stringify({...p,method:'dom',reviewCount:999,capturedAt:new Date(Date.now()+1000).toISOString()})])).rows[0].value;assert.equal(publicAttempt.status,'stale');
 for(const patch of [{extranetPropertyId:'1'},{extranetPropertyId:null},{collectionContext:null},{method:'dom'},{sourceUrl:p.sourceUrl+'?wrong=1'},{rating:null},{reviewCount:1.5},{rating:11},{status:'other'}])await assert.rejects(()=>ingest({...p,...patch}));
 assert.equal((await ingest({...p,capturedAt:new Date(Date.now()-1000).toISOString(),reviewCount:1})).status,'stale');
 await ingest(validateExtranetSummary({...raw,status:'failed',error:'login_required'}));
 const saved=(await db.query('select rating,review_count from review_tracker_directory_sources')).rows[0];assert.equal(Number(saved.rating),9.5);assert.equal(saved.review_count,209);
 const history=(await db.query('select status,method,review_count from review_tracker_source_history order by id')).rows;assert.equal(history.length,2);assert.equal(history[0].method,'extranet-auto');assert.equal(history[0].review_count,209);assert.equal(history[1].status,'failed');
 await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select review_tracker_extranet_targets_read()'),/permission denied/);await assert.rejects(()=>ingest(p),/permission denied/);
 }finally{await db.close();}
});
