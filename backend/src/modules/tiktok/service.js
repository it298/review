import {createHash,randomBytes} from 'node:crypto';
import {getValue,setValue,deleteValue,rpc,lock} from '../../store.js';
import {encryptTokens,decryptTokens,encryptionKey,frontendUrl} from '../../google.js';
import {TIKTOK_LOCATIONS} from './locations.js';
import {calendarDate} from '../../utils/date.js';
export const TIKTOK_SCOPES=['user.info.basic','user.info.stats','video.list'];
const key=name=>'marketing:report:'+createHash('sha256').update('tiktok:v1:'+name).digest('hex');
export const TIKTOK_CONNECTION_KEY=key('connection'),TIKTOK_REPORT_KEY=key('report');
const fail=(message,status=502)=>Object.assign(Error(message),{status});
export function tiktokConfig(){
 const clientKey=process.env.TIKTOK_CLIENT_KEY,clientSecret=process.env.TIKTOK_CLIENT_SECRET;
 if(!clientKey||!clientSecret||clientKey.trim()!==clientKey||clientSecret.trim()!==clientSecret)throw fail('Cần TIKTOK_CLIENT_KEY và TIKTOK_CLIENT_SECRET của cùng Sandbox trên backend.',503);
 let uri;try{uri=new URL(process.env.TIKTOK_REDIRECT_URI);}catch{throw fail('Cần TIKTOK_REDIRECT_URI hợp lệ trên backend.',503);}
 if(uri.protocol!=='https:'||uri.search||uri.hash||uri.username||uri.password||uri.href.length>=512)throw fail('TikTok Redirect URI phải là HTTPS, không có query hoặc fragment.',503);
 encryptionKey();frontendUrl();return {clientKey,clientSecret,redirectUri:uri.href};
}
function apiError(code){
 if(['invalid_client','unauthorized_client'].includes(code))return fail('TikTok không chấp nhận Client Key/Secret. Kiểm tra thông tin của cùng Sandbox.');
 if(['invalid_grant','access_token_invalid','invalid_token'].includes(code))return fail('Phiên TikTok hết hạn hoặc bị thu hồi. Bấm Connect TikTok lại.',409);
 if(['scope_not_authorized','scope_permission_missed'].includes(code))return fail('TikTok chưa cấp quyền chỉ số. Kiểm tra scopes và Target users trong Sandbox.',403);
 if(code==='rate_limit_exceeded')return fail('TikTok đang giới hạn API. Thử lại sau.',429);
 return fail('TikTok chưa trả dữ liệu hợp lệ. Kiểm tra Sandbox, Target users và quyền API.');
}
export function createTikTokClient({fetcher=(...args)=>fetch(...args),config=tiktokConfig,deadline=()=>Date.now()+240000}={}){
 async function request(path,options={},token){
  let response,data;const remaining=deadline()-Date.now();if(remaining<=0)throw fail('Đợt đồng bộ TikTok quá thời gian. Báo cáo cũ được giữ lại.');
  try{response=await fetcher('https://open.tiktokapis.com/v2/'+path,{...options,headers:{...options.headers,...(token?{Authorization:'Bearer '+token}:{})},redirect:'error',signal:AbortSignal.timeout(Math.min(20000,remaining))});data=await response.json().catch(()=>null);}catch{throw fail('Không kết nối được TikTok. Thử lại sau.');}
  if(path==='oauth/revoke/'&&response.ok&&!data)return {};
  const code=typeof data?.error==='string'?data.error:data?.error?.code;
  if(response.status===401)throw apiError('access_token_invalid');
  if(response.status===429)throw apiError('rate_limit_exceeded');
  if(!response.ok||(code&&code!=='ok'))throw apiError(code);
  if(!data||typeof data!=='object')throw apiError();return data;
 }
 const form=values=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
 return {
  token:values=>{const c=config();return request('oauth/token/',form({client_key:c.clientKey,client_secret:c.clientSecret,...values}));},
  async revoke(token){const c=config();await request('oauth/revoke/',form({client_key:c.clientKey,client_secret:c.clientSecret,token}));},
  async user(token,stats){const fields='open_id,display_name'+(stats?',follower_count,following_count,likes_count,video_count':'');return (await request('user/info/?fields='+fields,{},token)).data?.user;},
  async videos(token,cursor){return (await request('video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count,share_count',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({max_count:20,...(cursor==null?{}:{cursor})})},token)).data;}
 };
}
const count=v=>{if(v==null)return null;if(!Number.isSafeInteger(v)||v<0)throw fail('TikTok trả số liệu không hợp lệ.');return v;};
export function normalizeTikTokVideo(v){
 if(!v||typeof v.id!=='string'||!/^\d{1,40}$/.test(v.id)||!Number.isSafeInteger(v.create_time)||v.create_time<0||v.create_time>Date.now()/1000+86400)throw fail('TikTok trả video không hợp lệ.');
 let url=null;try{const u=new URL(v.share_url);if(u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='tiktok.com'||u.hostname.endsWith('.tiktok.com')))url=u.href;}catch{}
 return {id:v.id,title:typeof v.title==='string'?v.title.slice(0,300):'',publishedAt:new Date(v.create_time*1000).toISOString(),date:calendarDate(new Date(v.create_time*1000)),url,view_count:count(v.view_count),like_count:count(v.like_count),comment_count:count(v.comment_count),share_count:count(v.share_count)};
}
export function validateTikTokTokens(raw,now,expectedId){
 if(!raw||typeof raw.open_id!=='string'||!raw.open_id||raw.open_id.length>256||(expectedId&&raw.open_id!==expectedId)||typeof raw.access_token!=='string'||!raw.access_token||typeof raw.refresh_token!=='string'||!raw.refresh_token||!Number.isSafeInteger(raw.expires_in)||raw.expires_in<=60||!Number.isSafeInteger(raw.refresh_expires_in)||raw.refresh_expires_in<=60||typeof raw.scope!=='string')throw fail('TikTok chưa cấp đủ token hợp lệ. Kết nối lại.',409);
 const scopes=raw.scope.split(',').map(v=>v.trim()).filter(v=>TIKTOK_SCOPES.includes(v));if(!scopes.includes('user.info.basic'))throw fail('TikTok chưa cấp quyền thông tin cơ bản.',403);
 return {provider:'tiktok',openId:raw.open_id,accessToken:raw.access_token,refreshToken:raw.refresh_token,expiresAt:now+raw.expires_in*1000,refreshExpiresAt:now+raw.refresh_expires_in*1000,scopes};
}
export function createTikTokService({locationKey='legacy',beforeStore=async()=>{},get=getValue,set=setValue,remove=deleteValue,take=k=>rpc('review_tracker_kv_take',{p_key:k}),save=(k,v)=>rpc('review_tracker_marketing_set',{p_key:k,p_value:v}),acquire=lock,config=tiktokConfig,client=createTikTokClient(),now=()=>Date.now(),seal=encryptTokens,unseal=decryptTokens}={}){
 const connectionKey=locationKey==='legacy'?TIKTOK_CONNECTION_KEY:key(locationKey+':connection'),reportKey=locationKey==='legacy'?TIKTOK_REPORT_KEY:key(locationKey+':report');
 async function tokens(){const record=await get(connectionKey);if(!record?.payload)throw fail('Chưa kết nối TikTok. Bấm Connect TikTok trước.',409);let t;try{t=unseal(record.payload);}catch{throw fail('Không giải mã được kết nối TikTok. Kiểm tra TOKEN_ENCRYPTION_KEY.',409);}if(t?.provider!=='tiktok')throw fail('Kết nối TikTok không hợp lệ.',409);return t;}
 const store=t=>save(connectionKey,{payload:seal(t)});
 async function exclusive(fn){const release=await acquire(locationKey==='legacy'?'tiktok:connection':'tiktok:'+locationKey,280);if(!release)throw fail('TikTok đang cập nhật kết nối. Thử lại sau.',409);try{return await fn();}finally{await release();}}
 async function access(t,force=false){if(!force&&t.expiresAt>now()+60000)return t;if(t.refreshExpiresAt<=now()+60000)throw fail('Refresh token TikTok đã hết hạn. Bấm Connect TikTok lại.',409);const fresh=validateTikTokTokens(await client.token({grant_type:'refresh_token',refresh_token:t.refreshToken}),now(),t.openId);await store(fresh);return fresh;}
 const service={
  async status(){let configured=false;try{config();configured=true;}catch{}if(!configured)return {configured:false,connected:false};let t;try{t=await tokens();}catch(e){if(e.status===409)return {configured:true,connected:false};throw e;}return {configured:true,connected:true,scopes:t.scopes,expiresAt:new Date(t.expiresAt).toISOString(),refreshExpiresAt:new Date(t.refreshExpiresAt).toISOString()};},
  async connect(actor){const c=config(),state='tiktok_'+randomBytes(32).toString('hex');await set('oauth:'+state,{actor,locationKey,clientKey:c.clientKey,redirectUri:c.redirectUri},600);const url=new URL('https://www.tiktok.com/v2/auth/authorize/');for(const [k,v] of Object.entries({client_key:c.clientKey,scope:TIKTOK_SCOPES.join(','),redirect_uri:c.redirectUri,response_type:'code',state,disable_auto_auth:'1'}))url.searchParams.set(k,v);return {url:url.href};},
  async finish(query){if(typeof query.state!=='string'||!/^tiktok_[a-f0-9]{64}$/.test(query.state))throw fail('Phiên kết nối TikTok không hợp lệ.',400);const pending=await take('oauth:'+query.state);const c=config();if(!pending||(pending.locationKey||'legacy')!==locationKey||pending.clientKey!==c.clientKey||pending.redirectUri!==c.redirectUri)throw fail('Phiên TikTok đã dùng, hết hạn hoặc cấu hình đã đổi.',400);if(query.error)return 'denied';if(typeof query.code!=='string'||!query.code||query.code.length>4096)throw fail('Thiếu mã cấp quyền TikTok.',400);const t=validateTikTokTokens(await client.token({grant_type:'authorization_code',code:query.code,redirect_uri:c.redirectUri}),now());await exclusive(async()=>{await beforeStore(t,locationKey);const previous=await get(reportKey);if(previous?.accountId!==t.openId)await remove(reportKey);await store(t);});return 'connected';},
  async read(){let t;try{t=await tokens();}catch(e){if(e.status===409)return {report:null};throw e;}const record=await get(reportKey);return {report:record?.accountId===t.openId?record.report:null};},
  async sync(){return exclusive(async()=>{
   let t=await access(await tokens()),deadline=now()+240000;
   async function run(fn){try{return await fn(t);}catch(e){if(e.status!==409)throw e;t=await access(t,true);return fn(t);}}
   const stats=t.scopes.includes('user.info.stats'),raw=await run(v=>client.user(v.accessToken,stats));if(raw?.open_id!==t.openId||typeof raw.display_name!=='string')throw fail('TikTok trả sai tài khoản hoặc thiếu hồ sơ.');
   const videos=[],seen=new Set(),cursors=new Set();let cursor,hasMore=false;
   if(t.scopes.includes('video.list'))for(let page=0;page<10;page++){
    if(now()>deadline)throw fail('TikTok đồng bộ quá thời gian. Báo cáo cũ được giữ lại.');const d=await run(v=>client.videos(v.accessToken,cursor));
    if(!Array.isArray(d?.videos)||typeof d.has_more!=='boolean'||d.videos.length>20)throw fail('TikTok trả danh sách video không hợp lệ.');
    for(const rawVideo of d.videos){const video=normalizeTikTokVideo(rawVideo);if(!seen.has(video.id)){seen.add(video.id);videos.push(video);}}
    hasMore=d.has_more;if(!hasMore)break;if(!Number.isSafeInteger(d.cursor)||d.cursor<0||cursors.has(d.cursor)||!d.videos.length)throw fail('TikTok lặp trang hoặc thiếu con trỏ. Báo cáo cũ được giữ lại.');cursor=d.cursor;cursors.add(cursor);
   }
   const capturedAt=new Date(now()).toISOString(),date=calendarDate(new Date(now())),profile={name:raw.display_name.slice(0,200),followerCount:stats?count(raw.follower_count):null,followingCount:stats?count(raw.following_count):null,likesCount:stats?count(raw.likes_count):null,videoCount:stats?count(raw.video_count):null};
   const previous=await get(reportKey),history=previous?.accountId===t.openId&&Array.isArray(previous.report?.history)?previous.report.history:[];
   const snapshot={date,followers:profile.followerCount,likes:profile.likesCount,videos:profile.videoCount,capturedAt};
   const report={source:'tiktok_display_api',capturedAt,profile,videos,hasMore,videoAccess:t.scopes.includes('video.list'),scopes:t.scopes,history:[...history.filter(s=>s.date!==date),snapshot].sort((a,b)=>a.date.localeCompare(b.date)).slice(-90)};
   await save(reportKey,{accountId:t.openId,report});return {report};
  });},
  async disconnect(){return exclusive(async()=>{let revoked=true;try{const t=await tokens();await client.revoke(t.accessToken);}catch{revoked=false;}await remove(connectionKey);await remove(reportKey);return {ok:true,revoked,notice:revoked?'Đã ngắt và xóa dữ liệu TikTok đã lưu.':'Đã xóa kết nối và dữ liệu cục bộ. Hãy thu hồi quyền ứng dụng trong TikTok nếu cần.'};});}
 };
 return service;
}

