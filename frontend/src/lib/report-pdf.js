import {platforms,categories} from './directory.js';
import {number,signed,time} from './insight-labels.js';
import {reportGroups,reportSources,reportDate} from './report-view.js';

const colors={ink:'#253d61',muted:'#73839b',line:'#dfe6f0',blue:'#3459dc',green:'#238269',red:'#c95454'};
const shortDate=value=>value?reportDate(value).slice(0,5):'—';
function metricLines(r,metric){
 const count=metric==='count',value=count?r.review_count:r.rating,first=count?r.review_count_first:r.rating_first,delta=count?r.count_change:r.rating_change;
 const firstDay=count?r.count_first_day:r.rating_first_day,lastDay=count?r.count_last_day:r.rating_last_day;
 return [
  {text:value==null?'—':count?number(value)+' '+(r.count_kind==='ratings'?'lượt chấm':'đánh giá'):number(value)+' / '+r.rating_max+' điểm',size:8.5,color:colors.ink},
  {text:delta==null?'Biến động: —':(delta===0?'Không đổi':signed(delta))+' (đầu: '+number(first)+')',size:7,color:delta==null||delta===0?colors.muted:delta>0?colors.green:colors.red},
  {text:firstDay&&lastDay?'Mốc '+shortDate(firstDay)+' - '+shortDate(lastDay):'',size:6.5,color:colors.muted}
 ];
}
export function pdfMatrix(report){
 const sources=reportSources(report.rows),primary=report.filters?.metric==='rating'?'rating':'count',secondary=primary==='count'?'rating':'count';
 return {sources,groups:reportGroups(report.rows).map(g=>({...g,cells:sources.map(source=>{const r=g.sources[source];return r&&(r.rating!=null||r.review_count!=null)?[...metricLines(r,primary),{text:'',size:3},...metricLines(r,secondary)]:[{text:'—',size:8.5,color:colors.muted}];})}))};
}

// Keep every platform beside its peers; paginate vertically, never by platform.
export function renderReportMatrix(doc,report,filterLabel){
 const {sources,groups}=pdfMatrix(report),margin=12,width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight(),contentWidth=width-margin*2;
 const nameWidth=sources.length?Math.max(42,contentWidth*0.17):contentWidth,sourceWidth=sources.length?(contentWidth-nameWidth)/sources.length:0;
 const bottom=height-19;let y=margin;
 const wrap=(text,size,w)=>{doc.setFontSize(size);return doc.splitTextToSize(String(text),w);};
 const lineHeight=size=>size*0.3528*1.25;
 function text(value,size,color=colors.ink){const lines=wrap(value,size,contentWidth);doc.setTextColor(color);doc.text(lines,margin,y+lineHeight(size));y+=lines.length*lineHeight(size)+2;}
 function title(continued=false){
  text('StayScope | Báo cáo review'+(continued?' (tiếp)':''),continued?13:18);
  text(reportDate(report.start)+' - '+reportDate(report.end)+' | '+groups.length+' địa điểm | '+sources.length+' nền tảng',10);
  if(!continued){text('Tạo lúc '+time(report.generated_at)+' | '+filterLabel,8,colors.muted);text('Số lớn: mốc cuối. Dòng màu: tăng/giảm so với mốc đầu. Mốc ngày tính riêng cho tổng và điểm; — là chưa đủ dữ liệu.',7.5,colors.muted);}
  y+=2;
 }
 function header(){
  const labels=['Địa điểm',...sources.map(s=>platforms[s].name+'\nThang điểm /'+platforms[s].scale)],widths=[nameWidth,...sources.map(()=>sourceWidth)];
  const lines=labels.map((v,i)=>wrap(v,8,widths[i]-6)),h=Math.max(...lines.map(v=>v.length))*lineHeight(8)+6;
  doc.setFillColor(colors.blue);doc.rect(margin,y,contentWidth,h,'F');let x=margin;
  lines.forEach((v,i)=>{doc.setFontSize(8);doc.setTextColor('#ffffff');doc.text(v,x+3,y+3+lineHeight(8));x+=widths[i];});y+=h;
 }
 function measure(lines,w){return lines.map(l=>({...l,wrapped:l.text?wrap(l.text,l.size,w-6):['']}));}
 function drawLines(lines,x,top){let baseline=top+4;for(const l of lines){doc.setFontSize(l.size);doc.setTextColor(l.color||colors.ink);baseline+=lineHeight(l.size);if(l.text)doc.text(l.wrapped,x+3,baseline);baseline+=(l.wrapped.length-1)*lineHeight(l.size)+0.4;}}
 title();header();
 groups.forEach((g,index)=>{
  const name=measure([{text:g.name,size:9,color:colors.ink},{text:categories[g.category]||'',size:7,color:colors.muted}],nameWidth);
  const cells=g.cells.map(lines=>measure(lines,sourceWidth));
  const blockHeight=lines=>lines.reduce((n,l)=>n+l.wrapped.length*lineHeight(l.size)+0.4,0)+8;
  const rowHeight=Math.max(28,blockHeight(name),...cells.map(blockHeight));
  if(y+rowHeight>bottom){doc.addPage();y=margin;title(true);header();}
  if(index%2===1){doc.setFillColor('#f5f8fd');doc.rect(margin,y,contentWidth,rowHeight,'F');}
  drawLines(name,margin,y);let x=margin+nameWidth;
  cells.forEach(lines=>{drawLines(lines,x,y);x+=sourceWidth;});
  doc.setDrawColor(colors.line);doc.setLineWidth(0.2);x=margin+nameWidth;
  for(let i=0;i<sources.length;i++){doc.line(x,y,x,y+rowHeight);x+=sourceWidth;}
  y+=rowHeight;doc.line(margin,y,width-margin,y);
 });
 if(!groups.length)text('Không có địa điểm khớp bộ lọc.',10);
 const pages=doc.getNumberOfPages();
 for(let page=1;page<=pages;page++){
  doc.setPage(page);doc.setDrawColor(colors.line);doc.line(margin,height-14,width-margin,height-14);doc.setFontSize(7);doc.setTextColor(colors.muted);
  doc.text('StayScope | '+reportDate(report.start)+' - '+reportDate(report.end)+' | Không cộng tổng giữa các nền tảng.',margin,height-9);
  doc.text(page+' / '+pages,width-margin,height-9,{align:'right'});
 }
}
