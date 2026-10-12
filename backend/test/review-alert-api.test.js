import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
test('individual review ingestion requires worker auth, validates before RPC and carries alert read state to the UI',async()=>{
 const original=global.fetch;process.env.APP_PASSWORD='app-password-for-review-alert-test';process.env.OTA_WORKER_SECRET='worker-password-for-review-alert-test';process.env.SUPABASE_URL='https://alert-api-test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';let calls=0;
 global.fetch=async(url,options)=>{if(!String(url).startsWith(process.env.SUPABASE_URL))return original(url,options);calls++;const fn=String(url).split('/').pop();
  if(fn==='review_tracker_reviews_ingest'){const p=JSON.parse(options.body).p;assert.equal(p.reviews[0].rating,1);assert.equal(p.cookie,undefined);return Response.json({status:'success'});}
  if(fn==='review_tracker_insights_read')return Response.json({directory:[{entity_key:'hotel',name:'Hotel',category:'hotel',relationship:'managed',sources:[]}],changes:[],statuses:[],readKeys:['review:123']});
  if(fn==='review_tracker_review_alerts_read')return Response.json({lowReviews:[{id:123,entity_key:'hotel',source:'google',rating:1,rating_max:5,at:new Date().toISOString(),reason:'new'}],reviewMonitoring:[]});
  throw new Error('Unexpected RPC');
 };
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const post=(secret,p)=>original(base+'/api/reviews/worker/results',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify(p)});
 try{
  assert.equal((await post(process.env.APP_PASSWORD,{})).status,401);assert.equal(calls,0);
  assert.equal((await post(process.env.OTA_WORKER_SECRET,{})).status,400);assert.equal(calls,0);
  const at=new Date(Date.now()-1000).toISOString();
  assert.equal((await post(process.env.OTA_WORKER_SECRET,{entityKey:'hotel',source:'google',sourceUrl:'https://maps.google.com',method:'dom',capturedAt:at,cookie:'discard',reviews:[{reviewId:'actual-id',rating:1,ratingMax:5,reviewedAt:at}]})).status,200);
  const result=await original(base+'/api/insights?days=7',{headers:{Authorization:'Bearer '+process.env.APP_PASSWORD}});assert.equal(result.status,200);const data=await result.json();assert.equal(data.alerts.length,1);assert.equal(data.alerts[0].read,true);
 }finally{global.fetch=original;server.closeAllConnections();await new Promise(done=>server.close(done));}
});
