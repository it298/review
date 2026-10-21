import express from 'express';
import {createHash} from 'node:crypto';
import {getValue,rpc,lock} from '../../store.js';
import {fail,readRange} from './dates.js';
export const ADS_ACCOUNT_ID='337065855108233';
const token=()=>process.env.META_ADS_ACCESS_TOKEN||process.env.META_USER_ACCESS_TOKEN;
export function adsConfig(){return {accountId:ADS_ACCOUNT_ID,configured:!!token(),version:process.env.META_GRAPH_VERSION||process.env.META_API_VERSION||'v26.0'};}
const value=v=>!['string','number'].includes(typeof v)||typeof v==='string'&&!v.trim()||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const action=(list,type)=>value(list?.find(r=>r.action_type===type)?.value);
export function adsMetrics(row){return {spend:value(row.spend),reach:value(row.reach),impressions:value(row.impressions),frequency:value(row.frequency),clicks:value(row.clicks),ctr:value(row.ctr),cpc:value(row.cpc),cpm:value(row.cpm),thruplays:action(row.video_thruplay_watched_actions,'video_view'),costPerThruplay:action(row.cost_per_thruplay,'video_view'),conversations:action(row.actions,'onsite_conversion.messaging_conversation_started_7d'),costPerConversation:action(row.cost_per_action_type,'onsite_conversion.messaging_conversation_started_7d'),engagements:action(row.actions,'post_engagement')};}
function adsError(code){
 if(Number(code)===190)return fail('Token Meta Ads hết hạn hoặc không hợp lệ. Cập nhật META_ADS_ACCESS_TOKEN trên backend.',502);
 if([10,200,294].includes(Number(code)))return fail('Meta Ads từ chối truy cập. Token cần ads_read và tài khoản phải có quyền xem tài khoản quảng cáo 337065855108233.',502);
 if(Number(code)===100)return fail('Meta Ads không tìm thấy tài khoản, trường hoặc chỉ số. Kiểm tra quyền tài khoản và phiên bản API.',502);
 if([4,17,32,613].includes(Number(code)))return fail('Meta Ads đang giới hạn số lượt gọi. Thử lại sau.',502);
 return fail('Meta Ads chưa trả dữ liệu hợp lệ. Báo cáo cũ được giữ lại.',502);
}
export function createAdsClient({fetcher=fetch,accessToken=token(),version=adsConfig().version}={}){
 const deadline=Date.now()+180000;
 async function request(path,params={}){
  if(!accessToken)throw fail('Chưa có META_ADS_ACCESS_TOKEN hoặc META_USER_ACCESS_TOKEN trên backend.',503);
  if(!/^v\d+\.\d+$/.test(version))throw fail('Phiên bản Meta Graph chưa hợp lệ.',503);
  const remaining=deadline-Date.now();if(remaining<=0)throw fail('Meta Ads vượt thời gian đồng bộ. Chọn kỳ ngắn hơn.',502);
  const url=new URL(`https://graph.facebook.com/${version}/${path}`);for(const [key,v] of Object.entries(params))url.searchParams.set(key,v);
  let response,data;try{response=await fetcher(url,{headers:{Authorization:'Bearer '+accessToken},redirect:'error',signal:AbortSignal.timeout(Math.min(20000,remaining))});data=await response.json();}catch{throw adsError();}
  if(!response.ok||data?.error)throw adsError(data?.error?.code);if(!data||typeof data!=='object')throw adsError();return data;
 }
 async function collect(path,params){const rows=[],seen=new Set();let after;for(let page=0;page<100;page++){const data=await request(path,{...params,limit:'100',...(after?{after}:{})});if(!Array.isArray(data.data))throw adsError();rows.push(...data.data);if(!data.paging?.next)return rows;after=data.paging?.cursors?.after;if(typeof after!=='string'||after.length>4096||seen.has(after))throw adsError();seen.add(after);}throw fail('Meta Ads có quá nhiều dòng. Chọn khoảng ngày ngắn hơn.',502);}
 const fields='account_id,account_currency,date_start,date_stop,spend,reach,impressions,frequency,clicks,ctr,cpc,cpm,actions,cost_per_action_type,video_thruplay_watched_actions,cost_per_thruplay';
 return {
  account:()=>request('act_'+ADS_ACCOUNT_ID,{fields:'account_id,name,currency,timezone_name'}),
  insights:(from,to,level)=>collect('act_'+ADS_ACCOUNT_ID+'/insights',{fields:fields+(level==='campaign'?',campaign_id,campaign_name,objective':''),level,time_range:JSON.stringify({since:from,until:to}),time_increment:'all_days',use_account_attribution_setting:'true',action_report_time:'impression'}),
  campaigns:()=>collect('act_'+ADS_ACCOUNT_ID+'/campaigns',{fields:'id,name,effective_status,objective,daily_budget,lifetime_budget'})
 };
}
export async function adsReport(from,to,refresh=false,{client,get=getValue,save=p=>rpc('review_tracker_marketing_set',p),acquire=lock,config=adsConfig()}={}){
 ({from,to}=readRange(from,to));if((Date.parse(to)-Date.parse(from))/86400000>92)throw fail('Meta Ads: chọn tối đa 93 ngày mỗi lần.');
 const key='marketing:report:'+createHash('sha256').update(JSON.stringify(['meta-ads:v1',ADS_ACCOUNT_ID,from,to,config.version,'account-attribution:impression'])).digest('hex');
 if(!refresh)return {report:await get(key)||null};
 if(!config.configured)throw fail('Chưa cấu hình token đọc quảng cáo trên backend.',503);
 const release=await acquire('meta-ads:sync',240);if(!release)throw fail('Meta Ads đang cập nhật. Thử lại sau.',409);
 try{
  client??=createAdsClient();const account=await client.account();if(String(account.account_id)!==ADS_ACCOUNT_ID||!/^[A-Z]{3}$/.test(account.currency||'')||!account.timezone_name)throw fail('Meta Ads trả sai tài khoản hoặc thiếu tiền tệ/múi giờ.',502);
  const [total,campaignRows,metadata]=await Promise.all([client.insights(from,to,'account'),client.insights(from,to,'campaign'),client.campaigns()]);
  if(!Array.isArray(total)||total.length>1||!Array.isArray(campaignRows)||!Array.isArray(metadata))throw adsError();
  const validate=row=>{if(String(row.account_id)!==ADS_ACCOUNT_ID||row.account_currency!==account.currency||row.date_start!==from||row.date_stop!==to)throw fail('Meta Ads trả báo cáo khác tài khoản, kỳ hoặc tiền tệ yêu cầu.',502);};
  total.forEach(validate);campaignRows.forEach(validate);
  const meta=new Map(metadata.map(r=>[r.id,r])),seen=new Set();
  const campaigns=campaignRows.map(r=>{if(typeof r.campaign_id!=='string'||!/^\d+$/.test(r.campaign_id)||seen.has(r.campaign_id))throw adsError();seen.add(r.campaign_id);const m=meta.get(r.campaign_id);return {id:r.campaign_id,name:r.campaign_name||r.campaign_id,objective:r.objective||m?.objective||null,status:m?.effective_status||null,dailyBudgetMinor:value(m?.daily_budget),lifetimeBudgetMinor:value(m?.lifetime_budget),...adsMetrics(r)};});
  if(!total.length&&campaigns.length)throw adsError();
  const report={source:'meta_marketing_api',accountId:ADS_ACCOUNT_ID,accountName:String(account.name||ADS_ACCOUNT_ID),currency:account.currency,timeZone:account.timezone_name,from,to,attribution:'Theo tài khoản quảng cáo; action_report_time=impression',capturedAt:new Date().toISOString(),summary:total.length?adsMetrics(total[0]):null,campaigns};
  await save({p_key:key,p_value:report});return {report};
 }finally{await release();}
}
export function createAdsRouter(){const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/status',(_req,res)=>res.json(adsConfig()));
 router.get('/report',wrap(async(req,res)=>res.json(await adsReport(req.query.from,req.query.to))));
 router.post('/sync',wrap(async(req,res)=>{if(!['admin','manager'].includes(req.user?.role))throw fail('Chỉ quản lý hoặc quản trị viên được cập nhật Meta Ads.',403);res.json(await adsReport(req.body?.from,req.body?.to,true));}));return router;
}
