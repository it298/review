import {fail} from './dates.js';
export const METRICS={page_post_engagements:'post_engagements',page_media_view:'media_views',page_total_media_view_unique:'unique_viewers'};
// Never propagate Meta messages, request URLs, paging URLs or tokens to callers/logs.
function metaError(code){
 if(Number(code)===190)return fail('Phiên Meta đã hết hạn hoặc token không hợp lệ. Cập nhật META_USER_ACCESS_TOKEN.',502);
 if([10,200,294].includes(Number(code)))return fail('Meta từ chối quyền truy cập Page. Kiểm tra quyền và nhiệm vụ trên Page.',502);
 if(Number(code)===100)return fail('Meta không tìm thấy Page, trường hoặc chỉ số được yêu cầu. Kiểm tra quyền Page và phiên bản API.',502);
 return fail('Meta API chưa trả dữ liệu hợp lệ. Vui lòng thử lại sau.',502);
}
export function createMetaService({fetcher=fetch,token=process.env.META_USER_ACCESS_TOKEN,version=process.env.META_API_VERSION||'v26.0'}={}){
 const deadline=Date.now()+240000;
 async function request(path,params,pageToken){
  if(!/^v\d+\.\d+$/.test(version))throw fail('META_API_VERSION không hợp lệ.',503);
  if(!pageToken)throw fail('Chưa cấu hình META_USER_ACCESS_TOKEN.',503);
  const remaining=deadline-Date.now();if(remaining<=0)throw fail('Đợt đồng bộ Meta vượt thời gian cho phép. Chọn kỳ ngắn hơn và thử lại.',502);
  const url=new URL(`https://graph.facebook.com/${version}/${path}`);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  let response,data;try{
   response=await fetcher(url,{headers:{Authorization:'Bearer '+pageToken},redirect:'error',signal:AbortSignal.timeout(Math.min(20000,remaining))});
   data=await response.json();
  }catch{throw metaError();}
  if(!response.ok||data?.error)throw metaError(data?.error?.code);
  if(!data||typeof data!=='object')throw metaError();
  return data;
 }
 async function collect(path,params,pageToken){
  const rows=[],seen=new Set();let after;
  for(let i=0;i<100;i++){
   const data=await request(path,{...params,...(after?{after}:{})},pageToken);
   if(!Array.isArray(data.data))throw metaError();rows.push(...data.data);
   if(!data.paging?.next)return rows;
   after=data.paging?.cursors?.after;
   if(typeof after!=='string'||after.length>4096||seen.has(after))throw metaError();seen.add(after);
  }throw fail('Meta trả quá nhiều trang dữ liệu; chọn khoảng ngày ngắn hơn.',502);
 }
 return {
  async getManagedPages(){
   const pages=await collect('me/accounts',{fields:'id,name,access_token',limit:'100'},token);
   return new Map(pages.filter(p=>typeof p.id==='string'&&typeof p.access_token==='string'&&p.access_token).map(p=>[p.id,p.access_token]));
  },
  getPageAccessToken(pageId,pages){const value=pages.get(pageId);if(!value)throw fail('Không lấy được Page Access Token. Kiểm tra Page đã được cấp quyền cho tài khoản Meta.',502);return value;},
  getPageSummary(pageId,pageToken){return request(pageId,{fields:'id,name,fan_count,followers_count'},pageToken);},
  getPageInsights(pageId,pageToken,since,until){return collect(pageId+'/insights',{metric:Object.keys(METRICS).join(','),period:'day',since,until,limit:'100'},pageToken);}
 };
}
