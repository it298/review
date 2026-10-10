import {platforms,categories} from './directory.js';
import {number,signed,time,alertText,visibleReport} from './insight-labels.js';
import {reportGroups,reportSources,reportDate} from './report-view.js';
import {renderReportMatrix} from './report-pdf.js';
const columns=['Địa điểm','Loại','Nền tảng','Điểm đầu','Điểm cuối','Thang điểm','Thay đổi điểm','Ngày đầu điểm','Ngày cuối điểm','Tổng đầu','Tổng cuối','Loại số đếm','Thay đổi tổng','Ngày đầu tổng','Ngày cuối tổng','Số ngày có tổng','Số ngày có điểm'];
const values=r=>[r.name,categories[r.category],platforms[r.source]?.name,r.rating_first,r.rating,r.rating_max,r.rating_change,r.rating_first_day,r.rating_last_day,r.review_count_first,r.review_count,r.count_kind==='ratings'?'Lượt chấm điểm':'Đánh giá',r.count_change,r.count_first_day,r.count_last_day,r.count_days,r.rating_days];
function download(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function filterLabel(report){const f=report.filters||{};return [categories[f.category]||'Tất cả nhóm',platforms[f.source]?.name||'Tất cả nền tảng',f.metric==='rating'?'Theo điểm số':'Theo số đánh giá',f.query&&'Tìm: '+f.query,{up:'Đang tăng',down:'Đang giảm',changed:'Có thay đổi'}[f.movement]].filter(Boolean).join(' · ');}
export async function excelReport(report){
 report=visibleReport(report);const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();book.creator='StayScope';book.created=new Date(report.generated_at);
 const summary=book.addWorksheet('Tổng hợp'),sources=reportSources(report.rows),groups=reportGroups(report.rows);
 summary.addRows([['Báo cáo review',report.start+' → '+report.end],['Tạo lúc',time(report.generated_at)],['Bộ lọc',filterLabel(report)],['Địa điểm',report.locations],['Nguồn có điểm và tổng',report.confirmed_sources],['Cách tính',report.note],[],['Địa điểm','Nhóm',...sources.map(s=>platforms[s].name)]]);
 for(const g of groups)summary.addRow([g.name,categories[g.category],...sources.map(s=>{const r=g.sources[s];if(!r)return '—';const total=number(r.review_count)+' '+(r.count_kind==='ratings'?'lượt chấm':'đánh giá')+' ('+signed(r.count_change)+')',score=number(r.rating)+'/'+r.rating_max+' điểm ('+signed(r.rating_change)+')';return report.filters?.metric==='rating'?score+'\n'+total:total+'\n'+score;})]);
 summary.getColumn(1).width=34;summary.getColumn(2).width=24;sources.forEach((_,i)=>summary.getColumn(i+3).width=27);summary.mergeCells(6,2,6,Math.max(3,sources.length+2));summary.getCell('B6').alignment={wrapText:true};summary.getRow(6).height=45;summary.views=[{state:'frozen',ySplit:8,xSplit:2}];summary.autoFilter={from:'A8',to:{row:8,column:sources.length+2}};
 for(let n=9;n<=summary.rowCount;n++){summary.getRow(n).height=44;summary.getRow(n).alignment={vertical:'middle',wrapText:true};}
 const detail=book.addWorksheet('Chi tiết so sánh');detail.addRow(columns);report.rows.forEach(r=>detail.addRow(values(r)));detail.views=[{state:'frozen',ySplit:1,xSplit:1}];detail.autoFilter={from:'A1',to:'Q1'};detail.columns.forEach((c,i)=>{c.width=i===0?34:i===2?22:18;});
 const alerts=book.addWorksheet('Biến động');alerts.addRow(['Địa điểm','Nền tảng','Nội dung','Thời điểm']);report.alerts.forEach(a=>alerts.addRow([a.name,platforms[a.source]?.name,alertText(a),time(a.at)]));[34,22,80,28].forEach((w,i)=>{alerts.getColumn(i+1).width=w;});
 for(const [sheet,row] of [[summary,8],[detail,1],[alerts,1]]){sheet.getRow(row).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(row).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3459DC'}};sheet.getRow(row).height=28;}
 download(await book.xlsx.writeBuffer(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','bao-cao-review-'+report.start+'_'+report.end+'.xlsx');
}
let font;
async function fontData(){if(!font)font=fetch('/fonts/NotoSans-Regular.ttf').then(async r=>{if(!r.ok)throw new Error('Không tải được phông chữ PDF.');const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}).catch(e=>{font=null;throw e;});return font;}
export async function createReportPdf(report,{fontBase64}={}){
 report=visibleReport(report);const {jsPDF}=await import('jspdf'),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 doc.addFileToVFS('NotoSans.ttf',fontBase64||await fontData());doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');
 doc.setProperties({title:'Báo cáo review '+reportDate(report.start)+' - '+reportDate(report.end),author:'StayScope'});
 renderReportMatrix(doc,report,filterLabel(report));return doc;
}
export async function pdfReport(report){const doc=await createReportPdf(report);doc.save('bao-cao-review-'+report.start+'_'+report.end+'.pdf');}
