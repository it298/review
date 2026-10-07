import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { authorized,createApp } from '../src/app.js';
import { matrix } from '../src/service.js';
test('authentication fails closed, including missing cron secret',()=>{
 assert.equal(authorized('',undefined),false);
 assert.equal(authorized('Bearer correct','wrong'),false);
 assert.equal(authorized('Bearer correct','correct'),true);
});
test('matrix preserves null ratings and skips orphan snapshots',()=>{
 const result=matrix({places:{1:{id:1,name:'Hotel',rating:null}},snapshots:{one:{place_id:1,date:'2026-10-07',rating:null,user_rating_count:123},orphan:{place_id:2,date:'2026-10-06',rating:5,user_rating_count:999}}});
 assert.deepEqual(result.dates,['2026-10-07']);assert.equal(result.rows[0].values[1].reviews,123);assert.equal(result.rows[0].values[1].rating,null);
});
test('protected API rejects requests before database access',async()=>{
 process.env.APP_PASSWORD='test-password-at-least-16';delete process.env.CRON_SECRET;
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try {
  assert.equal((await fetch(base+'/api/health')).status,200);
  const denied=await fetch(base+'/api/places');assert.equal(denied.status,401);assert.equal(denied.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(base+'/api/session',{headers:{Authorization:'Bearer '+process.env.APP_PASSWORD}})).status,200);
  assert.equal((await fetch(base+'/api/cron')).status,401);
  const invalid=await fetch(base+'/api/places/track',{method:'POST',headers:{Authorization:'Bearer '+process.env.APP_PASSWORD,'Content-Type':'application/json'},body:JSON.stringify({googleMapsUrl:'https://google.com.attacker.org/maps'})});assert.equal(invalid.status,400);
  delete process.env.APP_PASSWORD;assert.equal((await fetch(base+'/api/session')).status,503);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
