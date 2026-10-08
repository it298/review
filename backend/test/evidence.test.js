import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
import {needsEvidence,pngInfo} from '../src/evidence.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
test('evidence requires PNG and retains a new image only for first daily observation or a changed value',()=>{
 assert.deepEqual(pngInfo(png),{width:1,height:1});assert.throws(()=>pngInfo(png.subarray(0,40)),/PNG/);
 const point={attempted_at:'2026-10-08T01:00:00Z',rating:4.8,review_count:100,count_kind:'reviews',count_display:null};
 assert.equal(needsEvidence(point,null),true);assert.equal(needsEvidence({...point,attempted_at:'2026-10-08T05:00:00Z'},point),false);assert.equal(needsEvidence({...point,rating:4.7},point),true);assert.equal(needsEvidence({...point,attempted_at:'2026-10-08T18:00:00Z'},point),true);
});
test('worker upload is separately authenticated, public access fails closed and matched images go only to private storage',async()=>{
 const realFetch=global.fetch;process.env.APP_PASSWORD='test-app-password-16plus';process.env.OTA_WORKER_SECRET='test-worker-secret-at-least-24';process.env.SUPABASE_URL='https://evidence-example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_server_only';
 let saved=false,privateBucket=false;const bytes=[...png];
 global.fetch=async(url,options={})=>{
  if(!String(url).startsWith('https://evidence-example.supabase.co'))return realFetch(url,options);
  assert.equal(options.headers.apikey,process.env.SUPABASE_SECRET_KEY);
  const p=new URL(url).pathname;
  if(p.endsWith('review_tracker_evidence_context'))return Response.json({id:1,entity_key:'hotel',source:'google',attempted_at:new Date().toISOString()});
  if(p.endsWith('review_tracker_evidence_object'))return Response.json(saved?{object_path:'a'.repeat(64)+'.png'}:null);
  if(p.endsWith('review_tracker_evidence_previous'))return Response.json(null);
  if(p==='/storage/v1/bucket'){privateBucket=JSON.parse(options.body).public===false;return Response.json({id:'review-tracker-evidence'});}
  if(p.startsWith('/storage/v1/object/')){if(options.method==='POST'){assert.deepEqual([...options.body],bytes);return Response.json({ok:true});}return new Response(png,{headers:{'Content-Type':'image/png'}});}
  if(p.endsWith('review_tracker_evidence_save')){saved=true;return Response.json({ok:true});}throw new Error('Unexpected endpoint '+p);
 };
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await realFetch(base+'/api/evidence/1/image')).status,401);assert.equal((await realFetch(base+'/api/evidence/worker/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:png})).status,401);
  const params=new URLSearchParams({source:'google',entity:'hotel',captured:new Date().toISOString()});const upload=await realFetch(base+'/api/evidence/worker/upload?'+params,{method:'POST',headers:{Authorization:'Bearer '+process.env.OTA_WORKER_SECRET,'Content-Type':'image/png'},body:png});assert.equal(upload.status,200);assert.equal(privateBucket,true);assert.equal(saved,true);
  const image=await realFetch(base+'/api/evidence/1/image',{headers:{Authorization:'Bearer '+process.env.APP_PASSWORD}});assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'no-store');assert.deepEqual([...new Uint8Array(await image.arrayBuffer())],bytes);
 }finally{global.fetch=realFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
