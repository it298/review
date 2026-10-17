import * as XLSX from '@e965/xlsx';
import {readFinanceExcel,EXCEL_FILE_LIMIT} from '../../../../shared/finance-excel-import.js';
import {analyzeWorkbook} from '../../../../shared/excel-dashboard.js';
import {checkExcelArchive} from './archive.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function parseSheetLink(input){
 let url;try{if(typeof input!=='string'||input.length>2048)throw Error();url=new URL(input.trim());}catch{throw fail('Dán link Google Sheets hợp lệ.');}
 const match=url.pathname.match(/^\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,200})(?:\/(?:edit|view|export|copy|preview|htmlview))?\/?$/);
 if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.port||url.username||url.password||!match)throw fail('Chỉ dùng link https://docs.google.com/spreadsheets/d/… của bảng tính.');
 const resourceKey=url.searchParams.get('resourcekey');if(resourceKey&&!/^[a-zA-Z0-9_-]{1,200}$/.test(resourceKey))throw fail('Resource key trong link chưa hợp lệ.');
 const canonical=new URL('https://docs.google.com/spreadsheets/d/'+match[1]+'/edit');if(resourceKey)canonical.searchParams.set('resourcekey',resourceKey);return {spreadsheetId:match[1],url:canonical.href,resourceKey:resourceKey||null};
}
export async function fetchSheetReport(source,month){
 const parsed=parseSheetLink(source.url),target=new URL('https://docs.google.com/spreadsheets/d/'+parsed.spreadsheetId+'/export');target.searchParams.set('format','xlsx');if(parsed.resourceKey)target.searchParams.set('resourcekey',parsed.resourceKey);
 const signal=AbortSignal.timeout(40000);let url=target;
 try{
  for(let redirects=0;redirects<=4;redirects++){
   // Construct the initial URL ourselves and permit only Google's document export redirects.
   if(url.protocol!=='https:'||url.port||url.username||url.password||!(url.hostname==='docs.google.com'||/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googleusercontent\.com$/.test(url.hostname)))throw fail('Google Sheets yêu cầu đăng nhập hoặc chuyển hướng không hỗ trợ. Kiểm tra quyền xem/tải qua link.');
   const response=await fetch(url,{redirect:'manual',signal,headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Cache-Control':'no-cache'},cache:'no-store'});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location||redirects===4)throw fail('Google Sheets chuyển hướng quá nhiều lần.');url=new URL(location,url);continue;}
   if(!response.ok){await response.body?.cancel();throw fail(response.status===429?'Google đang giới hạn lượt tải; thử cập nhật lại sau.':'Chưa tải được Google Sheets. Kiểm tra “Bất kỳ ai có đường liên kết” và quyền tải xuống.',response.status===429?429:400);}
   if(/text\/html|application\/json/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw fail('Link trả về trang đăng nhập/thông báo thay vì bảng tính. Kiểm tra quyền xem và tải xuống.');}
   if(Number(response.headers.get('content-length'))>EXCEL_FILE_LIMIT){await response.body?.cancel();throw fail('Bảng tính vượt 10 MB khi tải; chia nhỏ nguồn.');}
   const chunks=[];let length=0;if(!response.body)throw fail('Google chưa trả nội dung bảng tính.');for await(const chunk of response.body){length+=chunk.length;if(length>EXCEL_FILE_LIMIT)throw fail('Bảng tính vượt 10 MB khi tải; chia nhỏ nguồn.');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
   try{checkExcelArchive(bytes);const fileName='Google Sheets '+parsed.spreadsheetId.slice(0,12)+' '+month+'.xlsx',book=await readFinanceExcel({name:fileName,size:bytes.length,arrayBuffer:async()=>bytes},XLSX),report=analyzeWorkbook(book,month);
    return {bytes,report:{...report,sourceType:'google_sheets',sourceUrl:parsed.url,fetchedAt:new Date().toISOString()}};
   }catch(e){throw fail(e.message);}
  }
 }catch(e){if(e.status)throw e;throw fail('Không đọc được Google Sheets lúc này. Bản báo cáo đã lưu được giữ nguyên.',503);}
}
