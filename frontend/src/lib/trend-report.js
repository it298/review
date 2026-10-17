import {countComparison,ratingParts,prepareSlices} from './circular-chart.js';
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
 for(const row of rows){let key=row.day;if(interval==='month')key=row.day.slice(0,7)+'-01';if(interval==='week'){const dow=new Date(row.day+'T00:00:00Z').getUTCDay();key=new Date(Date.parse(row.day+'T00:00:00Z')-((dow+6)%7)*86400000).toISOString().slice(0,10);}const bucket=groups.get(key)||{day:key};for(const s of series){for(const suffix of ['Count','Rating']){const field=s.id+suffix;if(row[field]!=null){bucket[field]=row[field];bucket[field+'Day']=row.day;bucket[field+'At']=row[field+'At']??null;}}}groups.set(key,bucket);}
 return {rows:[...groups.values()],interval};
}
export function trendPrintDetails(rows,series,metric){
 const print=printTrendRows(rows,series,metric),previous={};
 return {...print,rows:print.rows.map(row=>{const result={...row};for(const s of series)for(const suffix of ['Count','Rating']){const field=s.id+suffix,value=row[field];result[field+'Change']=value==null||previous[field]==null?null:Math.round((value-previous[field])*100)/100;if(value!=null)previous[field]=value;}return result;})};
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
 function centered(value,x,y,size=7,color=ink){doc.setFontSize(size);doc.setTextColor(color);doc.text(String(value),x,y,{align:'center'});}
 function chart(x,top,w,h,items,data,metric){
  const suffix=metric==='count'?'Count':'Rating';
  if(items.length>1&&metric==='rating'){const columns=2,rows=Math.ceil(items.length/columns);items.forEach((item,i)=>{const cx=x+(i%columns)*w/columns,cy=top+Math.floor(i/columns)*h/rows;text(doc.splitTextToSize(item.name,w/columns-8).join('\n'),cx+4,cy+3,7);chart(cx,cy+8,w/columns,h/rows-8,[item],data,metric);});return;}
  const selected=data.filter(r=>items.some(item=>r[item.id+suffix]!=null));
  const values=item=>selected.filter(r=>r[item.id+suffix]!=null).map(r=>r[item.id+suffix]);
  const parts=items.length>1?items.map(item=>({label:item.name,value:values(item).at(-1)??null,color:item.color})):metric==='rating'?ratingParts(values(items[0]).at(-1),report.scale):countComparison(values(items[0]).length>1?values(items[0])[0]:null,values(items[0]).at(-1));
  if(items.length===1&&parts.length&&items[0].color)parts[0].color=items[0].color;
  const {sectors,total}=prepareSlices(parts,4),cx=x+w/2,cy=top+h/2,r=Math.min(h*.31,w*.18),inner=r*.53;
  if(!total){centered('Chưa có số khác 0 để chia tỷ trọng',cx,cy,7,muted);return;}
  sectors.forEach(part=>{const steps=Math.max(4,Math.ceil((part.end-part.start)*25)),points=[];for(let i=0;i<=steps;i++){const angle=part.start+(part.end-part.start)*i/steps;points.push([cx+Math.cos(angle)*r,cy+Math.sin(angle)*r]);}const vertices=[[cx,cy],...points,[cx,cy]],lines=vertices.slice(1).map((p,i)=>[p[0]-vertices[i][0],p[1]-vertices[i][1]]);doc.setFillColor(part.color);doc.lines(lines,cx,cy,[1,1],'F',true);});
  doc.setFillColor('#ffffff');doc.circle(cx,cy,inner,'F');const latest=items.length===1?values(items[0]).at(-1):parts.reduce((n,p)=>n+(p.value??0),0);centered(num(latest),cx,cy,Math.min(10,inner*3/Math.max(1,String(num(latest)).length)));centered(metric==='rating'?'/ '+report.scale:'Tổng gần nhất',cx,cy+4,5.5,muted);
  const labels=sectors.map(part=>({...part,right:Math.cos(part.mid)>=0,y:cy+Math.sin(part.mid)*(r+4)}));for(const right of [false,true]){const side=labels.filter(l=>l.right===right).sort((a,b)=>a.y-b.y);side.forEach((l,i)=>{l.y=Math.max(top+7,l.y,i?side[i-1].y+13:top+7);});if(side.length&&side.at(-1).y>top+h-8){const shift=side.at(-1).y-(top+h-8);side.forEach(l=>l.y-=shift);}}
  labels.forEach(part=>{const sx=cx+Math.cos(part.mid)*(r+1),sy=cy+Math.sin(part.mid)*(r+1),end=part.right?cx+r+5:cx-r-5,tx=part.right?end+2:end-2;doc.setDrawColor(part.color);doc.setLineWidth(.3);doc.line(sx,sy,end,part.y);doc.line(end,part.y,end+(part.right?-1.5:1.5),part.y-1);doc.line(end,part.y,end+(part.right?-1.5:1.5),part.y+1);doc.setFontSize(6.5);doc.setTextColor(ink);const opts={align:part.right?'left':'right'};doc.text(doc.splitTextToSize(part.label,Math.max(18,w/2-r-10)).slice(0,2),tx,part.y-3,opts);doc.text(num(part.value)+' | '+num(Math.round(part.percent*10)/10)+'%',tx,part.y+4,opts);});
 }

 const unit=report.metric==='count'?'Tổng đánh giá':'Điểm /'+report.scale;
 const print=trendPrintDetails(report.rows,report.series,report.metric),intervalLabel={day:'Ngày',week:'Tuần bắt đầu',month:'Tháng'}[print.interval];
 if(report.view==='compare'){
  for(let offset=0;offset<print.rows.length;offset+=6){const slice=print.rows.slice(offset,offset+6);doc.addPage();header('BIỂU ĐỒ TRÒN SO SÁNH');text(unit+' | '+intervalLabel+' | '+day(slice[0].day)+' - '+day(slice.at(-1).day),12,34,10,ink);chart(12,42,273,120,report.series,slice,report.metric);
   report.series.forEach((s,i)=>{doc.setFillColor(s.color);doc.circle(15+i*67,169,1.5,'F');doc.setFontSize(7.5);text(doc.splitTextToSize(s.name,59).join('\n'),19+i*67,170,7.5,ink);});
   text('Tổng: tỷ trọng mốc cuối từng địa điểm trong nhóm ngày. Điểm: vòng tròn trên thang gốc. Chi tiết ở các trang sau.',12,188,7,muted);
  }
 }
 for(const s of report.series){for(let offset=0;offset<print.rows.length;offset+=6){const slice=print.rows.slice(offset,offset+6);doc.addPage();header('CHI TIẾT XU HƯỚNG');text(s.name+' | '+intervalLabel+': '+day(slice[0].day)+' - '+day(slice.at(-1).day),12,34,10,ink);
  const stats=[['Tổng cuối kỳ',num(s.lastCount)+' đánh giá','Đầu kỳ: '+num(s.firstCount),'Ghi nhận: '+stamp(s.countAt)],['Điểm cuối kỳ',num(s.lastRating)+' / '+report.scale,'Đầu kỳ: '+num(s.firstRating),'Ghi nhận: '+stamp(s.ratingAt)],['Thay đổi tổng',signed(s.countChange)+' đánh giá',s.firstCount>0&&s.countChange!=null?'Tỷ lệ: '+signed(Math.round(s.countChange/s.firstCount*10000)/100)+'%':'Chưa đủ mốc tính tỷ lệ','So mốc đầu và cuối trong kỳ'],['Thay đổi điểm',signed(s.ratingChange)+' điểm','Thang điểm: '+report.scale,'So mốc đầu và cuối trong kỳ']];
  stats.forEach((stat,i)=>{const x=12+i*69;doc.setFillColor('#f8f4fb');doc.roundedRect(x,40,66,36,2,2,'F');text(stat[0],x+3,46,8,muted);text(stat[1],x+3,55,13);text(stat[2],x+3,64,7);text(stat[3],x+3,71,6.3,muted);});
  text('TỔNG: SO MỐC ĐẦU–CUỐI NHÓM NGÀY',12,83,8);text('ĐIỂM GẦN NHẤT (/'+report.scale+')',153,83,9);chart(12,85,132,57,[s],slice,'count');chart(153,85,132,57,[s],slice,'rating');
  const cols=[42,41,33,29,33,47,48],heads=[intervalLabel,'Tổng đánh giá','Tăng/giảm tổng','Điểm /'+report.scale,'Tăng/giảm điểm','Ngày ghi nhận tổng','Ngày ghi nhận điểm'];let ty=146,x=12;doc.setFillColor(ink);doc.rect(x,ty,273,8,'F');heads.forEach((label,i)=>{text(label,x+2,ty+5.3,6.5,'#ffffff');x+=cols[i];});ty+=8;
  slice.forEach((r,i)=>{if(i%2===0){doc.setFillColor('#f8f4fb');doc.rect(12,ty,273,6,'F');}const cells=[day(r.day),num(r[s.id+'Count']),signed(r[s.id+'CountChange']),num(r[s.id+'Rating']),signed(r[s.id+'RatingChange']),day(r[s.id+'CountDay']),day(r[s.id+'RatingDay'])];let cx=12;cells.forEach((v,j)=>{text(v,cx+2,ty+4,7);cx+=cols[j];});ty+=6;});
  text('Tăng/giảm từng mốc so với mốc có số liệu trước đó. Mốc tuần/tháng giữ lần ghi nhận cuối của từng chỉ số.',12,193,6,muted);
 }}
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(gold);doc.line(12,196,285,196);text('Vista Journey | Mốc cuối trong kỳ; ngày thiếu không điền 0. Excel giữ đủ số liệu ngày.',12,202,6.5,muted);text(i+' / '+pages,274,202,7,muted);}
 return doc;
}
export async function exportTrendPdf(report){const doc=await createTrendPdf(report);download(doc.output('arraybuffer'),'application/pdf',filename(report,'pdf'));}
