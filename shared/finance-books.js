import {isDay,validateFinanceEntry,reconcileDay} from './finance.js';
export const bookTypes={shift:'Bàn giao ca',invoice:'Hóa đơn bán hàng',stocktake:'Kiểm kê kho',product:'Danh mục hàng hóa',stay:'Doanh thu lưu trú',receivable:'Phải thu',payable:'Phải trả',payroll:'Lương & bảo hiểm',allocation:'Phân bổ chi phí'};
export const employeeBooks=['shift','invoice','stocktake'];
const fail=m=>Object.assign(new Error(m),{status:400});
const text=(v,label,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw fail('Nhập '+label+'.');return v.trim();};
const amount=(v,label,zero=true)=>{if(!Number.isSafeInteger(v)||v<(zero?0:1)||v>1e12)throw fail(label+' phải là số nguyên VND hợp lệ.');return v;};
const qty=v=>{if(!Number.isFinite(v)||v<=0||v>1e6||Math.abs(v*1000-Math.round(v*1000))>1e-6)throw fail('Số lượng cần dương, tối đa 3 số lẻ.');return v;};
export function validateBook(p){
 if(!Object.hasOwn(bookTypes,p?.type)||!isDay(p.date)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id||''))throw fail('Loại sổ, ngày hoặc mã biểu mẫu không hợp lệ.');
 const v={id:p.id,type:p.type,date:p.date,reference:text(p.reference,'mã phiếu / mã đối chiếu',100),note:String(p.note||'').slice(0,1000)},d=p.data||{};let data;
 if(p.type==='product')data={sku:text(d.sku,'mã hàng',100),name:text(d.name,'tên hàng'),unit:text(d.unit,'đơn vị tính',30),price:amount(d.price,'Giá bán')};
 if(p.type==='invoice'){
  if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>50)throw fail('Hóa đơn cần từ 1 đến 50 dòng hàng.');
  const lines=d.lines.map(l=>({sku:String(l.sku||'').trim().slice(0,100),name:text(l.name,'tên hàng'),unit:text(l.unit,'đơn vị tính',30),quantity:qty(l.quantity),price:amount(l.price,'Đơn giá'),issueStock:l.issueStock===true}));
  if(lines.some(l=>l.issueStock&&!l.sku))throw fail('Hàng xuất kho cần mã hàng.');
  const gross=amount(lines.reduce((n,l)=>n+Math.round(l.quantity*l.price),0),'Tổng hóa đơn',false),discount=amount(d.discount||0,'Giảm giá'),vat=amount(d.vat||0,'VAT'),paid=amount(d.paid||0,'Đã thu');
  if(discount+vat>=gross||paid>gross-discount)throw fail('Giảm giá/VAT hoặc tiền thu vượt giá trị hóa đơn.');
  if(!['cash','bank','card','platform'].includes(d.method))throw fail('Chọn phương thức thu tiền.');
  if(!isDay(d.dueDate))throw fail('Nhập hạn thu tiền.');
  data={lines,gross,discount,vat,total:gross-discount,paid,method:d.method,dueDate:d.dueDate,counterparty:text(d.counterparty,'khách hàng / đối tượng thu')};
 }
 if(p.type==='stocktake'){
  if(!Array.isArray(d.lines)||!d.lines.length||d.lines.length>100)throw fail('Nhập từ 1 đến 100 dòng kiểm kê.');
  data={lines:d.lines.map(l=>{if(!Number.isFinite(l.counted)||l.counted<0||l.counted>1e6||Math.abs(l.counted*1000-Math.round(l.counted*1000))>1e-6)throw fail('Tồn thực tế cần không âm, tối đa 3 số lẻ.');return {sku:text(l.sku,'mã hàng',100),name:text(l.name,'tên hàng'),unit:text(l.unit,'đơn vị tính',30),counted:l.counted,unitCost:amount(l.unitCost||0,'Giá nhập bổ sung')};})};
  if(new Set(data.lines.map(l=>l.sku)).size!==data.lines.length)throw fail('Mỗi mã hàng chỉ có một dòng kiểm kê.');
  if(d.expected){if(!Array.isArray(d.expected)||d.expected.length!==data.lines.length||d.expected.some(l=>typeof l.sku!=='string'||!Number.isFinite(l.quantity)||l.quantity<0))throw fail('Mốc tồn kiểm kê không hợp lệ.');data.expected=d.expected.map(l=>({sku:l.sku,quantity:l.quantity}));}
 }
 if(p.type==='stay'){
  if(!isDay(d.checkIn)||!isDay(d.checkOut)||d.checkOut<=d.checkIn||(Date.parse(d.checkOut)-Date.parse(d.checkIn))/86400000>366||p.date!==d.checkIn)throw fail('Ngày ghi nhận phải là ngày nhận phòng; kỳ lưu trú từ 1 đến 366 đêm.');
  data={checkIn:d.checkIn,checkOut:d.checkOut,room:text(d.room,'phòng / loại phòng'),source:text(d.source,'nguồn đặt phòng'),total:amount(d.total,'Doanh thu thuần kỳ lưu trú',false),counterparty:text(d.counterparty,'khách / đơn vị thanh toán'),dueDate:d.checkOut};
 }
 if(['receivable','payable'].includes(p.type)){
  if(!isDay(d.dueDate))throw fail('Nhập ngày đến hạn.');
  data={counterparty:text(d.counterparty,'đối tác'),dueDate:d.dueDate,total:amount(d.total,'Số công nợ',false)};
 }
 if(p.type==='payroll'){
  const days=qty(d.days),rate=amount(d.rate,'Lương mỗi công'),allowance=amount(d.allowance||0,'Phụ cấp'),employerInsurance=amount(d.employerInsurance||0,'BH doanh nghiệp'),employeeInsurance=amount(d.employeeInsurance||0,'BH nhân viên'),deductions=amount(d.deductions||0,'Khấu trừ');
  const gross=amount(Math.round(days*rate)+allowance,'Lương gộp',false),net=gross-employeeInsurance-deductions;
  if(net<0)throw fail('Khấu trừ vượt lương gộp.');
  data={employee:text(d.employee,'nhân viên / mã nhân viên'),days,rate,allowance,employerInsurance,employeeInsurance,deductions,gross,net,cost:amount(gross+employerInsurance,'Chi phí nhân sự')};
 }
 if(p.type==='allocation'){
  if(!['rent','assets','operations','marketing'].includes(d.category)||!Number.isInteger(d.months)||d.months<1||d.months>120||p.date.slice(8)!=='01')throw fail('Chọn nhóm phân bổ, số tháng 1–120 và ngày bắt đầu là đầu tháng.');
  data={name:text(d.name,'nội dung phân bổ'),category:d.category,months:d.months,total:amount(d.total,'Tổng giá trị phân bổ',false)};
 }
 if(p.type==='shift'){
  if(!['morning','afternoon','night','other'].includes(d.code)||!Array.isArray(d.entryIds)||d.entryIds.length>1000||d.entryIds.some(id=>!/^\d+$/.test(String(id))))throw fail('Chọn ca và các nghiệp vụ bàn giao.');
  data={code:d.code,employee:text(d.employee,'người bàn giao'),entryIds:[...new Set(d.entryIds.map(String))],opening:{},counted:{}};
  for(const group of ['opening','counted'])for(const k of ['cash','bank','card','platform']){if(!Number.isSafeInteger(d[group]?.[k])||Math.abs(d[group][k])>1e12)throw fail('Nhập đủ số dư từng quỹ.');data[group][k]=d[group][k];}
 }
 return {...v,data};
}
export const plusDay=(date,days)=>new Date(Date.parse(date)+days*86400000).toISOString().slice(0,10);
export function splitValue(total,n){const base=Math.floor(total/n),extra=total%n;return Array.from({length:n},(_,i)=>base+(i<extra?1:0));}
export function planBook(book,{inventory,entries=[]}={}){
 const b=validateBook(book),d=b.data,plans=[];const add=(kind,amount,date,category,extra={})=>{if(!amount)return;plans.push({...validateFinanceEntry({requestId:b.id,date,kind,amount,category,method:['receipt','payment'].includes(kind)?d.method:'none',description:bookTypes[b.type]+' · '+b.reference,reference:b.reference,duplicateReason:'Dòng liên kết phiếu '+b.id, ...extra}),bookId:b.id});};
 if(b.type==='invoice'){
  add('revenue',d.total-d.vat,b.date,'sales');add('receipt',d.paid,b.date,'sales',{counterparty:d.counterparty});
  for(const l of d.lines.filter(l=>l.issueStock))add('stock',1,b.date,'inventory',{stock:{mode:'out',sku:l.sku,name:l.name,unit:l.unit,quantity:l.quantity,unitCost:0}});
 }
 if(b.type==='stay')splitValue(d.total,(Date.parse(d.checkOut)-Date.parse(d.checkIn))/86400000).forEach((value,i)=>add('revenue',value,plusDay(d.checkIn,i),'room',{bookingCode:b.reference,room:d.room,source:d.source}));
 if(b.type==='payroll')add('expense',d.cost,b.date,'payroll',{counterparty:d.employee});
 if(b.type==='allocation')splitValue(d.total,d.months).forEach((value,i)=>{const t=new Date(b.date+'T00:00:00Z');t.setUTCMonth(t.getUTCMonth()+i);add('expense',value,t.toISOString().slice(0,10),d.category==='assets'?'depreciation':d.category);});
 const baseline=[];
 if(b.type==='stocktake')for(const l of d.lines){const current=inventory?.items.find(v=>v.sku===l.sku),quantity=current?.quantity||0;if(current&&current.unit!==l.unit)throw fail('Đơn vị kiểm kê khác đơn vị tồn kho: '+l.sku);baseline.push({sku:l.sku,quantity});const diff=Math.round((l.counted-quantity)*1000)/1000;if(diff>0&&!l.unitCost)throw fail('Nhập giá vốn phần kiểm kê thừa: '+l.sku);if(diff)add('stock',1,b.date,'inventory',{stock:{mode:diff>0?'in':'loss',sku:l.sku,name:l.name,unit:l.unit,quantity:Math.abs(diff),unitCost:diff>0?l.unitCost:0}});}
 const balances=b.type==='shift'?reconcileDay(entries.filter(e=>d.entryIds.includes(String(e.id))),d.opening,d.counted):null;
 if(balances?.some(r=>r.difference)&&!b.note)throw fail('Giải trình chênh lệch bàn giao ca.');
 if(b.type==='stocktake'&&d.expected&&baseline.some(l=>Math.abs(l.quantity-(d.expected.find(v=>v.sku===l.sku)?.quantity??-1))>1e-8))throw fail('Tồn kho đã thay đổi từ khi lưu kiểm kê. Kiểm tra và lưu lại phiếu trước khi duyệt.');
 return {book:b,entries:plans,baseline,balances};
}
export function bookDebts(books,entries,asOf){return books.filter(b=>b.status==='posted'&&['invoice','stay','receivable','payable'].includes(b.type)).map(b=>{const d=b.data.data||b.data,direction=b.type==='payable'?'payment':'receipt',matched=entries.filter(e=>e.status==='posted'&&e.kind===direction&&e.reference===b.reference&&e.date<=asOf&&e.category!=='deposit'),paid=matched.reduce((n,e)=>n+e.amount,0);return {id:b.id,reference:b.reference,type:b.type,counterparty:d.counterparty,dueDate:d.dueDate,total:d.total,paid,balance:d.total-paid,overdue:d.dueDate<asOf&&d.total>paid,entryIds:matched.map(e=>e.id)};});}
