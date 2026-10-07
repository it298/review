import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
test('separate frontend origin: preflight, authentication and deny unrelated origins',async()=>{
  process.env.CORS_ORIGIN='https://review-ui.onrender.com';
  process.env.APP_PASSWORD='test-password-at-least-16';
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const preflight=await fetch(base+'/api/session',{method:'OPTIONS',headers:{Origin:process.env.CORS_ORIGIN,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}});
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),process.env.CORS_ORIGIN);
    assert.match(preflight.headers.get('access-control-allow-headers'),/Authorization/);
    const session=await fetch(base+'/api/session',{headers:{Origin:process.env.CORS_ORIGIN,Authorization:'Bearer '+process.env.APP_PASSWORD}});
    assert.equal(session.status,200);assert.equal(session.headers.get('access-control-allow-origin'),process.env.CORS_ORIGIN);
    const denied=await fetch(base+'/api/session',{headers:{Origin:'https://other.example',Authorization:'Bearer '+process.env.APP_PASSWORD}});
    assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
    assert.equal((await fetch(base+'/api/health')).status,200);
    assert.equal((await fetch(base+'/dashboard')).status,404);
    assert.match(await(await fetch(base+'/')).text(),/review-tracker-api/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
