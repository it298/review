import {reportFontData} from '../../lib/report-export.js';
import {chartNumber,compactChartNumber,numeric,prepareSlices,layoutCircularLabels} from '../../lib/circular-chart.js';
const ink='#624582',muted='#8a7895',line='#e9e1ef';
const stamp=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
const format=(value,type)=>value==null?'—':type==='money'?chartNumber(value)+' ₫':type==='percent'?chartNumber(value)+'%':type==='number'?chartNumber(value):String(value);
function name(report,ext){return (report.kind==='dashboard'?'dashboard-cong-suat':'dat-phong-'+(report.hotelId||'khach-san'))+'-'+report.from+'_'+report.to+'.'+ext;}
function download(bytes,mime,filename){const url=URL.createObjectURL(new Blob([bytes],{type:mime})),link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}

export async function createBluejayWorkbook(report){
 const {default:ExcelJS}=await import('exceljs'),book=new ExcelJS.Workbook();book.creator='Vista Journey';book.created=new Date(report.generatedAt);
 function sheet(title,columns,rows){
  const ws=book.addWorksheet(title.replace(/[\\/*?:\[\]]/g,'-').slice(0,31));
  ws.addRows([[report.title],[report.scope+' | '+report.from+' → '+report.to+' | '+report.dateLabel],[report.view],['Xuất lúc: '+stamp(report.generatedAt)],[],columns.map(c=>c.label)]);
  for(let i=1;i<=4;i++){ws.mergeCells(i,1,i,columns.length);ws.getRow(i).alignment={wrapText:true,vertical:'middle'};ws.getRow(i).height=i===1?30:i===3?38:28;}
  ws.getRow(1).font={name:'Calibri',size:16,bold:true,color:{argb:'FF624582'}};
  ws.getRow(6).height=34;ws.getRow(6).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(6).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF624582'}};ws.getRow(6).alignment={wrapText:true,vertical:'middle'};
  rows.forEach(row=>ws.addRow(columns.map(c=>{const value=row[c.key];return value==null?null:c.format?numeric(value):String(value);})));columns.forEach((c,i)=>{const col=ws.getColumn(i+1);col.width=c.format==='money'?23:c.format?17:25;if(c.format)col.numFmt=c.format==='percent'?'0.00"%"':'#,##0.##';});
  for(let i=7;i<=ws.rowCount;i++){ws.getRow(i).height=32;ws.getRow(i).alignment={wrapText:true,vertical:'middle'};if(i%2)ws.getRow(i).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7F2FA'}};}
  ws.views=[{state:'frozen',ySplit:6,xSplit:1}];ws.autoFilter={from:{row:6,column:1},to:{row:Math.max(6,ws.rowCount),column:columns.length}};
  ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:6'};return ws;
 }
 const summary=sheet('Tổng quan',[{key:'label',label:'Chỉ số'},{key:'value',label:'Giá trị'}],report.kpis);
 summary.getColumn(1).width=45;summary.getColumn(2).width=34;
 report.kpis.forEach((k,i)=>{const cell=summary.getCell(i+7,2);cell.value=numeric(k.value);cell.numFmt=k.format==='percent'?'0.00"%"':k.format==='money'?'#,##0" ₫"':'#,##0.##';});
 summary.addRow([]);report.notes.forEach(note=>{const row=summary.addRow([note]);summary.mergeCells(row.number,1,row.number,2);row.alignment={wrapText:true,vertical:'middle'};row.height=Math.max(30,Math.ceil(note.length/77)*16);row.font={color:{argb:'FF8A7895'},size:10};});
 summary.autoFilter={from:'A6',to:'B'+(6+report.kpis.length)};
 report.sections.forEach(section=>sheet(section.title,section.columns,section.rows));
 return book;
}

function circular(doc,chart,x,top,w,h){
 doc.setFontSize(9);doc.setTextColor(ink);doc.text(doc.splitTextToSize(chart.title,w-8),x+4,top+5);
 const {sectors,total,signed}=prepareSlices(chart.data,6),layout=layoutCircularLabels(sectors),plotTop=top+15,plotHeight=h-22,cx=x+w/2,cy=plotTop+plotHeight/2,r=Math.min(24,plotHeight*.27),inner=r*.55;
 const text=(value,xx,yy,size=6.5,align='center')=>{doc.setFontSize(size);doc.setTextColor(ink);doc.text(String(value),xx,yy,{align});};
 if(!total){text('Không có số liệu khác 0 để chia tỷ trọng',cx,cy,7);return;}
 for(const s of sectors){const steps=Math.max(6,Math.ceil((s.end-s.start)*25)),vertices=[[cx,cy],...Array.from({length:steps+1},(_,i)=>{const a=s.start+(s.end-s.start)*i/steps;return [cx+Math.cos(a)*r,cy+Math.sin(a)*r];}),[cx,cy]],lines=vertices.slice(1).map((v,i)=>[v[0]-vertices[i][0],v[1]-vertices[i][1]]);doc.setFillColor(s.color);doc.lines(lines,cx,cy,[1,1],'F',true);}
 doc.setFillColor('#ffffff');doc.circle(cx,cy,inner,'F');text(chart.centerFormat==='percent'?format(chart.center,'percent'):compactChartNumber(chart.center),cx,cy,11);text(chart.centerLabel||'Tổng',cx,cy+5,5.5);
 for(const s of layout.labels){const yy=plotTop+s.y/layout.height*plotHeight,sx=cx+Math.cos(s.mid)*(r+1),sy=cy+Math.sin(s.mid)*(r+1),end=cx+(s.right?1:-1)*(r+5),tx=end+(s.right?2:-2),align=s.right?'left':'right';doc.setDrawColor(s.color);doc.setLineWidth(.3);doc.line(sx,sy,end,yy);doc.line(end,yy,end+(s.right?-1.5:1.5),yy-1);doc.line(end,yy,end+(s.right?-1.5:1.5),yy+1);doc.setFontSize(6.5);doc.setTextColor(ink);const label=doc.splitTextToSize(s.label,w/2-r-10).slice(0,2);doc.text(label,tx,yy-4,{align});text(compactChartNumber(s.grouped&&signed?s.weight:s.value)+' | '+chartNumber(Math.round(s.percent*10)/10)+'%',tx,yy+4,6.5,align);}
 if(signed)text('Tỷ trọng theo độ lớn tuyệt đối; bảng giữ dấu âm.',cx,top+h-2,6);
}

export async function createBluejayPdf(report,{fontBase64}={}){
 const {jsPDF}=await import('jspdf'),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.addFileToVFS('NotoSans.ttf',fontBase64||await reportFontData());doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');doc.setProperties({title:report.title+' '+report.from+' - '+report.to,author:'Vista Journey'});
 let y=12;const bottom=186,width=273;
 function text(value,x,yy,size=8,color=ink){doc.setFontSize(size);doc.setTextColor(color);doc.text(String(value),x,yy);}
 function paragraph(value,size=8,color=muted){doc.setFontSize(size);const lines=doc.splitTextToSize(String(value),width);if(y+lines.length*3.6>bottom)newPage();doc.setTextColor(color);doc.text(lines,12,y+3);y+=lines.length*3.6+3;}
 function header(){y=15;doc.setFillColor(ink);doc.rect(0,0,297,2,'F');text('VISTA JOURNEY | '+report.title,12,y,16);y+=7;paragraph(report.scope+' | '+report.from+' - '+report.to+' | '+report.dateLabel,9,ink);paragraph(report.view.length>260?report.view.slice(0,260)+'… (bộ lọc đầy đủ trong Excel)':report.view,7);paragraph('Xuất lúc: '+stamp(report.generatedAt)+' | Dữ liệu đã tải; số thiếu hiển thị —.',7);}
 function newPage(){doc.addPage();header();}
 function table(title,columns,rows){
  const weights=columns.map(c=>c.format==='money'?1.3:c.key==='hotel'||c.key==='guestName'||c.key==='room'||c.key==='label'?1.5:1),sum=weights.reduce((s,n)=>s+n,0),widths=weights.map(n=>n/sum*width),lineHeight=3.2;
  function tableHead(){if(y+28>bottom)newPage();text(title,12,y+4,10);y+=8;doc.setFontSize(7);const names=columns.map((c,i)=>doc.splitTextToSize(c.label,widths[i]-4)),h=Math.max(...names.map(n=>n.length))*lineHeight+5;doc.setFillColor(ink);doc.rect(12,y,width,h,'F');doc.setTextColor('#ffffff');let x=12;names.forEach((name,i)=>{doc.text(name,x+2,y+4);x+=widths[i];});y+=h;}
  tableHead();if(!rows.length){paragraph('Không có dòng dữ liệu trong bộ lọc này.',8);return;}
  rows.forEach((row,index)=>{
   doc.setFontSize(7);const cells=columns.map((c,i)=>doc.splitTextToSize(format(row[c.key],c.format),widths[i]-4)),length=Math.max(...cells.map(c=>c.length));let offset=0;
   while(offset<length){let capacity=Math.floor((bottom-y-4)/lineHeight);if(capacity<1){newPage();tableHead();capacity=Math.floor((bottom-y-4)/lineHeight);}const take=Math.min(capacity,length-offset),h=take*lineHeight+4;if(index%2===0){doc.setFillColor('#f7f2fa');doc.rect(12,y,width,h,'F');}let x=12;doc.setTextColor(ink);doc.setFontSize(7);cells.forEach((lines,i)=>{const part=lines.slice(offset,offset+take);if(part.length)doc.text(part,x+2,y+4);x+=widths[i];});doc.setDrawColor(line);doc.line(12,y+h,285,y+h);y+=h;offset+=take;if(offset<length){newPage();tableHead();}}
  });y+=8;
 }
 header();report.notes.forEach(note=>paragraph(note,7));
 const kpiRows=Math.ceil(report.kpis.length/4);if(y+kpiRows*22+4>bottom)newPage();
 report.kpis.forEach((k,i)=>{const x=12+(i%4)*69,yy=y+Math.floor(i/4)*22;doc.setFillColor('#f7f2fa');doc.roundedRect(x,yy,66,19,2,2,'F');text(k.label,x+3,yy+5,7,muted);text(format(k.value,k.format||'number'),x+3,yy+13,11);});y+=kpiRows*22+8;
 for(const section of report.sections)table(section.title,section.columns,section.rows);
 for(let i=0;i<report.charts.length;i+=2){newPage();text('BIỂU ĐỒ TRÒN | '+report.view.slice(0,100),12,y+4,10);y+=10;report.charts.slice(i,i+2).forEach((chart,j)=>circular(doc,chart,12+j*139,y,134,112));y+=116;paragraph('Nhãn mũi tên: số lượng và tỷ trọng. Số tiền lớn viết gọn tr / tỷ; số đầy đủ ở bảng. Mục nhỏ gộp trên hình, bảng giữ đủ.',7);}
 for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);doc.setDrawColor('#c5a45d');doc.line(12,196,285,196);text('Vista Journey | '+report.from+' - '+report.to+' | M-Standard đã loại khỏi báo cáo.',12,202,7,muted);text(page+' / '+doc.getNumberOfPages(),273,202,7,muted);}
 return doc;
}

export async function exportBluejayReport(report,format){
 if(format==='excel'){const book=await createBluejayWorkbook(report);download(await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',name(report,'xlsx'));}
 else{const doc=await createBluejayPdf(report);download(doc.output('arraybuffer'),'application/pdf',name(report,'pdf'));}
}
