import {fold,detectFinanceBlocks,previewFinanceImport} from './finance-excel-import.js';
import {parseGridDay,parseGridMoney} from './finance-grid.js';
import {isDay,financeCategories} from './finance.js';
export const REPORT_VERSION=3;
export function validMonth(month){return typeof month==='string'&&/^\d{4}-\d{2}$/.test(month)&&isDay(month+'-01');}
export function monthFromFilename(name){const m=String(name).match(/(?:tháng|thang|[_\s]t)\s*(\d{1,2})[_\s/-]*(20\d{2})/i);return m?m[2]+'-'+m[1].padStart(2,'0'):null;}
const value=c=>!c||c.type==='e'||c.f&&c.cacheAvailable===false?null:c.v??null;
const text=c=>String(value(c)??'').trim();
const money=c=>{const v=value(c);if(v==null||v==='')return null;const n=typeof v==='number'?v:parseGridMoney(v);return Number.isFinite(n)&&Math.abs(n)<=1e12?Math.round(n*100)/100:null;};
const date=(c,s)=>{const v=value(c);return typeof v==='number'&&s.date1904?new Date(Date.UTC(1904,0,1)+Math.floor(v)*86400000).toISOString().slice(0,10):parseGridDay(v);};
const sum=(rows,key)=>{const known=rows.filter(r=>r[key]!=null);return known.length?Math.round(known.reduce((s,r)=>s+r[key],0)*100)/100:null;};
const dashboardNote=message=>message.replaceAll('Chọn hạng mục hợp lệ.','Chưa có hạng mục nhận diện được; số tiền vẫn tính vào tổng, ở nhóm Chưa phân loại.').replaceAll('Nội dung cần từ 1 đến 1.000 ký tự.','Diễn giải trống hoặc vượt giới hạn; không ảnh hưởng tổng thu–chi.').replaceAll('Chọn phương thức hợp lệ.','Chưa nhận diện phương thức thanh toán; số tiền vẫn tính vào tổng.');
const serviceNote=r=>`Ô ${r.cost==null&&r.sale==null?'giá thuê và giá bán':r.cost==null?'giá thuê':'giá bán'} chưa có số trong file; ${r.reportedProfit!=null?'lợi nhuận được lấy từ cột Lợi nhuận đã lưu trong file.':'chưa có đủ số để tính chênh lệch giá bán − thuê.'}`;
const originalCategory=(origin,rows,blocks)=>{const block=blocks.find(b=>origin.column-1>=b.start&&origin.column-1<b.end),column=block?.columns.find(c=>c.target==='category');return column?text(rows[origin.row-1]?.[column.index]):'';};
export function reportCategory(entry){
 const source=fold(entry.sourceCategory);
 if(entry.kind==='payment'&&/^(?:chi)?suachua$/.test(source))return {category:'repair',label:'Sửa chữa'};
 if(entry.kind==='payment'&&/^(?:chi)?baoduong(?:taisan)?$/.test(source))return {category:'maintenance',label:source.includes('taisan')?'Bảo dưỡng tài sản':'Bảo dưỡng'};
 return {category:entry.category,label:financeCategories[entry.category]||'Chưa phân loại'};
}
// Upgrade stored snapshots on read using their preserved source cells. Never rewrite originals.
export function normalizeManagementReport(report){
 if(!report||report.version>=REPORT_VERSION)return report;
 const sources=new Map((report.sheets||[]).map(s=>{const rows=s.sourceRows||[],header=rows.find(r=>r.cells.some(c=>fold(c)==='giadvthue')&&r.cells.some(c=>fold(c)==='giabandv'));return [s.name,{column:header?.cells.findIndex(c=>fold(c)==='loinhuan')??-1,rows:new Map(rows.map(r=>[r.row,r.cells]))}];}));
 const cashSources=new Map((report.sheets||[]).filter(s=>s.type==='cash').map(s=>{const rows=[];for(const r of s.sourceRows||[])rows[r.row-1]=r.cells.map(v=>({v}));const headers=Array.from({length:Math.min(rows.length,61)},(_,i)=>rows[i]||[]);return [s.name,{rows,blocks:detectFinanceBlocks({name:s.name,rows:headers})}];}));
 const services=(report.services||[]).map(r=>{if(Object.hasOwn(r,'reportedProfit'))return r;const s=sources.get(r.origin.sheet),cells=s?.rows.get(r.origin.row);return {...r,reportedProfit:money({v:s?.column>=0?cells?.[s.column]:null})};});
 const issues=(report.issues||[]).map(i=>{const service=services.find(r=>r.origin.sheet===i.sheet&&r.origin.row===i.row);return {...i,message:service&&i.message==='Dịch vụ thiếu giá thuê hoặc giá bán; chưa tính đủ lợi nhuận.'?serviceNote(service):dashboardNote(i.message)};});
 return {...report,version:REPORT_VERSION,services,issues,entries:(report.entries||[]).map(r=>{const s=cashSources.get(r.origin.sheet);return {...r,sourceCategory:r.sourceCategory??(s?originalCategory(r.origin,s.rows,s.blocks):''),notes:(r.notes||[]).map(dashboardNote)};})};
}
export function groupReportIssues(reports){
 const groups=new Map();for(const report of reports)for(const issue of report.issues||[]){const key=JSON.stringify([report.unit,report.fileName,issue.sheet,issue.message]);if(!groups.has(key))groups.set(key,{file:report.fileName,sheet:issue.sheet,message:issue.message,rows:new Set(),count:0});const group=groups.get(key);group.count++;if(issue.row)group.rows.add(issue.row);}
 return [...groups.values()].map(g=>({...g,rows:[...g.rows].sort((a,b)=>a-b)}));
}
export function analyzeWorkbook(book,month){
 if(!validMonth(month))throw Error('Chọn tháng báo cáo hợp lệ.');
 const family=book.sheets.some(s=>/^kq/.test(fold(s.name)))?'business':'cash',entries=[],services=[],statements=[],sheetInfo=[],issues=[];
 let missingAmounts=0,outsidePeriod=0;
 for(const sheet of book.sheets){
  if(sheet.error)throw Error(sheet.name+': '+sheet.error);
  const name=fold(sheet.name);let type='reference',count=0;
  const isCash=/^(bkthu|bkchi|thuchiminimart|bangkethu|bangkechi)/.test(name);
  if(isCash){
   type='cash';const blocks=detectFinanceBlocks(sheet),preview=previewFinanceImport(sheet,blocks,{from:'1900-01-01',to:'2100-12-31',management:true});
   if(preview.warnings.length)issues.push(...preview.warnings.map(message=>({sheet:sheet.name,message})));
   for(const e of preview.entries){const r=e.row,origin={sheet:sheet.name,row:r._importSource.row,column:r._importSource.column};
    if(!isDay(r.date)||!['receipt','payment'].includes(r.kind)||!Number.isSafeInteger(r.amount)){
     missingAmounts++;issues.push({...origin,message:'Không tính vào tổng: thiếu ngày, số tiền hoặc loại thu/chi hợp lệ.'});continue;
    }
    if(r.date.slice(0,7)!==month){outsidePeriod++;continue;}
    const notes=[...new Set(Object.entries(e.errors).filter(([k])=>!['reference','rule','depositRef'].includes(k)).map(([,v])=>dashboardNote(v)))];
    if(e.errors.reference)notes.push('Thông tin giống dòng khác trong file; giữ nguyên từng ô nguồn.');
    if(notes.length)issues.push({...origin,message:notes.join(' ')});
    entries.push({date:r.date,kind:r.kind,category:r.category||'unclassified',sourceCategory:originalCategory(origin,sheet.rows,blocks),description:/^#/.test(r.description)?'':r.description,amount:r.amount,method:r.method,bookingCode:r.bookingCode,room:r.room,source:r.source,origin,notes});count++;
   }
  }else if(/^(dvngoai|dichvungoai)$/.test(name)){
   type='services';const header=sheet.rows.findIndex(r=>r.some(c=>fold(text(c))==='giadvthue')&&r.some(c=>fold(text(c))==='giabandv'));
   if(header>=0){const h=sheet.rows[header],at=pattern=>h.findIndex(c=>pattern.test(fold(text(c)))),d=at(/^date|^ngay/),booking=at(/^idphong$/),service=at(/^dichvu$/),description=at(/^diengiai$/),cost=at(/^giadvthue$/),sale=at(/^giabandv$/),profit=at(/^loinhuan$/),commission=at(/^chietkhau20/),staff=at(/^nhanvien$/);
    for(let i=header+1;i<sheet.rows.length;i++){const r=sheet.rows[i],day=date(r[d],sheet);if(!isDay(day))continue;if(day.slice(0,7)!==month){outsidePeriod++;continue;}const selling=money(r[sale]),buying=money(r[cost]),commissionValue=money(r[commission]);if(!text(r[service])&&!text(r[booking]))continue;
     const origin={sheet:sheet.name,row:i+1},entry={date:day,bookingCode:cleanId(r[booking]),service:text(r[service]),description:text(r[description]),staff:text(r[staff]),cost:buying,sale:selling,reportedProfit:money(r[profit]),margin:buying!=null&&selling!=null?Math.round((selling-buying)*100)/100:null,commission:commissionValue,origin};services.push(entry);count++;
     if(buying==null||selling==null)issues.push({...origin,message:serviceNote(entry)});
    }
   }
  }else if(/^kq/.test(name)){
   type='business';const header=sheet.rows.findIndex(r=>fold(text(r[1]))==='chitieu');
   if(header>=0){const h=sheet.rows[header];let columns=h.map((c,i)=>({i,day:date(c,sheet)})).filter(c=>c.i>=3&&isDay(c.day));const exact=columns.filter(c=>c.day.slice(0,7)===month);if(exact.length)columns=exact;
    if(columns.length===1){const c=columns[0],sourceMonth=c.day.slice(0,7),rows=[];
     for(let i=header+1;i<sheet.rows.length;i++){const label=text(sheet.rows[i][1]),cell=sheet.rows[i][c.i],n=money(cell);if(label&&n!=null)rows.push({label,value:n,row:i+1});else if(label&&cell?.f)issues.push({sheet:sheet.name,row:i+1,message:'Chỉ tiêu HĐKD thiếu kết quả công thức đã lưu, chưa có số dùng được.'});}
     const find=re=>rows.find(r=>re.test(fold(r.label)))??null;
     const revenue=find(/^itongdoanhthu/),expenses=find(/^iitongchiphi/),profit=find(/^iiiloinhuan/);statements.push({sheet:sheet.name,sourceMonth,revenue:revenue?.value??null,expenses:expenses?.value??null,profit:profit?.value??null,rows});count=rows.length;
     if(sourceMonth!==month)issues.push({sheet:sheet.name,row:header+1,message:'Đầu cột KQ HĐKD ghi kỳ '+sourceMonth+', khác tháng chọn '+month+'. Chỉ trình bày riêng, không cộng vào chỉ số kỳ này.'});
    }else issues.push({sheet:sheet.name,message:'Chưa xác định được cột tháng KQ HĐKD duy nhất; xem dữ liệu sheet gốc.'});
   }
  }
  // Keep original nonempty rows for inspection; never sum multiple detail/summary sheets.
  const sourceRows=sheet.rows.map((r,i)=>({row:i+1,cells:r.map(c=>{const v=value(c);return typeof v==='number'||typeof v==='boolean'?v:v==null?'':String(v).slice(0,2000);})})).filter(r=>r.cells.some(c=>c!==''));
  for(const r of sourceRows)while(r.cells.at(-1)==='')r.cells.pop();
  sheetInfo.push({name:sheet.name,type,count,sourceRows});
 }
 if(!entries.length&&!services.length&&!statements.length)throw Error('Chưa nhận diện được bảng thu–chi, DV Ngoài hoặc KQ HĐKD trong kỳ chọn. Chọn đúng tháng hoặc dùng file báo cáo theo mẫu.');
 return {version:REPORT_VERSION,fileName:book.name,month,family,entries,services,statements,sheets:sheetInfo,issues,quality:{missingAmounts,outsidePeriod},totals:cashTotals(entries)};
}
const cleanId=c=>c&&/^\d+$/.test(c.text||'')?c.text:text(c);
export function cashTotals(entries){const receipt=entries.filter(r=>r.kind==='receipt'),payment=entries.filter(r=>r.kind==='payment'),receipts=sum(receipt,'amount'),payments=sum(payment,'amount');return {receipts,payments,net:receipts==null||payments==null?null:Math.round((receipts-payments)*100)/100,rows:entries.length};}
export function dashboardFromReports(records,{from,to}={}){
 // One active snapshot per property/month/family. Cash-source takes priority over copied ledgers in management files.
 const groups=new Map();for(const record of records){const key=record.unit+'|'+record.month;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(record);}
 const entries=[],services=[],statements=[],coverage=[];
 for(const group of groups.values()){
  const cash=group.find(r=>r.family==='cash'),business=group.find(r=>r.family==='business'),ledger=cash?.entries.length?cash:business;
  const selectedServices=cash?.services.length?cash:business;
  if(ledger)entries.push(...ledger.entries.map(r=>({...r,unit:ledger.unit,unitName:ledger.unitName,fileName:ledger.fileName})));
  if(selectedServices)services.push(...selectedServices.services.map(r=>({...r,unit:selectedServices.unit,fileName:selectedServices.fileName})));
  if(business)statements.push(...business.statements.map(r=>({...r,unit:business.unit,month:business.month,fileName:business.fileName})));
  coverage.push({unit:group[0].unit,unitName:group[0].unitName,month:group[0].month,cashFile:ledger?.fileName||null,businessFile:business?.fileName||null});
 }
 const inRange=r=>(!from||r.date>=from)&&(!to||r.date<=to),filtered=entries.filter(inRange),serviceRows=services.filter(inRange);
 const categories=new Map(),methods=new Map(),days=new Map();
 for(const r of filtered){const group=reportCategory(r),key=r.kind+'|'+group.category+'|'+group.label;if(!categories.has(key))categories.set(key,{kind:r.kind,...group,amount:0});categories.get(key).amount+=r.amount;
  const method=r.kind+'|'+r.method;if(!methods.has(method))methods.set(method,{kind:r.kind,method:r.method,amount:0});methods.get(method).amount+=r.amount;
  if(!days.has(r.date))days.set(r.date,{date:r.date,receipts:0,payments:0});days.get(r.date)[r.kind==='receipt'?'receipts':'payments']+=r.amount;
 }
 const comparable=statements.filter(s=>s.sourceMonth===s.month&&(!from||from<=s.month+'-01')&&(!to||to>=monthEnd(s.month)));
 return {entries:filtered,services:serviceRows,statements,coverage,totals:cashTotals(filtered),categories:[...categories.values()],methods:[...methods.values()],daily:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)),business:{revenue:sum(comparable,'revenue'),expenses:sum(comparable,'expenses'),profit:sum(comparable,'profit'),reports:comparable.length},serviceTotals:{reportedProfit:serviceRows.length&&serviceRows.every(r=>r.reportedProfit!=null)?sum(serviceRows,'reportedProfit'):null,missingReportedProfit:serviceRows.filter(r=>r.reportedProfit==null).length,sale:sum(serviceRows,'sale'),knownCost:sum(serviceRows.filter(r=>r.cost!=null),'cost'),margin:serviceRows.length&&serviceRows.every(r=>r.margin!=null)?sum(serviceRows,'margin'):null,commission:serviceRows.length&&serviceRows.every(r=>r.commission!=null)?sum(serviceRows,'commission'):null,missingCost:serviceRows.filter(r=>r.cost==null).length}};
}
export function monthEnd(month){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);}
