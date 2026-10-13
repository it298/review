import {categories,platforms} from './directory.js';
import {reportFontData} from './report-export.js';
const num=v=>v==null?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2});
const signed=v=>v==null?'—':(v>0?'+':'')+num(v);
const day=v=>v?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';
const stamp=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export function prepareTrendReport({source,category,metric,view,start,end,series,rows}){
 const selected=series.map(s=>{const counts=rows.filter(r=>r[s.id+'Count']!=null),ratings=rows.filter(r=>r[s.id+'Rating']!=null);return {...s,firstCount:counts[0]?.[s.id+'Count']??null,firstRating:ratings[0]?.[s.id+'Rating']??null,countDays:counts.length,ratingDays:ratings.length};});
 const fields=selected.flatMap(s=>['Count','Rating','CountAt','RatingAt'].map(suffix=>s.id+suffix));
 return {source,sourceName:platforms[source].name,scale:platforms[source].scale,category,categoryName:categories[category]||'Tất cả địa điểm quản lý',metric,view,start,end,generatedAt:new Date().toISOString(),series:selected,rows:rows.map(row=>Object.fromEntries([['day',row.day],...fields.map(key=>[key,row[key]??null])]))};
}
function filename(report,extension){return 'xu-huong-'+report.source+'-'+report.start+'_'+report.end+'.'+extension;}
function download(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function createTrendWorkbook(report){
 const {default:ExcelJS}=await import('exceljs'),book=new ExcelJS.Workbook();book.creator='Vista Journey';book.created=new Date(report.generatedAt);
 const summary=book.addWorksheet('Tổng hợp'),detail=book.addWorksheet('Theo ngày');
 const labels=['Địa điểm','Nhóm','Tổng đầu kỳ','Tổng cuối kỳ','Thay đổi tổng','Điểm đầu kỳ','Điểm cuối kỳ','Thay đổi điểm','Thang điểm','Ghi nhận tổng','Ghi nhận điểm','Ngày có tổng','Ngày có điểm'];
 summary.addRows([['VISTA JOURNEY | XU HƯỚNG ĐÁNH GIÁ'],[report.sourceName+' | '+report.categoryName+' | '+day(report.start)+' - '+day(report.end)],['Chỉ số: '+(report.metric==='count'?'Tổng đánh giá':'Điểm số')+' | '+(report.view==='cards'?'Từng địa điểm':'Các địa điểm đang so sánh')],['Tạo lúc: '+stamp(report.generatedAt)],['Ô trống: chưa có số liệu. Tăng/giảm so mốc đầu và cuối trong kỳ; không cộng giữa các nền tảng.'],[],labels]);
 report.series.forEach(s=>summary.addRow([s.name,categories[s.category],s.firstCount,s.lastCount,s.countChange,s.firstRating,s.lastRating,s.ratingChange,report.scale,stamp(s.countAt),stamp(s.ratingAt),s.countDays,s.ratingDays]));
 [34,20,18,18,18,18,18,18,14,29,29,17,17].forEach((width,i)=>summary.getColumn(i+1).width=width);
 for(let i=1;i<=5;i++)summary.mergeCells(i,1,i,labels.length);summary.getRow(5).height=32;
 summary.views=[{state:'frozen',ySplit:7,xSplit:2}];summary.autoFilter={from:'A7',to:'M7'};
 const suffixes=report.metric==='count'?['Count','Rating','CountAt','RatingAt']:['Rating','Count','RatingAt','CountAt'],names={Count:'Tổng đánh giá',Rating:'Điểm',CountAt:'Ghi nhận tổng',RatingAt:'Ghi nhận điểm'};
 detail.addRows([['VISTA JOURNEY | LỊCH SỬ THEO NGÀY'],[report.sourceName+' | '+day(report.start)+' - '+day(report.end)],['Mỗi trường dùng lần ghi nhận cuối trong ngày. Ô trống không phải số 0.'],[],['Ngày',...report.series.flatMap(s=>suffixes.map(k=>s.name+' - '+names[k]))]]);
 const total=1+report.series.length*4;for(let i=1;i<=3;i++)detail.mergeCells(i,1,i,total);
 report.rows.forEach(r=>detail.addRow([r.day,...report.series.flatMap(s=>suffixes.map(k=>k.endsWith('At')?r[s.id+k]?stamp(r[s.id+k]):null:r[s.id+k]))]));
 detail.getColumn(1).width=17;for(let i=2;i<=total;i++)detail.getColumn(i).width=suffixes[(i-2)%4].endsWith('At')?29:23;
 detail.views=[{state:'frozen',ySplit:5,xSplit:1}];detail.autoFilter={from:{row:5,column:1},to:{row:5,column:total}};
 for(const [sheet,header] of [[summary,7],[detail,5]]){
  sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:'+header};
  sheet.getRow(1).font={name:'Calibri',size:17,bold:true,color:{argb:'FF624582'}};sheet.getRow(1).height=32;
  for(let i=2;i<header;i++){sheet.getRow(i).font={name:'Calibri',size:11,color:{argb:'FF857193'}};sheet.getRow(i).alignment={wrapText:true,vertical:'middle'};}
  sheet.getRow(header).height=40;sheet.getRow(header).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(header).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF624582'}};sheet.getRow(header).alignment={wrapText:true,vertical:'middle'};
  for(let i=header+1;i<=sheet.rowCount;i++){sheet.getRow(i).height=27;sheet.getRow(i).alignment={vertical:'middle'};if(i%2===0)sheet.getRow(i).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF6F1FA'}};sheet.getRow(i).eachCell(cell=>{if(typeof cell.value==='number')cell.numFmt='0.##';});}
 }
 return book;
}
export async function exportTrendExcel(report){const book=await createTrendWorkbook(report);download(await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',filename(report,'xlsx'));}
// For long print ranges, keep the latest observed field per week/month.
export function printTrendRows(rows,series,metric){
 const first=rows[0]?.day,last=rows.at(-1)?.day,span=first&&last?(Date.parse(last)-Date.parse(first))/86400000:0;
 const interval=span>180?'month':rows.length>35?'week':'day',groups=new Map();
 for(const row of rows){let key=row.day;if(interval==='month')key=row.day.slice(0,7)+'-01';if(interval==='week'){const dow=new Date(row.day+'T00:00:00Z').getUTCDay();key=new Date(Date.parse(row.day+'T00:00:00Z')-((dow+6)%7)*86400000).toISOString().slice(0,10);}const bucket=groups.get(key)||{day:key};for(const s of series){const field=s.id+(metric==='count'?'Count':'Rating');if(row[field]!=null)bucket[field]=row[field];}groups.set(key,bucket);}
 return {rows:[...groups.values()],interval};
}
export async function createTrendPdf(report,{fontBase64}={}){
 const {jsPDF}=await import('jspdf'),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.addFileToVFS('NotoSans.ttf',fontBase64||await reportFontData());doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');doc.setProperties({title:'Xu hướng đánh giá '+day(report.start)+' - '+day(report.end),author:'Vista Journey'});
 const ink='#5b3c75',muted='#95809f',line='#e8dfed',gold='#b89653';
 function text(value,x,y,size=9,color=ink){doc.setFontSize(size);doc.setTextColor(color);doc.text(String(value),x,y);}
 function header(title){doc.setFillColor(ink);doc.rect(0,0,297,2,'F');text('VISTA JOURNEY | '+title,12,16,17);text(report.sourceName+' | '+report.categoryName+' | '+day(report.start)+' - '+day(report.end)+' | '+report.series.length+' địa điểm',12,25,9,muted);}
 header('XU HƯỚNG ĐÁNH GIÁ');text('Chỉ số đang xem: '+(report.metric==='count'?'Tổng đánh giá':'Điểm số')+' | Tạo lúc '+stamp(report.generatedAt),12,32,8,muted);
 const widths=[54,35,22,35,22,52,53],labels=['Địa điểm','Tổng đầu - cuối','Thay đổi','Điểm đầu - cuối','Thay đổi','Ghi nhận tổng','Ghi nhận điểm'];let y=42;
 function tableHead(){let x=12;doc.setFillColor(ink);doc.rect(12,y,273,11,'F');labels.forEach((label,i)=>{text(label,x+2,y+7,7,'#ffffff');x+=widths[i];});y+=11;}
 tableHead();for(const [index,s] of report.series.entries()){
  const name=doc.splitTextToSize(s.name,49),h=Math.max(18,name.length*4+9);if(y+h>187){doc.addPage();header('TỔNG HỢP (tiếp)');y=36;tableHead();}
  if(index%2===0){doc.setFillColor('#f8f4fb');doc.rect(12,y,273,h,'F');}
  const cells=[name,num(s.firstCount)+' - '+num(s.lastCount),signed(s.countChange),num(s.firstRating)+' - '+num(s.lastRating)+' /'+report.scale,signed(s.ratingChange),doc.splitTextToSize(stamp(s.countAt),47),doc.splitTextToSize(stamp(s.ratingAt),48)];let x=12;
  cells.forEach((value,i)=>{text(Array.isArray(value)?value.join('\n'):value,x+2,y+6,i===0?8:7);x+=widths[i];});text(categories[s.category]||'',14,y+h-3,6.5,muted);doc.setDrawColor(line);doc.line(12,y+h,285,y+h);y+=h;
 }
 function chart(x,top,w,h,items){
  const print=printTrendRows(report.rows,items,report.metric),data=print.rows,isCount=report.metric==='count',suffix=isCount?'Count':'Rating',values=data.flatMap(r=>items.map(s=>r[s.id+suffix])).filter(v=>v!=null);
  const max=isCount?Math.max(1,...values):report.scale,pow=10**Math.floor(Math.log10(max)),ceiling=isCount?Math.ceil(max/pow)*pow:max;
  const left=x+15,right=x+w-4,bottom=top+h-11,height=h-17;
  [0,.5,1].forEach(t=>{const yy=bottom-t*height;doc.setDrawColor(line);doc.setLineWidth(.15);doc.line(left,yy,right,yy);text(num(ceiling*t),x+1,yy+1,6,muted);});
  const step=(right-left)/Math.max(1,data.length),bar=Math.min(items.length===1?3.7:4,step*.78/items.length);
  data.forEach((r,i)=>items.forEach((s,j)=>{const value=r[s.id+suffix];if(value==null)return;const bh=Math.max(0,value/ceiling*height);doc.setFillColor(s.color);doc.rect(left+i*step+(step-items.length*bar)/2+j*bar,bottom-bh,Math.max(.15,bar-.2),bh,'F');}));
  const ticks=[...new Set([0,Math.floor((data.length-1)/2),data.length-1])].filter(i=>i>=0&&data[i]);ticks.forEach(i=>text(data[i].day.slice(8)+'/'+data[i].day.slice(5,7),left+i*step,bottom+4.5,6,muted));
  return print.interval;
 }
 const unit=report.metric==='count'?'Tổng đánh giá':'Điểm /'+report.scale;
 if(report.view==='compare'){
  doc.addPage();header('BIỂU ĐỒ CỘT SO SÁNH');text(unit,12,34,10,ink);const interval=chart(12,42,273,120,report.series);
  report.series.forEach((s,i)=>{doc.setFillColor(s.color);doc.circle(15+i*67,169,1.5,'F');const lines=doc.splitTextToSize(s.name,59);text(lines.join('\n'),19+i*67,170,7.5,ink);});
  text('Mốc cuối '+({day:'từng ngày',week:'mỗi tuần',month:'mỗi tháng'})[interval]+'. Khoảng trống là chưa có dữ liệu.',12,188,7,muted);
 }else{
  for(let offset=0;offset<report.series.length;offset+=4){doc.addPage();header('BIỂU ĐỒ TỪNG ĐỊA ĐIỂM');
   for(const [i,s] of report.series.slice(offset,offset+4).entries()){
    const x=12+(i%2)*141,top=36+Math.floor(i/2)*78,w=132;doc.setDrawColor(line);doc.roundedRect(x,top,w,72,2,2,'S');text(doc.splitTextToSize(s.name,w-10).join('\n'),x+5,top+7,9,ink);
    const value=report.metric==='count'?s.lastCount:s.lastRating,change=report.metric==='count'?s.countChange:s.ratingChange;text(num(value)+(report.metric==='rating'?' /'+report.scale:''),x+5,top+22,16,ink);text('Trong kỳ: '+signed(change),x+73,top+21,8,change<0?'#b65b64':'#558d74');
    const interval=chart(x+3,top+26,w-7,36,[s]);text(unit+' | '+({day:'Theo ngày',week:'Mốc cuối tuần',month:'Mốc cuối tháng'})[interval],x+5,top+68,6.5,muted);
   }
  }
 }
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(gold);doc.line(12,196,285,196);text('Vista Journey | Mốc cuối trong kỳ; ngày thiếu không điền 0. Excel giữ đủ số liệu ngày.',12,202,6.5,muted);text(i+' / '+pages,274,202,7,muted);}
 return doc;
}
export async function exportTrendPdf(report){const doc=await createTrendPdf(report);doc.save(filename(report,'pdf'));}