export function createTikTokAccounts(options={}){
 const get=options.get||getValue,acquire=options.acquire||lock,unseal=options.unseal||decryptTokens;
 const locations=[...TIKTOK_LOCATIONS,{key:'legacy',name:'Kết nối cũ · chưa gán địa điểm',username:''}];
 function location(value){const result=locations.find(l=>l.key===value);if(!result)throw fail('Chọn địa điểm TikTok hợp lệ.',400);return result;}
 async function beforeStore(tokens,current){
  for(const l of locations){if(l.key===current)continue;const record=await get(l.key==='legacy'?TIKTOK_CONNECTION_KEY:key(l.key+':connection'));if(!record?.payload)continue;let other;try{other=unseal(record.payload);}catch{throw fail('Một kết nối TikTok cũ không giải mã được; kiểm tra khóa mã hóa trước khi gán tài khoản.',409);}if(other.openId===tokens.openId)throw fail('Tài khoản TikTok này đã kết nối với '+l.name+'. Hãy ngắt kết nối ở địa điểm đó trước.',409);}
 }
 const services=new Map(locations.map(l=>[l.key,createTikTokService({...options,locationKey:l.key,beforeStore})]));
 const scoped=value=>services.get(location(value).key);
 async function accountRows(){return Promise.all(locations.map(async l=>{const service=scoped(l.key),s=await service.status(),r=await service.read();return {...l,...s,profile:r.report?.profile||null,capturedAt:r.report?.capturedAt||null};}));}
 return {
  async status(){const accounts=await accountRows();return {configured:accounts[0].configured,accounts:accounts.filter(l=>l.key!=='legacy'||l.connected)};},
  connect(actor,value){location(value);if(value==='legacy')throw fail('Chọn một trong năm địa điểm để tạo kết nối mới.',400);return scoped(value).connect(actor);},
  async finish(query){if(typeof query.state!=='string'||!/^tiktok_[a-f0-9]{64}$/.test(query.state))throw fail('Phiên TikTok không hợp lệ.',400);const pending=await get('oauth:'+query.state);if(!pending)throw fail('Phiên TikTok đã hết hạn hoặc đã dùng.',400);const value=location(pending.locationKey||'legacy').key;
   const release=await acquire('tiktok:account-mapping',280);if(!release)throw fail('Đang cập nhật tài khoản TikTok khác. Thử lại.',409);try{return {result:await scoped(value).finish(query),locationKey:value};}finally{await release();}
  },
  async read(value){if(value)return scoped(value).read();const reports=await Promise.all(locations.map(async l=>({key:l.key,name:l.name,...await scoped(l.key).read()})));return {reports:reports.filter(r=>r.key!=='legacy'||r.report)};},
  sync:value=>scoped(value).sync(),
  disconnect:value=>scoped(value).disconnect(),
  async syncAll(){const accounts=await accountRows(),results=[];for(const a of accounts.filter(a=>a.connected)){try{await scoped(a.key).sync();results.push({key:a.key,name:a.name,ok:true});}catch(e){results.push({key:a.key,name:a.name,ok:false,error:e.status?e.message:'Chưa lưu được TikTok. Kiểm tra kết nối dữ liệu.'});}}return {ok:results.every(r=>r.ok),results};}
 };
}
export const tiktokService=createTikTokAccounts();
