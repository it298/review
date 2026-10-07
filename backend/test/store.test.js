import test from 'node:test';
import assert from 'node:assert/strict';
import { rpc,mutate,lock } from '../src/store.js';
test('REST adapter keeps secrets server side and preserves RPC contract',async()=>{
  const original=globalThis.fetch;
  const previous={url:process.env.SUPABASE_URL,secret:process.env.SUPABASE_SECRET_KEY,legacy:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_only';
  const calls=[];
  try {
    globalThis.fetch=async(url,options)=>{calls.push({url:String(url),...options});return new Response(JSON.stringify(true),{status:200});};
    await mutate({op:'save',fresh:{rating:null}});
    assert.equal(calls[0].url,'https://example.supabase.co/rest/v1/rpc/review_tracker_mutate');
    assert.equal(calls[0].headers.apikey,'sb_secret_test_only');assert.equal(calls[0].headers.Authorization,undefined);
    const payload=JSON.parse(calls[0].body).p;assert.match(payload.date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(payload.fresh.rating,null);
    const release=await lock('sync');await release();
    assert.equal(JSON.parse(calls[1].body).p_token,JSON.parse(calls[2].body).p_token);
    delete process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='legacy-test-jwt';await rpc('review_tracker_state');
    assert.equal(calls[3].headers.Authorization,'Bearer legacy-test-jwt');
    globalThis.fetch=async()=>new Response(JSON.stringify({code:'P0002',message:'Private DB message'}),{status:404});
    await assert.rejects(()=>rpc('review_tracker_mutate'),error=>error.status===404 && !error.message.includes('Private'));
  } finally {
    globalThis.fetch=original;
    for(const [env,value] of [['SUPABASE_URL',previous.url],['SUPABASE_SECRET_KEY',previous.secret],['SUPABASE_SERVICE_ROLE_KEY',previous.legacy]]){if(value===undefined)delete process.env[env];else process.env[env]=value;}
  }
});
