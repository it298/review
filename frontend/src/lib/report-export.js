import {platforms,categories} from './directory.js';
import {number,signed,time,alertText} from './insight-labels.js';
const columns=['Địa điểm','Loại','Nền tảng','Điểm','Thang điểm','Thay đổi điểm','Tổng chính xác','Loại số đếm','Thay đổi tổng','Ngày đầu tổng','Ngày cuối tổng','Số ngày có tổng','Số ngày có điểm','Trạng thái'];
const status=r=>({missing:'Thiếu dữ liệu',partial:'Có một phần dữ liệu',confirmed:'Có số liệu'}[r.status]);
const values=r=>[r.name,categories[r.category],platforms[r.source]?.name,r.rating,r.rating_max,r.rating_change,r.review_count,r.count_kind==='ratings'?'Lượt chấm điểm':'Đánh giá',r.count_change,r.count_first_day,r.count_last_day,r.count_days,r.rating_days,status(r)];
function download(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function excelReport(report){
 const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='StayScope';book.created=new Date(report.generated_at);
 const summary=book.addWorksheet('Tổng hợp');summary.addRows([['Báo cáo review',report.start+' → '+report.end],['Tạo lúc',time(report.generated_at)],['Địa điểm công ty',report.locations],['Nguồn có điểm và tổng',report.confirmed_sources],['Nguồn thiếu dữ liệu',report.missing_sources],['Cách tính',report.note]]);summary.getColumn(1).width=30;summary.getColumn(2).width=100;summary.getCell('B6').alignment={wrapText:true};summary.getRow(6).height=55;
 const detail=book.addWorksheet('Số liệu theo nguồn');detail.addRow(columns);report.rows.forEach(r=>detail.addRow(values(r)));detail.views=[{state:'frozen',ySplit:1}];detail.autoFilter={from:'A1',to:'N1'};detail.columns.forEach((c,i)=>{c.width=i===0?35:i===2?22:18;});
 const alerts=book.addWorksheet('Cảnh báo');alerts.addRow(['Địa điểm','Nền tảng','Nội dung','Thời điểm']);report.alerts.forEach(a=>alerts.addRow([a.name,platforms[a.source]?.name,alertText(a),time(a.at)]));[35,22,80,28].forEach((w,i)=>{alerts.getColumn(i+1).width=w;});
 for(const sheet of book.worksheets){sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3459DC'}};sheet.getRow(1).height=25;}
 download(await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','bao-cao-review-'+report.start+'.xlsx');
}
let font;
async function fontData(){if(!font)font=fetch('/fonts/NotoSans-Regular.ttf').then(async r=>{if(!r.ok)throw new Error('Không tải được phông chữ PDF.');const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}).catch(e=>{font=null;throw e;});return font;}
export async function pdfReport(report){
 const {jsPDF}=await import('jspdf'),doc=new jsPDF({unit:'mm',format:'a4'});doc.addFileToVFS('NotoSans.ttf',await fontData());doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');let y=20,page=1;
 function footer(){doc.setFontSize(8);doc.setTextColor('#8a98af');doc.text('StayScope · '+report.start+' → '+report.end,16,286);doc.text(String(page),194,286,{align:'right'});}
 function room(height){if(y+height>274){footer();doc.addPage();page++;y=20;}}
 function text(value,size=10,color='#253d61'){doc.setFontSize(size);doc.setTextColor(color);const lines=doc.splitTextToSize(String(value),178);room(lines.length*size*0.5+4);doc.text(lines,16,y);y+=lines.length*size*0.5+4;}
 text('StayScope · Báo cáo review tuần',19);text(report.start+' → '+report.end,12);text('Tạo lúc '+time(report.generated_at),9,'#7a8ca6');
 text(report.locations+' địa điểm  ·  '+report.confirmed_sources+' nguồn có điểm và tổng  ·  '+report.missing_sources+' nguồn thiếu dữ liệu',11);text(report.note,9,'#7a8ca6');y+=3;
 text('Biến động đáng chú ý',14);if(!report.top_growth.length&&!report.rating_drops.length)text('Chưa đủ mốc trong tuần để xếp hạng biến động.',10);
 report.top_growth.forEach(r=>text(r.name+' · '+platforms[r.source]?.name+': '+signed(r.count_change)+' '+(r.count_kind==='ratings'?'lượt chấm điểm':'đánh giá')+' ('+r.count_first_day+' → '+r.count_last_day+')',10));
 report.rating_drops.forEach(r=>text(r.name+' · '+platforms[r.source]?.name+': '+signed(r.rating_change)+' điểm, thang '+r.rating_max,10));
 text('Cảnh báo trong tuần',14);if(!report.alerts.length)text('Không có cảnh báo đã ghi nhận trong tuần.',10);report.alerts.forEach(a=>text(a.name+' · '+platforms[a.source]?.name+' · '+alertText(a)+' · '+time(a.at),9));
 text('Chi tiết từng địa điểm / nền tảng',14);
 for(const r of report.rows){room(30);doc.setDrawColor('#e2e8f2');doc.line(16,y-2,194,y-2);text(r.name+' · '+platforms[r.source]?.name,10);text('Điểm: '+number(r.rating)+' / '+r.rating_max+' ('+signed(r.rating_change)+') · Tổng: '+number(r.review_count)+' ('+signed(r.count_change)+') · '+status(r),9);text('Mốc tổng: '+(r.count_first_day||'—')+' → '+(r.count_last_day||'—')+' · '+r.count_days+' ngày có tổng, '+r.rating_days+' ngày có điểm.',8,'#7a8ca6');}
 footer();doc.save('bao-cao-review-'+report.start+'.pdf');
}
