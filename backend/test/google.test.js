import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptTokens,decryptTokens,startOAuth,finishOAuth,accessToken,readLocation,listLocations,validateAccount,validateLocation,disconnectGoogle,BUSINESS_SCOPE } from '../src/google.js';

function setup(){
 process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='test-client-secret';process.env.GOOGLE_REDIRECT_URI='http://localhost:10000/api/google/callback';process.env.FRONTEND_URL='http://localhost:5173';process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test_only';
}
test('encrypted tokens cannot be read or tampered with',()=>{
 setup();const encoded=encryptTokens({refresh_token:'private-token',access_token:'access'});assert.ok(!encoded.includes('private-token'));assert.equal(decryptTokens(encoded).refresh_token,'private-token');
 const parts=encoded.split('.');parts[3]=Buffer.from('tampered').toString('base64');assert.throws(()=>decryptTokens(parts.join('.')));
});
test('resource identifiers reject arbitrary URLs and path injection',()=>{
 assert.equal(validateAccount('accounts/123'),'accounts/123');assert.equal(validateLocation('locations/456'),'locations/456');
 for(const value of ['https://evil.example','accounts/1/../../x',undefined])assert.throws(()=>validateAccount(value));assert.throws(()=>validateLocation('locations/../123'));
});
test('OAuth uses PKCE, single-use state, encrypted persistence and refresh token rotation',async()=>{
 setup();const original=globalThis.fetch;const pending=new Map();let record=null;let revision=0;let exchanges=0;let refreshes=0;let catalogCalls=0;
 const response=value=>new Response(JSON.stringify(value),{status:200});
 globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url.includes('/rest/v1/rpc/')){
   const fn=url.split('/').pop();const args=JSON.parse(options.body);
   if(fn==='review_tracker_kv_set'){pending.set(args.p_key,args.p_value);return response(null);}
   if(fn==='review_tracker_kv_take'){const value=pending.get(args.p_key)||null;pending.delete(args.p_key);return response(value);}
   if(fn==='review_tracker_connection_get')return response(record);
   if(fn==='review_tracker_connection_set'){
    if(args.p_expected_revision && record?.revision!==args.p_expected_revision)return response(null);
    record={payload:args.p_payload,revision:String(++revision)};return response(record);
   }
   if(fn==='review_tracker_connection_delete'){record=null;return response(null);}
   if(fn==='review_tracker_lock')return response(true);
   if(fn==='review_tracker_unlock')return response(null);
   throw new Error('Unexpected RPC '+fn);
  }
  if(url==='https://oauth2.googleapis.com/token'){
   const params=new URLSearchParams(options.body);assert.equal(params.get('client_secret'),'test-client-secret');
   if(params.get('grant_type')==='authorization_code'){exchanges++;assert.ok(params.get('code_verifier'));return response({access_token:'token-one',refresh_token:'private-refresh',expires_in:3600,scope:BUSINESS_SCOPE});}
   refreshes++;assert.equal(params.get('refresh_token'),'private-refresh');return response({access_token:'token-two',refresh_token:'rotated-refresh',expires_in:3600});
  }
  if(url.includes('mybusinessbusinessinformation.googleapis.com')){
   assert.ok(options.headers.Authorization.startsWith('Bearer token-'));
   if(url.includes('/accounts/123/locations')){catalogCalls++;assert.ok(url.includes('readMask='));return response({locations:[{name:'locations/456',title:'Hotel'}],nextPageToken:'next'});}
   return response({name:'locations/456',title:'Hotel',metadata:{mapsUri:'https://www.google.com/maps?cid=1'},storefrontAddress:{addressLines:['Street'],locality:'City'}});
  }
  if(url.includes('mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews'))return response({totalReviewCount:321,averageRating:4.8,reviews:[{comment:'not stored'}]});
  throw new Error('Unexpected fetch '+url);
 };
 try{
  const auth=new URL(await startOAuth());assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('access_type'),'offline');assert.equal(auth.searchParams.get('scope'),BUSINESS_SCOPE);
  const query={state:auth.searchParams.get('state'),code:'code'};assert.equal(await finishOAuth(query),'connected');assert.equal(exchanges,1);assert.ok(!record.payload.includes('private-refresh'));
  await assert.rejects(()=>finishOAuth(query),/hết hạn/);assert.equal(exchanges,1);
  assert.equal(await accessToken(),'token-one');assert.equal(refreshes,0);
  assert.equal(await accessToken(true),'token-two');assert.equal(refreshes,1);
  const catalog=await listLocations('accounts/123','page');assert.equal(catalog.nextPageToken,'next');assert.equal(catalogCalls,1);
  const fresh=await readLocation('accounts/123','locations/456');assert.equal(fresh.reviewCount,321);assert.equal(fresh.rating,4.8);assert.equal(fresh.googleLocation,'locations/456');assert.equal(fresh.dataSource,'google_business_profile');assert.equal(fresh.reviews,undefined);
  await disconnectGoogle();await assert.rejects(()=>accessToken(),/Chưa kết nối/);
 }finally{globalThis.fetch=original;}
});
test('zero reviews remain zero with null rating; insufficient API approval is actionable',async()=>{
 setup();const original=globalThis.fetch;const record={payload:encryptTokens({access_token:'token',expires_at:Date.now()+3600000}),revision:'one'};
 globalThis.fetch=async(input)=>{
  const url=String(input);if(url.includes('review_tracker_connection_get'))return new Response(JSON.stringify(record));
  if(url.includes('mybusinessbusinessinformation'))return new Response(JSON.stringify({title:'Empty hotel'}));
  return new Response(JSON.stringify({}));
 };
 try{const result=await readLocation('accounts/1','locations/2');assert.equal(result.reviewCount,0);assert.equal(result.rating,null);
  globalThis.fetch=async input=>String(input).includes('review_tracker_connection_get')?new Response(JSON.stringify(record)):new Response('{}',{status:403});
  await assert.rejects(()=>listLocations('accounts/1'),error=>error.status===403 && error.message.includes('project được duyệt'));
 }finally{globalThis.fetch=original;}
});
