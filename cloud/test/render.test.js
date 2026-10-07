import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../app.js';

test('Render serves frontend and assets while API routes remain protected',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'review-render-'));
  await fs.writeFile(path.join(temp,'index.html'),'<!doctype html><title>Review Render</title>');
  await fs.writeFile(path.join(temp,'app.css'),'body{color:black}');
  const previous=process.env.APP_PASSWORD;
  process.env.APP_PASSWORD='render-test-password-16';
  const server=createApp({staticDirectory:temp}).listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.match(await (await fetch(base+'/')).text(),/Review Render/);
    assert.match(await (await fetch(base+'/dashboard')).text(),/Review Render/);
    const asset=await fetch(base+'/app.css');assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/text\/css/);
    assert.equal((await fetch(base+'/api/places')).status,401);
    const missing=await fetch(base+'/api/missing',{headers:{Authorization:'Bearer '+process.env.APP_PASSWORD}});
    assert.equal(missing.status,404);assert.match(missing.headers.get('content-type'),/application\/json/);
  }finally{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    await fs.rm(temp,{recursive:true,force:true});
    if(previous===undefined)delete process.env.APP_PASSWORD;else process.env.APP_PASSWORD=previous;
  }
});
