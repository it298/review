import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.js';
test('email auth denies unapproved users, enforces roles, expires and revokes sessions',async()=>{
 const original=global.fetch,env={...process.env};process.env.AUTH_MODE='supabase';process.env.AUTH_ADMIN_EMAIL='owner@example.com';process.env.SUPABASE_URL='https://auth-test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';process.env.APP_PASSWORD='legacy-password-without-access';process.env.FRONTEND_URL='https://workspace.example.com/';
 const kv=new Map(),calls=[];
 const users={owner:{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.com',email_confirmed_at:'2026-01-01',user_metadata:{name:'Owner'},app_metadata:{}},viewer:{id:'22222222-2222-4222-8222-222222222222',email:'viewer@example.com',email_confirmed_at:'2026-01-01',user_metadata:{name:'Viewer'},app_metadata:{workspace_role:'viewer'}},outside:{id:'33333333-3333-4333-8333-333333333333',email:'outside@example.com',email_confirmed_at:'2026-01-01',user_metadata:{workspace_role:'admin'},app_metadata:{}}};
 global.fetch=async(url,options={})=>{
  const u=new URL(url);if(u.origin!==process.env.SUPABASE_URL)return original(url,options);const p=JSON.parse(options.body||'{}');calls.push(u.pathname);
  if(u.pathname.includes('/rest/v1/rpc/')){const fn=u.pathname.split('/').pop();if(fn==='review_tracker_kv_get')return Response.json(kv.get(p.p_key)??null);if(fn==='review_tracker_kv_set'){kv.set(p.p_key,p.p_value);return Response.json(null);}if(fn==='review_tracker_kv_delete'){kv.delete(p.p_key);return Response.json(null);}if(fn==='review_tracker_lock')return Response.json(true);if(fn==='review_tracker_unlock')return Response.json(null);if(fn==='review_tracker_directory_read')return Response.json([]);throw Error('Unexpected RPC '+fn);}
  if(u.pathname==='/auth/v1/token'){const user=Object.values(users).find(v=>v.email===p.email);if(!user||p.password!=='correct-password-123')return Response.json({msg:'Sensitive provider error'},{status:400});return Response.json({user,access_token:'supabase-user-token'});}
  if(u.pathname==='/auth/v1/admin/users'&&(options.method||'GET')==='GET')return Response.json({users:Object.values(users)});
  if(u.pathname.startsWith('/auth/v1/admin/users/')){const user=Object.values(users).find(v=>v.id===u.pathname.split('/').pop());if(!user)return Response.json({},{status:404});if(options.method==='PUT')user.app_metadata=p.app_metadata;return Response.json(user);}
  if(u.pathname==='/auth/v1/user'){if(options.headers.Authorization!=='Bearer supabase-user-token')return Response.json({},{status:401});return Response.json(users.owner);}
  if(u.pathname==='/auth/v1/recover'){assert.match(u.searchParams.get('redirect_to'),/^https:\/\/workspace\.example\.com/);return Response.json({});}
  throw Error('Unexpected auth request '+u.pathname);
 };
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const req=(path,token,body,method=body?'POST':'GET')=>original(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 const login=async(address,remember=false)=>{const r=await req('/api/auth/login',null,{email:address,password:'correct-password-123',remember});assert.equal(r.status,200);return r.json();};
 try{
  assert.equal((await req('/api/auth/config')).status,200);assert.equal((await req('/api/directory')).status,401);assert.equal((await req('/api/directory',process.env.APP_PASSWORD)).status,401);
  const bad=await req('/api/auth/login',null,{email:'owner@example.com',password:'wrong'});assert.equal(bad.status,401);assert.doesNotMatch(await bad.text(),/Sensitive provider/);
  assert.equal((await req('/api/auth/login',null,{email:'outside@example.com',password:'correct-password-123',role:'admin'})).status,403);
  const owner=await login('owner@example.com');assert.equal(owner.user.role,'admin');assert.notEqual(owner.token,'correct-password-123');assert.equal(JSON.stringify([...kv]).includes('correct-password-123'),false);
  const viewer=await login('viewer@example.com');assert.equal((await req('/api/directory',viewer.token)).status,200);assert.equal((await req('/api/manual-summary',viewer.token,{})).status,403);assert.equal((await req('/api/bluejay/dashboard?refresh=1',viewer.token)).status,403);assert.equal((await req('/api/auth/users',viewer.token)).status,403);assert.equal((await req('/api/auth/users',owner.token)).status,200);
  assert.equal((await req('/api/auth/users/'+owner.user.id,owner.token,{role:'disabled'},'PATCH')).status,400);
  assert.equal((await req('/api/auth/users/'+viewer.user.id,owner.token,{role:'disabled'},'PATCH')).status,200);assert.equal((await req('/api/session',viewer.token)).status,401);
  assert.equal((await req('/api/auth/logout',owner.token,{})).status,200);assert.equal((await req('/api/session',owner.token)).status,401);
  const first=await login('owner@example.com'),second=await login('owner@example.com',true);assert.ok(Date.parse(second.expiresAt)-Date.now()>6*86400000);assert.equal((await req('/api/auth/logout-all',first.token,{})).status,200);assert.equal((await req('/api/session',second.token)).status,401);
  const fresh=await login('owner@example.com');const record=[...kv.values()].find(v=>v?.userId===users.owner.id&&v.expiresAt===fresh.expiresAt);record.expiresAt='2000-01-01';assert.equal((await req('/api/session',fresh.token)).status,401);
  assert.equal((await req('/api/auth/forgot-password',null,{email:'unknown@example.com'})).status,200);
  const passwordSession=await login('owner@example.com');assert.equal((await req('/api/auth/password',passwordSession.token,{currentPassword:'wrong',password:'new-password-1234'})).status,400);assert.equal((await req('/api/auth/password',passwordSession.token,{currentPassword:'correct-password-123',password:'new-password-1234'})).status,200);assert.equal((await req('/api/session',passwordSession.token)).status,401);
  const beforeReset=await login('owner@example.com');assert.equal((await req('/api/auth/reset-password',null,{accessToken:'invalid',password:'reset-password-1234'})).status,400);assert.equal((await req('/api/auth/reset-password',null,{accessToken:'supabase-user-token',password:'reset-password-1234'})).status,200);assert.equal((await req('/api/session',beforeReset.token)).status,401);
 }finally{global.fetch=original;process.env=env;server.closeAllConnections();await new Promise(done=>server.close(done));}
});
