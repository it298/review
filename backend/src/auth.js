import {createHash,randomBytes} from 'node:crypto';
import {getValue,setValue,deleteValue,lock} from './store.js';
export const authMode=()=>process.env.AUTH_MODE==='supabase'?'supabase':'password';
const hash=v=>createHash('sha256').update(v).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const bearer=req=>String(req.headers.authorization||'').replace(/^Bearer /,'');
const email=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const password=v=>typeof v==='string'&&v.length>=12&&v.length<=128;
function role(user){
 if(!user?.id||!user.email_confirmed_at||user.banned_until&&Date.parse(user.banned_until)>Date.now())return null;
 if(user.app_metadata?.workspace_role==='disabled')return null;
 if(process.env.AUTH_ADMIN_EMAIL&&user.email?.toLowerCase()===process.env.AUTH_ADMIN_EMAIL.trim().toLowerCase())return 'admin';
 const value=user.app_metadata?.workspace_role;return ['admin','manager','member','viewer'].includes(value)?value:null;
}
function publicUser(user){return {id:user.id,email:user.email,name:String(user.user_metadata?.name||user.email).slice(0,100),role:role(user),mustChangePassword:user.app_metadata?.workspace_must_change_password===true};}
async function authFetch(path,{method='GET',body,token}={}){
 const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret||!process.env.SUPABASE_URL)throw fail(503,'Chưa cấu hình dịch vụ đăng nhập.');
 const base=new URL(process.env.SUPABASE_URL);if(base.protocol!=='https:'||base.username||base.password)throw fail(503,'Cấu hình đăng nhập không hợp lệ.');
 const headers={apikey:secret,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;else if(!secret.startsWith('sb_secret_'))headers.Authorization='Bearer '+secret;
 const response=await fetch(new URL('/auth/v1/'+path,base),{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw fail(response.status===429?429:response.status>=500?503:400,response.status===429?'Thao tác quá nhiều. Vui lòng thử lại sau.':'Không thực hiện được thao tác tài khoản.');
 return data;
}
async function throttle(req,action,emailValue=''){
 const key='auth:limit:'+hash(action+':'+req.ip+':'+emailValue.toLowerCase()),release=await lock(key,10);
 if(!release)throw fail(429,'Thao tác quá nhanh. Vui lòng thử lại sau.');
 try{const count=Number(await getValue(key)||0);if(count>=10)throw fail(429,'Thao tác quá nhiều. Vui lòng thử lại sau.');await setValue(key,count+1,600);}finally{await release();}
}
async function version(id){return await getValue('auth:version:'+id)||'initial';}
async function revokeAll(id){await setValue('auth:version:'+id,randomBytes(24).toString('hex'),604800);}
async function finishPasswordChange(id){const data=await authFetch('admin/users/'+encodeURIComponent(id)),user=data.user||data;await authFetch('admin/users/'+encodeURIComponent(id),{method:'PUT',body:{app_metadata:{...user.app_metadata,workspace_must_change_password:false}}});await revokeAll(id);}
async function issue(user,remember=false){const token=randomBytes(32).toString('base64url'),seconds=remember?604800:43200,expiresAt=new Date(Date.now()+seconds*1000).toISOString();await setValue('auth:session:'+hash(token),{userId:user.id,version:await version(user.id),expiresAt},seconds);return {token,expiresAt,user:publicUser(user)};}
export async function authenticateUser(req){
 const token=bearer(req);if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw fail(401,'Phiên đăng nhập đã hết hạn.');
 const session=await getValue('auth:session:'+hash(token));
 if(!session||Date.parse(session.expiresAt)<=Date.now()||session.version!==await version(session.userId))throw fail(401,'Phiên đăng nhập đã hết hạn.');
 let user;try{const result=await authFetch('admin/users/'+encodeURIComponent(session.userId));user=result.user||result;}catch(e){if(e.status===400)throw fail(401,'Tài khoản không còn hoạt động.');throw e;}
 if(!role(user))throw fail(401,'Tài khoản không còn quyền truy cập.');req.sessionToken=token;req.user=publicUser(user);req.expiresAt=session.expiresAt;
}
export function installPublicAuth(app){
 app.get('/api/auth/config',(_req,res)=>res.json({mode:authMode()}));
 app.post('/api/auth/login',async(req,res,next)=>{try{
  if(authMode()!=='supabase')throw fail(409,'Đăng nhập email chưa được bật.');
  const {email:address,password:secret,remember}=req.body||{};if(!email(address)||typeof secret!=='string'||!secret||secret.length>128)throw fail(400,'Nhập email và mật khẩu hợp lệ.');
  await throttle(req,'login',address);
  let result;try{result=await authFetch('token?grant_type=password',{method:'POST',body:{email:address.trim().toLowerCase(),password:secret}});}catch(e){if(e.status===400)throw fail(401,'Email hoặc mật khẩu không đúng.');throw e;}
  if(!role(result.user))throw fail(403,'Tài khoản chưa được cấp quyền vào workspace.');
  res.json(await issue(result.user,remember===true));
 }catch(e){next(e);}});
 app.post('/api/auth/forgot-password',async(req,res,next)=>{try{
  if(authMode()!=='supabase'||!email(req.body?.email))throw fail(400,'Nhập email hợp lệ.');await throttle(req,'recovery',req.body.email);
  const target=new URL(process.env.FRONTEND_URL||'');if(!['https:','http:'].includes(target.protocol)||target.username||target.password)throw fail(503,'Chưa cấu hình URL khôi phục.');target.searchParams.set('auth','recovery');
  await authFetch('recover?redirect_to='+encodeURIComponent(target.href),{method:'POST',body:{email:req.body.email.trim().toLowerCase()}});
  res.json({ok:true,message:'Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi tới hộp thư.'});
 }catch(e){next(e);}});
 app.post('/api/auth/reset-password',async(req,res,next)=>{try{
  if(authMode()!=='supabase'||!password(req.body?.password)||typeof req.body?.accessToken!=='string'||req.body.accessToken.length>6000)throw fail(400,'Mật khẩu mới cần 12–128 ký tự.');await throttle(req,'reset');
  const user=await authFetch('user',{token:req.body.accessToken});if(!role(user))throw fail(403,'Tài khoản chưa được cấp quyền.');
  await authFetch('user',{method:'PUT',token:req.body.accessToken,body:{password:req.body.password}});await finishPasswordChange(user.id);res.json({ok:true});
 }catch(e){next(e);}});
}
export function installPrivateAuth(app){
 app.post('/api/auth/logout',async(req,res,next)=>{try{if(req.sessionToken)await deleteValue('auth:session:'+hash(req.sessionToken));res.json({ok:true});}catch(e){next(e);}});
 app.post('/api/auth/logout-all',async(req,res,next)=>{try{if(req.user?.id!=='legacy')await revokeAll(req.user.id);res.json({ok:true});}catch(e){next(e);}});
 app.post('/api/auth/password',async(req,res,next)=>{try{
  if(authMode()!=='supabase'||!password(req.body?.password)||typeof req.body?.currentPassword!=='string'||req.body.currentPassword.length>128)throw fail(400,'Mật khẩu mới cần 12–128 ký tự.');await throttle(req,'password',req.user.email);
  let verified;try{verified=await authFetch('token?grant_type=password',{method:'POST',body:{email:req.user.email,password:req.body.currentPassword}});}catch(e){if(e.status===400)throw fail(400,'Mật khẩu hiện tại không đúng.');throw e;}
  if(verified.user.id!==req.user.id)throw fail(403,'Không có quyền thay đổi tài khoản.');
  await authFetch('user',{method:'PUT',token:verified.access_token,body:{password:req.body.password}});await finishPasswordChange(req.user.id);res.json({ok:true});
 }catch(e){next(e);}});
 app.get('/api/auth/users',async(req,res,next)=>{try{
  if(req.user?.role!=='admin'||authMode()!=='supabase')throw fail(403,'Chỉ quản trị viên có quyền quản lý tài khoản.');
  const page=Number(req.query.page||1);if(!Number.isInteger(page)||page<1||page>1000)throw fail(400,'Trang không hợp lệ.');
  const data=await authFetch('admin/users?page='+page+'&per_page=50');res.json({users:(data.users||[]).filter(u=>role(u)||u.app_metadata?.workspace_role==='disabled').map(u=>({...publicUser(u),role:u.app_metadata?.workspace_role==='disabled'?'disabled':role(u),lastSignIn:u.last_sign_in_at})),page,hasMore:(data.users||[]).length===50});
 }catch(e){next(e);}});
 app.post('/api/auth/users',async(req,res,next)=>{try{
  if(req.user?.role!=='admin'||authMode()!=='supabase')throw fail(403,'Chỉ quản trị viên có quyền tạo tài khoản.');
  const body=req.body||{};if(!email(body.email)||!['admin','manager','member','viewer'].includes(body.role)||typeof body.name!=='string'||!body.name.trim()||body.name.length>100)throw fail(400,'Nhập tên, email và quyền hợp lệ.');await throttle(req,'create');
  const data=await authFetch('admin/users',{method:'POST',body:{email:body.email.trim().toLowerCase(),password:'123456',email_confirm:true,user_metadata:{name:body.name.trim()},app_metadata:{workspace_role:body.role,workspace_must_change_password:false}}});res.status(201).json({user:publicUser(data.user||data)});
 }catch(e){next(e);}});
 app.post('/api/auth/users/:id/reset-password',async(req,res,next)=>{try{
  if(req.user?.role!=='admin'||authMode()!=='supabase')throw fail(403,'Chỉ quản trị viên có quyền reset mật khẩu.');
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id)||req.params.id===req.user.id)throw fail(400,'Dùng mục Đổi mật khẩu cho tài khoản của chính mình.');
  const result=await authFetch('admin/users/'+req.params.id),user=result.user||result;
  if(!role(user))throw fail(403,'Tài khoản không thuộc workspace hoặc đã bị khóa.');
  if(process.env.AUTH_ADMIN_EMAIL&&user.email?.toLowerCase()===process.env.AUTH_ADMIN_EMAIL.trim().toLowerCase())throw fail(400,'Không reset mật khẩu tạm cho quản trị chính.');
  await throttle(req,'admin-reset');
  await authFetch('admin/users/'+req.params.id,{method:'PUT',body:{password:'123456',app_metadata:{...user.app_metadata,workspace_must_change_password:true}}});
  await revokeAll(user.id);res.json({ok:true,message:'Đã reset về 123456. Người dùng phải đổi mật khẩu ở lần đăng nhập tiếp theo.'});
 }catch(e){next(e);}});
 app.patch('/api/auth/users/:id',async(req,res,next)=>{try{
  if(req.user?.role!=='admin'||authMode()!=='supabase')throw fail(403,'Chỉ quản trị viên có quyền đổi quyền tài khoản.');
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id)||!['admin','manager','member','viewer','disabled'].includes(req.body?.role))throw fail(400,'Tài khoản hoặc quyền không hợp lệ.');if(req.params.id===req.user.id)throw fail(400,'Không thay đổi quyền của chính mình.');
  const result=await authFetch('admin/users/'+req.params.id),user=result.user||result;if(!role(user)&&user.app_metadata?.workspace_role!=='disabled')throw fail(403,'Tài khoản không thuộc workspace.');
  if(process.env.AUTH_ADMIN_EMAIL&&user.email?.toLowerCase()===process.env.AUTH_ADMIN_EMAIL.trim().toLowerCase())throw fail(400,'Không thay đổi quyền tài khoản quản trị chính.');
  await authFetch('admin/users/'+req.params.id,{method:'PUT',body:{app_metadata:{...user.app_metadata,workspace_role:req.body.role}}});await revokeAll(user.id);res.json({ok:true});
 }catch(e){next(e);}});
}
