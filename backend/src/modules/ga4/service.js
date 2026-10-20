import {createHash,createPrivateKey,sign} from 'node:crypto';
import {getValue,rpc,lock} from '../../store.js';
import {performanceRange} from '../../marketing-google.js';
import {ga4AccessToken,ga4OAuthStatus} from './oauth.js';
export const GA4_SITES=Object.freeze([
 {key:'quy-nhon-sea-hotel',name:'Quy Nhon Sea Hotel',url:'https://quynhonseahotel.com/',propertyId:'559356291',streamId:'16146265588',measurementId:'G-5MZVXCHXHK'},
 {key:'yzistel-hoi-an',name:'Yzistel Hoi An',url:'https://yzistel.com/',propertyId:'559356291',streamId:'16147371718',measurementId:'G-B40Z4MQ0W3'},
 {key:'sontra-sea-hotel',name:'Sontra Sea Hotel',url:'https://sontraseahotel.com/',propertyId:'559356291',streamId:'16147401766',measurementId:'G-JKEP09TCP5'}
]);
export const GA4_METRICS=['totalUsers','activeUsers','newUsers','sessions','engagedSessions','screenPageViews','userEngagementDuration'];
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
export function credentials(){
 try{const c=JSON.parse(process.env.GA4_SERVICE_ACCOUNT_JSON||'null');if(c?.type!=='service_account'||typeof c.client_email!=='string'||!c.client_email.endsWith('.iam.gserviceaccount.com')||typeof c.private_key!=='string')throw Error();return c;}
 catch{throw fail('Chưa cấu hình GA4_SERVICE_ACCOUNT_JSON hợp lệ trên backend.',503);}
}
export async function ga4Status(){let serviceAccountEmail=null;try{serviceAccountEmail=credentials().client_email;}catch{}const oauth=await ga4OAuthStatus();return {...oauth,configured:!!serviceAccountEmail||oauth.oauthConfigured,connected:!!serviceAccountEmail||oauth.oauthConnected,serviceAccountEmail,sites:GA4_SITES,autoSync:process.env.GA4_AUTO_SYNC==='true'};}
export function createGa4Client({fetcher=(...args)=>fetch(...args),readCredentials=credentials}={}){
 let cached=null,inflight=null;
 async function token(){
  if(!process.env.GA4_SERVICE_ACCOUNT_JSON&&readCredentials===credentials){if(!inflight)inflight=ga4AccessToken().finally(()=>{inflight=null;});return inflight;}
  if(cached?.expires>Date.now()+60000)return cached.value;if(inflight)return inflight;
  inflight=(async()=>{const c=readCredentials(),iat=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');let assertion;
   try{const text=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:c.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600});const key=createPrivateKey(c.private_key);if(key.asymmetricKeyType!=='rsa')throw Error();assertion=text+'.'+sign('RSA-SHA256',Buffer.from(text),key).toString('base64url');}catch{throw fail('Khóa tài khoản dịch vụ GA4 không hợp lệ.',503);}
   let r,d;try{r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(20000),redirect:'error'});d=await r.json();}catch{throw fail('Không kết nối được dịch vụ xác thực Google.');}
   if(!r.ok||typeof d.access_token!=='string'||!Number.isFinite(d.expires_in)||d.expires_in<=60)throw fail('Google chưa cấp token GA4. Kiểm tra tài khoản dịch vụ.');
   cached={value:d.access_token,expires:Date.now()+d.expires_in*1000};return cached.value;
  })();try{return await inflight;}finally{inflight=null;}
 }
 return {async report(site,from,to,daily){
  const body={dateRanges:[{startDate:from,endDate:to}],metrics:GA4_METRICS.map(name=>({name})),dimensions:daily?[{name:'date'}]:[],dimensionFilter:{filter:{fieldName:'streamId',stringFilter:{matchType:'EXACT',value:site.streamId}}},keepEmptyRows:true,limit:'1000'};
  let r,d;try{r=await fetcher(`https://analyticsdata.googleapis.com/v1beta/properties/${site.propertyId}:runReport`,{method:'POST',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000),redirect:'error'});d=await r.json();}catch(e){if(e.status)throw e;throw fail('Không kết nối được Google Analytics Data API.');}
  if(r.status===401){cached=null;throw fail('Google từ chối token GA4. Kết nối lại Google Analytics hoặc kiểm tra tài khoản dịch vụ.');}
  if(r.status===403)throw fail('GA4 từ chối quyền đọc. Bật Analytics Data API và cấp quyền Viewer của thuộc tính cho tài khoản dịch vụ.',403);
  if(r.status===429)throw fail('GA4 đã vượt hạn mức API. Thử lại sau.',429);
  if(!r.ok||d?.error)throw fail('Google Analytics chưa trả báo cáo hợp lệ.');return d;
 }};
}
export function normalizeGa4(raw,from,to,daily=false){
 const rowCount=raw?.rowCount??0;
 if(!raw||!Array.isArray(raw.metricHeaders)||GA4_METRICS.some((name,i)=>raw.metricHeaders[i]?.name!==name)||raw.metricHeaders.length!==GA4_METRICS.length||!Number.isSafeInteger(rowCount)||rowCount<0||rowCount!==(raw.rows||[]).length||(daily?raw.dimensionHeaders?.[0]?.name!=='date'||raw.dimensionHeaders.length!==1:(raw.dimensionHeaders||[]).length!==0))throw fail('GA4 trả cấu trúc báo cáo chưa hỗ trợ.');
 const seen=new Set(),rows=(raw.rows||[]).map(row=>{if(row.metricValues?.length!==GA4_METRICS.length)throw fail('GA4 thiếu chỉ số.');const values=Object.fromEntries(GA4_METRICS.map((key,i)=>{const v=row.metricValues[i]?.value;if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v))||Number(v)<0||(key!=='userEngagementDuration'&&!Number.isSafeInteger(Number(v))))throw fail('GA4 trả số liệu không hợp lệ.');return [key,Number(v)];}));
  if(!daily)return values;const value=row.dimensionValues?.[0]?.value;if(!/^\d{8}$/.test(value||''))throw fail('GA4 trả ngày không hợp lệ.');const date=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6);if(new Date(date).toISOString().slice(0,10)!==date||date<from||date>to||seen.has(date))throw fail('GA4 trả ngày trùng hoặc ngoài kỳ.');seen.add(date);return {date,...values};});
 if(!daily&&rows.length>1)throw fail('GA4 trả nhiều dòng tổng không hợp lệ.');return {rows,timeZone:raw.metadata?.timeZone||null,subjectToThresholding:raw.metadata?.subjectToThresholding===true,dataLossFromOtherRow:raw.metadata?.dataLossFromOtherRow===true};
}
const keyFor=(site,from,to)=>'marketing:report:'+createHash('sha256').update(JSON.stringify(['ga4:v1',site.propertyId,site.streamId,from,to])).digest('hex');
const client=createGa4Client();
export async function readGa4(siteKey,from,to,refresh=false,{client:provider=client,get=getValue,save=p=>rpc('review_tracker_marketing_set',p)}={}){
 performanceRange(from,to);const site=GA4_SITES.find(s=>s.key===siteKey);if(!site)throw fail('Website chưa được cấu hình.',400);const key=keyFor(site,from,to);
 if(!refresh)return {site,report:await get(key)||null};
 const [summary,series]=await Promise.all([provider.report(site,from,to,false),provider.report(site,from,to,true)]);const total=normalizeGa4(summary,from,to),daily=normalizeGa4(series,from,to,true);if(total.timeZone!==daily.timeZone)throw fail('Hai báo cáo GA4 có múi giờ khác nhau.');
 const report={from,to,siteKey,propertyId:site.propertyId,streamId:site.streamId,totals:total.rows[0]||null,days:daily.rows,timeZone:total.timeZone,subjectToThresholding:total.subjectToThresholding||daily.subjectToThresholding,dataLossFromOtherRow:total.dataLossFromOtherRow||daily.dataLossFromOtherRow,capturedAt:new Date().toISOString(),source:'google_analytics_data_api'};
 await save({p_key:key,p_value:report});return {site,report};
}
export async function syncGa4(from,to){performanceRange(from,to);if(!(await ga4Status()).connected)throw fail('Chưa kết nối Google Analytics. Kết nối tài khoản có quyền GA4 trước.',409);const release=await lock('ga4:sync',280);if(!release)return {skipped:true};try{const settled=await Promise.allSettled(GA4_SITES.map(s=>readGa4(s.key,from,to,true)));const results=settled.map((r,i)=>({key:GA4_SITES[i].key,name:GA4_SITES[i].name,ok:r.status==='fulfilled',...(r.status==='rejected'?{error:r.reason?.status?r.reason.message:'Chưa lưu được GA4. Kiểm tra Supabase.'}:{})}));return {from,to,ok:results.every(r=>r.ok),results};}finally{await release();}}
