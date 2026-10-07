import { randomBytes,createHash,createCipheriv,createDecipheriv } from 'node:crypto';
import { rpc,setValue,lock } from './store.js';

export const BUSINESS_SCOPE='https://www.googleapis.com/auth/business.manage';
const failure=(message,status=409)=>Object.assign(new Error(message),{status});
export function encryptionKey(){
 const key=Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
 if(key.length!==32)throw failure('Cần TOKEN_ENCRYPTION_KEY mã hóa base64 của 32 byte.',503);
 return key;
}
export function encryptTokens(value){
 const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);cipher.setAAD(Buffer.from('review-tracker:google:v1'));
 const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),data.toString('base64')].join('.');
}
export function decryptTokens(payload){
 const [version,iv,tag,data]=String(payload).split('.');if(version!=='v1')throw failure('Kết nối Google cần được tạo lại.');
 try{const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));cipher.setAAD(Buffer.from('review-tracker:google:v1'));cipher.setAuthTag(Buffer.from(tag,'base64'));return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64')),cipher.final()]).toString('utf8'));}
 catch{throw failure('Không giải mã được kết nối Google. Kiểm tra khóa mã hóa hoặc kết nối lại.');}
}
export function frontendUrl(){
 const raw=process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || '').split(',')[0];
 const url=new URL(raw);
 if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))throw failure('FRONTEND_URL không hợp lệ.',503);
 return url;
}
export function oauthConfig(){
 if(!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)throw failure('Chưa cấu hình Google OAuth trên backend.',503);
 encryptionKey();frontendUrl();
 const raw=process.env.GOOGLE_REDIRECT_URI || (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.replace(/\/$/,'')+'/api/google/callback' : '');
 const uri=new URL(raw);
 if(uri.protocol!=='https:' && !(uri.protocol==='http:' && ['localhost','127.0.0.1'].includes(uri.hostname)))throw failure('GOOGLE_REDIRECT_URI không hợp lệ.',503);
 return {clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,redirectUri:uri.href};
}
async function connection(){return rpc('review_tracker_connection_get');}
async function saveTokens(tokens,expectedRevision=null){
 const saved=await rpc('review_tracker_connection_set',{p_payload:encryptTokens(tokens),p_expected_revision:expectedRevision});
 if(!saved)throw failure('Kết nối Google đã thay đổi. Hãy thử lại.');return saved;
}
async function tokenRequest(values){
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok || !data.access_token)throw failure('Google không cấp được token. Kiểm tra OAuth hoặc kết nối lại tài khoản.');
 return data;
}
export async function connectionStatus(){
 let configured=false;try{oauthConfig();configured=true;}catch{}
 if(!configured)return {configured:false,connected:false};
 const record=await connection();return {configured:true,connected:!!record};
}
export async function startOAuth(){
 const config=oauthConfig();const state=randomBytes(32).toString('hex');const verifier=randomBytes(48).toString('base64url');
 await setValue('oauth:'+state,{verifier},600);
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:BUSINESS_SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(key,value);
 return url.href;
}
export async function finishOAuth(query){
 const config=oauthConfig();
 if(typeof query.state!=='string' || !/^[a-f0-9]{64}$/.test(query.state))throw failure('Phiên kết nối không hợp lệ.',400);
 const pending=await rpc('review_tracker_kv_take',{p_key:'oauth:'+query.state});
 if(!pending)throw failure('Phiên kết nối đã hết hạn hoặc được sử dụng.',400);
 if(query.error)return 'denied';
 if(typeof query.code!=='string' || !query.code || query.code.length>4096)throw failure('Thiếu mã OAuth.',400);
 const tokens=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,grant_type:'authorization_code',code:query.code,code_verifier:pending.verifier});
 if(!tokens.refresh_token || (tokens.scope && !tokens.scope.split(' ').includes(BUSINESS_SCOPE)))throw failure('Google chưa cấp quyền hoặc refresh token. Hãy kết nối lại.');
 await saveTokens({access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_at:Date.now()+Number(tokens.expires_in || 3600)*1000});
 return 'connected';
}
export async function accessToken(force=false){
 let record=await connection();if(!record)throw failure('Chưa kết nối Google. Vào Địa điểm để kết nối.');
 let tokens=decryptTokens(record.payload);
 if(!force && tokens.access_token && tokens.expires_at>Date.now()+60000)return tokens.access_token;
 const release=await lock('google-refresh',60);if(!release)throw failure('Đang làm mới kết nối Google. Vui lòng thử lại.');
 try{
  record=await connection();if(!record)throw failure('Kết nối Google đã ngắt.');tokens=decryptTokens(record.payload);
  if(!force && tokens.access_token && tokens.expires_at>Date.now()+60000)return tokens.access_token;
  const config=oauthConfig();
  const fresh=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'refresh_token',refresh_token:tokens.refresh_token});
  await saveTokens({...tokens,refresh_token:fresh.refresh_token || tokens.refresh_token,access_token:fresh.access_token,expires_at:Date.now()+Number(fresh.expires_in || 3600)*1000},record.revision);
  return fresh.access_token;
 }finally{await release();}
}
export async function disconnectGoogle(){await rpc('review_tracker_connection_delete');return {ok:true};}
async function googleGet(url){
 let token=await accessToken();let response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(response.status===401){token=await accessToken(true);response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});}
 if(!response.ok){
  if(response.status===403)throw failure('Google từ chối truy cập. Kiểm tra project được duyệt API, các API đã bật và quyền quản lý địa điểm.',403);
  if(response.status===429)throw failure('Đã vượt hạn mức Google API. Vui lòng thử lại sau.',429);
  throw failure('Không lấy được dữ liệu Google Business Profile. Kiểm tra kết nối và quyền địa điểm.',502);
 }
 return response.json();
}
export function validateAccount(value){if(typeof value!=='string' || !/^accounts\/\d+$/.test(value))throw failure('Account không hợp lệ.',400);return value;}
export function validateLocation(value){if(typeof value!=='string' || !/^locations\/\d+$/.test(value))throw failure('Location không hợp lệ.',400);return value;}
export function listAccounts(pageToken){
 const url=new URL('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');url.searchParams.set('pageSize','20');if(pageToken)url.searchParams.set('pageToken',pageToken);return googleGet(url);
}
export function listLocations(account,pageToken){
 validateAccount(account);const url=new URL('https://mybusinessbusinessinformation.googleapis.com/v1/'+account+'/locations');url.searchParams.set('pageSize','100');url.searchParams.set('readMask','name,title,storefrontAddress,metadata');if(pageToken)url.searchParams.set('pageToken',pageToken);return googleGet(url);
}
export async function readLocation(account,location){
 validateAccount(account);validateLocation(location);
 const infoUrl=new URL('https://mybusinessbusinessinformation.googleapis.com/v1/'+location);infoUrl.searchParams.set('readMask','name,title,storefrontAddress,metadata');
 const info=await googleGet(infoUrl);
 const summary=await googleGet('https://mybusiness.googleapis.com/v4/'+account+'/'+location+'/reviews?pageSize=1');
 // Google JSON responses can omit fields whose protobuf default is zero.
 const count=summary.totalReviewCount ?? ((summary.reviews?.length ?? 0)===0 && summary.averageRating===undefined ? 0 : undefined);
 if(!Number.isSafeInteger(count) || count<0)throw failure('Google không trả tổng review hợp lệ.',502);
 const rating=count===0 ? null : summary.averageRating;
 if(count>0 && (typeof rating!=='number' || rating<1 || rating>5))throw failure('Google không trả điểm sao hợp lệ.',502);
 const placeId=info.metadata?.placeId;
 const fallback=new URL('https://www.google.com/maps/search/');fallback.searchParams.set('api','1');fallback.searchParams.set('query',info.title || location);if(placeId)fallback.searchParams.set('query_place_id',placeId);
 const address=info.storefrontAddress;
 return {name:(info.title || location).slice(0,200),reviewCount:count,rating,address:address ? [...(address.addressLines || []),address.locality,address.administrativeArea,address.regionCode].filter(Boolean).join(', ') : '',url:info.metadata?.mapsUri || fallback.href,googleAccount:account,googleLocation:location,dataSource:'google_business_profile'};
}
