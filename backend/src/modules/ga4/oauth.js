import {randomBytes,createHash} from 'node:crypto';
import {encryptTokens,decryptTokens,oauthConfig} from '../../google.js';
import {getValue,setValue,rpc,deleteValue,lock} from '../../store.js';
export const ANALYTICS_SCOPE='https://www.googleapis.com/auth/analytics.readonly';
export const GA4_CONNECTION_KEY='marketing:report:'+createHash('sha256').update('ga4:oauth:connection:v1').digest('hex');
const fail=(message,status=409)=>Object.assign(Error(message),{status});
const save=tokens=>rpc('review_tracker_marketing_set',{p_key:GA4_CONNECTION_KEY,p_value:{payload:encryptTokens(tokens)}});
async function exchange(values){
 let r,d;try{r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(20000),redirect:'error'});d=await r.json();}catch{throw fail('Không kết nối được dịch vụ xác thực Google Analytics.',502);}
 if(!r.ok||typeof d.access_token!=='string'||!Number.isFinite(d.expires_in)||d.expires_in<=60)throw fail('Google chưa cấp token Analytics. Kết nối lại tài khoản có quyền GA4.',502);return d;
}
export async function ga4OAuthStatus(){
 try{oauthConfig();}catch{return {oauthConfigured:false,oauthConnected:false};}
 return {oauthConfigured:true,oauthConnected:!!(await getValue(GA4_CONNECTION_KEY))?.payload};
}
export async function startGa4OAuth(){
 const c=oauthConfig(),state='ga4_'+randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');
 await setValue('oauth:'+state,{verifier},600);const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [key,value] of Object.entries({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:ANALYTICS_SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);return url.href;
}
export async function finishGa4OAuth(query){
 const c=oauthConfig();if(typeof query.state!=='string'||!/^ga4_[a-f0-9]{64}$/.test(query.state))throw fail('Phiên kết nối GA4 không hợp lệ.',400);
 const pending=await rpc('review_tracker_kv_take',{p_key:'oauth:'+query.state});if(!pending?.verifier)throw fail('Phiên kết nối GA4 đã dùng hoặc hết hạn.',400);if(query.error)return 'denied';
 if(typeof query.code!=='string'||!query.code||query.code.length>4096)throw fail('Thiếu mã cấp quyền GA4.',400);
 const tokens=await exchange({client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,grant_type:'authorization_code',code:query.code,code_verifier:pending.verifier});
 if(!tokens.refresh_token||(tokens.scope&&!tokens.scope.split(' ').includes(ANALYTICS_SCOPE)))throw fail('Google chưa cấp quyền đọc Analytics và refresh token. Kết nối lại.',403);
 const release=await lock('ga4:oauth',60);if(!release)throw fail('Kết nối GA4 đang được cập nhật. Thử lại.');
 try{await save({access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:Date.now()+tokens.expires_in*1000});}finally{await release();}return 'connected';
}
export async function ga4AccessToken(){
 let record=await getValue(GA4_CONNECTION_KEY);if(!record?.payload)throw fail('Chưa kết nối Google Analytics. Bấm Kết nối Google Analytics trong Marketing & Tiếp cận.');
 let tokens=decryptTokens(record.payload);if(tokens.access_token&&tokens.expires_at>Date.now()+60000)return tokens.access_token;
 const release=await lock('ga4:oauth',60);if(!release)throw fail('Đang làm mới kết nối GA4. Thử lại sau.');
 try{record=await getValue(GA4_CONNECTION_KEY);if(!record?.payload)throw fail('Kết nối GA4 đã ngắt.');tokens=decryptTokens(record.payload);if(tokens.access_token&&tokens.expires_at>Date.now()+60000)return tokens.access_token;
  const c=oauthConfig(),fresh=await exchange({client_id:c.clientId,client_secret:c.clientSecret,grant_type:'refresh_token',refresh_token:tokens.refresh_token});await save({...tokens,access_token:fresh.access_token,refresh_token:fresh.refresh_token||tokens.refresh_token,expires_at:Date.now()+fresh.expires_in*1000});return fresh.access_token;
 }finally{await release();}
}
export async function disconnectGa4(){const release=await lock('ga4:oauth',60);if(!release)throw fail('Kết nối GA4 đang được cập nhật. Thử lại.');try{await deleteValue(GA4_CONNECTION_KEY);}finally{await release();}return {ok:true};}
