import express from 'express';
import {createHash} from 'node:crypto';
import {createMetaService} from './meta-service.js';
import {readRange,shiftDate,fail} from './dates.js';
import {getValue,rpc,lock} from '../../store.js';
import {calendarDate} from '../../utils/date.js';
export const INSTAGRAM_METRICS={views:'Lượt xem',reach:'Tài khoản tiếp cận',total_interactions:'Lượt tương tác'};
export function instagramConfig(){
 const pageId=process.env.META_PAGE_ID||'',id=process.env.INSTAGRAM_USER_ID||'';
 return {pageId,id,name:'Sontra Sea Hotel',configured:pageId==='115021051629190'&&id==='17841460619682729'&&!!process.env.META_PAGE_ACCESS_TOKEN};
}
export function instagramRange(from,to){const range=readRange(from,to),today=calendarDate(new Date());if(range.to>=today||range.from<shiftDate(today,-89)||Date.parse(range.to)-Date.parse(range.from)>29*86400000)throw fail('Instagram: chọn tối đa 30 ngày đã hoàn tất trong 89 ngày gần nhất.');return range;}
export function instagramValue(raw,metric){const rows=raw?.data;if(!Array.isArray(rows))throw fail('Instagram trả cấu trúc chỉ số không hợp lệ.',502);const row=rows.find(v=>v.name===metric);if(!row)return null;const value=row.total_value?.value;if(!Number.isSafeInteger(value)||value<0)throw fail('Instagram thiếu giá trị tổng hợp hợp lệ.',502);return value;}
const keyFor=(id,from,to)=>'marketing:report:'+createHash('sha256').update(JSON.stringify(['instagram:v1',id,from,to])).digest('hex');
export async function instagramReport(from,to,refresh=false,{config=instagramConfig(),client=createMetaService({version:process.env.META_GRAPH_VERSION||process.env.META_API_VERSION||'v26.0'}),get=getValue,save=p=>rpc('review_tracker_marketing_set',p),acquire=lock}={}){
 ({from,to}=instagramRange(from,to));const key=keyFor(config.id,from,to);
 if(!refresh)return {report:await get(key)||null};
 if(!config.configured)throw fail('Chưa cấu hình đúng Page Token, Page ID và Instagram ID của Sontra trên backend.',503);
 const release=await acquire('instagram:sync',180);if(!release)throw fail('Instagram đang đồng bộ. Thử lại sau.',409);
 try{
 const token=process.env.META_PAGE_ACCESS_TOKEN;
 const link=await client.getInstagramLink(config.pageId,token);if(link.id!==config.pageId||link.instagram_business_account?.id!==config.id)throw fail('Instagram ID không khớp tài khoản được liên kết với Page Sontra.',502);
 const raw=await client.getInstagramSummary(config.id,token);if(raw.id!==config.id)throw fail('Instagram trả sai tài khoản.',502);
 const count=v=>Number.isSafeInteger(v)&&v>=0?v:null;
 const results=await Promise.allSettled(Object.keys(INSTAGRAM_METRICS).map(m=>client.getInstagramInsight(config.id,token,m,String(Date.parse(from+'T00:00:00+07:00')/1000),String(Date.parse(shiftDate(to,1)+'T00:00:00+07:00')/1000)).then(d=>instagramValue(d,m))));
 const metrics=Object.keys(INSTAGRAM_METRICS).map((metric,i)=>({key:metric,label:INSTAGRAM_METRICS[metric],value:results[i].status==='fulfilled'?results[i].value:null,error:results[i].status==='rejected'?'Meta chưa cấp chỉ số này. Kiểm tra instagram_basic và instagram_manage_insights, quyền Page và phiên bản API.':null}));
 const report={source:'meta_instagram_graph_api',name:config.name,instagramId:config.id,pageId:config.pageId,username:typeof raw.username==='string'?raw.username:null,followers:count(raw.followers_count),mediaCount:count(raw.media_count),from,to,timeZone:'Asia/Ho_Chi_Minh',metrics,capturedAt:new Date().toISOString()};
 // An entirely rejected insights request must not overwrite a previously good report.
 if(!metrics.some(m=>m.value!==null))throw fail('Instagram chưa trả chỉ số cho kỳ này. Kiểm tra quyền instagram_basic và instagram_manage_insights trên token; báo cáo cũ được giữ lại.',502);
 await save({p_key:key,p_value:report});return {report};
 }finally{await release();}
}
export async function instagramCron(){if(process.env.INSTAGRAM_AUTO_SYNC!=='true')return {skipped:true,reason:'disabled'};const today=calendarDate(new Date()),results=[];for(const n of [7,30]){try{await instagramReport(shiftDate(today,-n),shiftDate(today,-1),true);results.push({days:n,ok:true});}catch{results.push({days:n,ok:false});}}return {ok:results.every(r=>r.ok),results};}
export function createInstagramRouter(){const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/status',(_req,res)=>res.json(instagramConfig()));
 router.get('/report',wrap(async(req,res)=>res.json(await instagramReport(req.query.from,req.query.to))));
 router.post('/sync',wrap(async(req,res)=>{if(!['admin','manager'].includes(req.user?.role))throw fail('Chỉ quản lý hoặc quản trị viên được đồng bộ Instagram.',403);res.json(await instagramReport(req.body?.from,req.body?.to,true));}));return router;
}
