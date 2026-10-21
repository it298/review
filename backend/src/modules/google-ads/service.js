import {createHash} from 'node:crypto';
import {getValue,rpc,lock} from '../../store.js';
import {readRange,fail} from '../facebook/dates.js';
import {googleAdsAccessToken,googleAdsOAuthStatus} from './oauth.js';
export const GOOGLE_ADS_CUSTOMER='7836280021';
export const ADS_VERSION='v26';
export async function googleAdsStatus(){return {...await googleAdsOAuthStatus(),customerId:GOOGLE_ADS_CUSTOMER,version:ADS_VERSION};}
export function googleAdsError(data,status){
 const codes=(data?.error?.details||[]).flatMap(d=>(d.errors||[]).flatMap(e=>Object.values(e.errorCode||{})));
 if(codes.includes('CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'))return fail('Google Cloud project chưa được phép đọc tài khoản Ads thật. Vào Google Ads API Overview và đăng ký Explorer access.',403);
 if(codes.includes('USER_PERMISSION_DENIED'))return fail('Tài khoản Google chưa có quyền xem Ads 783-628-0021. Kết nối tài khoản được cấp quyền.',403);
 if(codes.includes('SERVICE_DISABLED'))return fail('Chưa bật Google Ads API trong project chứa Google Client ID.',403);
 if(status===401)return fail('Google Ads từ chối phiên đăng nhập. Kết nối Google Ads lại.',409);
 if(status===403)return fail('Google Ads từ chối truy cập. Kiểm tra API đã bật, quyền production của Cloud project và quyền xem tài khoản Ads.',403);
 if(status===429)return fail('Google Ads đang giới hạn API. Thử lại sau.',429);
 return fail('Google Ads chưa trả báo cáo hợp lệ. Kiểm tra quyền API và thử lại.',502);
}
export function createGoogleAdsClient({fetcher=fetch,getToken=googleAdsAccessToken}={}){
 const deadline=Date.now()+180000;
 return {async search(query){
  const token=await getToken(),rows=[],seen=new Set();let pageToken;
  for(let page=0;page<100;page++){
   const remaining=deadline-Date.now();if(remaining<=0)throw fail('Google Ads vượt thời gian cập nhật. Chọn kỳ ngắn hơn.',502);
   const login=process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;if(login&&!/^\d{10}$/.test(login))throw fail('GOOGLE_ADS_LOGIN_CUSTOMER_ID phải gồm 10 số, không có dấu gạch.',503);
   let response,data;try{response=await fetcher(`https://googleads.googleapis.com/${ADS_VERSION}/customers/${GOOGLE_ADS_CUSTOMER}/googleAds:search`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(login?{'login-customer-id':login}:{})},body:JSON.stringify({query,...(pageToken?{pageToken}:{})}),redirect:'error',signal:AbortSignal.timeout(Math.min(25000,remaining))});data=await response.json();}catch{throw fail('Không kết nối được Google Ads API.',502);}
   if(!response.ok||data?.error)throw googleAdsError(data,response.status);
   if(!data||typeof data!=='object'||Array.isArray(data)||data.results!==undefined&&!Array.isArray(data.results)||!data.fieldMask)throw fail('Google Ads trả cấu trúc dữ liệu chưa hỗ trợ.',502);
   rows.push(...(data.results||[]));if(!data.nextPageToken)return rows;
   pageToken=data.nextPageToken;if(typeof pageToken!=='string'||pageToken.length>8192||seen.has(pageToken))throw fail('Google Ads trả phân trang không hợp lệ.',502);seen.add(pageToken);
  }throw fail('Google Ads trả quá nhiều trang. Chọn kỳ ngắn hơn.',502);
 }};
}
const metricFields='metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.interactions, metrics.conversions, metrics.conversions_value, metrics.conversions_from_interactions_rate, metrics.cost_per_conversion, metrics.ctr, metrics.average_cpc';
function num(v,{integer=false,optional=false}={}){if(v==null){if(optional)return null;v=0;}if(!['number','string'].includes(typeof v)||typeof v==='string'&&!/^-?\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v))||integer&&!Number.isSafeInteger(Number(v)))throw fail('Google Ads trả số liệu vượt giới hạn hoặc không hợp lệ.',502);return Number(v);}
export function googleAdsMetrics(row){if(!row.metrics||typeof row.metrics!=='object')throw fail('Google Ads thiếu khối metrics.',502);const m=row.metrics,cost=num(m.costMicros,{integer:true})/1e6,conversions=num(m.conversions);return {cost,impressions:num(m.impressions,{integer:true}),clicks:num(m.clicks,{integer:true}),interactions:num(m.interactions,{integer:true}),conversions,conversionValue:num(m.conversionsValue),conversionRate:num(m.conversionsFromInteractionsRate)*100,costPerConversion:conversions===0?null:num(m.costPerConversion,{optional:true})==null?null:num(m.costPerConversion)/1e6,ctr:num(m.ctr)*100,averageCpc:num(m.averageCpc,{optional:true})==null?null:num(m.averageCpc)/1e6};}
function aggregate(rows){if(!rows.length)return null;const sums=Object.fromEntries(['cost','impressions','clicks','interactions','conversions','conversionValue'].map(k=>[k,rows.reduce((s,r)=>s+r[k],0)]));return {...sums,ctr:sums.impressions?sums.clicks/sums.impressions*100:null,averageCpc:sums.clicks?sums.cost/sums.clicks:null,conversionRate:sums.interactions?sums.conversions/sums.interactions*100:null,costPerConversion:sums.conversions?sums.cost/sums.conversions:null};}
export async function googleAdsReport(from,to,refresh=false,{client,get=getValue,save=p=>rpc('review_tracker_marketing_set',p),acquire=lock}={}){
 ({from,to}=readRange(from,to));if((Date.parse(to)-Date.parse(from))/86400000>92)throw fail('Google Ads: chọn tối đa 93 ngày mỗi lần.');
 const key='marketing:report:'+createHash('sha256').update(JSON.stringify(['google-ads:v1',ADS_VERSION,GOOGLE_ADS_CUSTOMER,from,to,'interaction-date:exclude-removed'])).digest('hex');if(!refresh)return {report:await get(key)||null};
 const release=await acquire('google-ads:sync',240);if(!release)throw fail('Google Ads đang cập nhật. Thử lại sau.',409);
 try{
  client??=createGoogleAdsClient();const date=`segments.date BETWEEN '${from}' AND '${to}'`,campaignQuery=`SELECT customer.id, campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, campaign_budget.explicitly_shared, ${metricFields} FROM campaign WHERE ${date} AND campaign.status != 'REMOVED'`,dailyQuery=`SELECT customer.id, campaign.id, segments.date, ${metricFields} FROM campaign WHERE ${date} AND campaign.status != 'REMOVED'`;
  const [accounts,campaignRows,dailyRows]=await Promise.all([client.search('SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1'),client.search(campaignQuery),client.search(dailyQuery)]);
  const account=accounts[0]?.customer;if(accounts.length!==1||String(account?.id)!==GOOGLE_ADS_CUSTOMER||!/^[A-Z]{3}$/.test(account.currencyCode||'')||!account.timeZone)throw fail('Google Ads trả sai tài khoản hoặc thiếu tiền tệ/múi giờ.',502);
  const validate=r=>{if(String(r.customer?.id)!==GOOGLE_ADS_CUSTOMER)throw fail('Google Ads trả dữ liệu khác tài khoản.',502);};
  const seen=new Set(),campaigns=campaignRows.map(r=>{validate(r);const c=r.campaign;if(!/^\d+$/.test(c?.id||'')||seen.has(c.id))throw fail('Google Ads trả chiến dịch trùng hoặc thiếu mã.',502);seen.add(c.id);return {id:c.id,name:c.name||c.id,status:c.status||null,type:c.advertisingChannelType||null,dailyBudget:num(r.campaignBudget?.amountMicros,{integer:true,optional:true})==null?null:num(r.campaignBudget.amountMicros,{integer:true})/1e6,sharedBudget:r.campaignBudget?.explicitlyShared===true,...googleAdsMetrics(r)};});
  seen.clear();const groups=new Map();for(const r of dailyRows){validate(r);const date=r.segments?.date,id=r.campaign?.id,key=id+':'+date;if(!/^\d+$/.test(id||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||date<from||date>to||seen.has(key))throw fail('Google Ads trả ngày trùng hoặc ngoài kỳ.',502);seen.add(key);if(!groups.has(date))groups.set(date,[]);groups.get(date).push(googleAdsMetrics(r));}const days=[...groups].map(([date,rows])=>({date,...aggregate(rows)})).sort((a,b)=>a.date.localeCompare(b.date));
  // Totals from campaign sums share the same REMOVED filter as the UI table.
  const summary=aggregate(campaigns);
  const report={source:'google_ads_api',customerId:GOOGLE_ADS_CUSTOMER,accountName:account.descriptiveName||GOOGLE_ADS_CUSTOMER,currency:account.currencyCode,timeZone:account.timeZone,from,to,capturedAt:new Date().toISOString(),summary,campaigns,days};await save({p_key:key,p_value:report});return {report};
 }finally{await release();}
}
