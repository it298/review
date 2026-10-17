import {financeKinds,financeCategories,financeMethods,isDay,validateFinanceEntry} from '../../../shared/finance.js';
import {FINANCE_BATCH_LIMIT} from '../../../shared/finance-batch.js';
export const GRID_LIMIT=500,BATCH_SIZE=FINANCE_BATCH_LIMIT;
export const gridColumns=[
 {key:'date',label:'Ngày',width:126},{key:'kind',label:'Loại nghiệp vụ',width:160},{key:'category',label:'Hạng mục',width:172},{key:'method',label:'Phương thức',width:152},{key:'amount',label:'Số tiền VND',width:160},{key:'description',label:'Nội dung',width:280},{key:'reference',label:'Số chứng từ',width:154},{key:'bookingCode',label:'Mã booking',width:140},{key:'room',label:'Phòng',width:100},
 {key:'source',label:'Nguồn / đối tác',width:170,extra:true},{key:'counterparty',label:'Người nộp / nhận',width:180,extra:true},{key:'shift',label:'Ca / nhân viên',width:150,extra:true},{key:'depositRef',label:'Mã cọc',width:140,extra:true},{key:'recognizeExpense',label:'Tính chi phí',width:135,extra:true},{key:'duplicateReason',label:'Lý do trùng',width:220,extra:true}
];
const fold=v=>String(v??'').trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
export function enumValue(value,dict){return Object.entries(dict).find(([key,label])=>fold(value)===fold(key)||fold(value)===fold(label))?.[0]??String(value).trim();}
export function parseGridMoney(value){
 if(typeof value==='number')return Number.isSafeInteger(value)?value:NaN;
 let s=String(value??'').trim().replace(/(?:vnd|₫|đ)\s*$/i,'').replace(/[\s\u00a0]/g,'');
 if(/^[-+]?\d+$/.test(s))return Number(s);
 if(/^[-+]?\d{1,3}(?:\.\d{3})+$/.test(s)||/^[-+]?\d{1,3}(?:,\d{3})+$/.test(s))return Number(s.replace(/[.,]/g,''));
 return NaN;
}
export function parseGridDay(value){
 const s=String(value??'').trim();if(isDay(s))return s;
 const m=s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);if(m){const day=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');return isDay(day)?day:s;}
 if(/^\d{5}$/.test(s)&&Number(s)>=20000&&Number(s)<=90000)return new Date(Date.UTC(1899,11,30)+Number(s)*86400000).toISOString().slice(0,10);
 return s;
}
export function blankGridRow(defaults){return {requestId:crypto.randomUUID(),date:defaults.date,kind:defaults.kind||'receipt',category:defaults.category||'room',method:defaults.method||'cash',amount:'',description:'',reference:'',bookingCode:'',room:'',source:'',counterparty:'',shift:'',depositRef:'',duplicateReason:'',recognizeExpense:false,_state:'new',_error:''};}
export function hasGridInput(row){return ['amount','description','reference','bookingCode','room','source','counterparty','shift','depositRef','duplicateReason'].some(key=>String(row[key]??'').trim())||row.recognizeExpense===true;}
export const gridFrozen=row=>['saving','saved','uncertain'].includes(row._state);
export function normalizeGridCell(key,value){
 if(key==='date')return parseGridDay(value);
 if(key==='kind')return enumValue(value,financeKinds);
 if(key==='category')return enumValue(value,financeCategories);
 if(key==='method')return enumValue(value,financeMethods);
 if(key==='recognizeExpense'){if(typeof value==='boolean')return value;const v=fold(value);return ['true','1','co','yes','x'].includes(v)?true:['false','0','khong','no',''].includes(v)?false:String(value);}
 return String(value??'');
}
export function rowPayload(row){return validateFinanceEntry({...Object.fromEntries(gridColumns.map(c=>[c.key,row[c.key]])),requestId:row.requestId,date:parseGridDay(row.date),amount:parseGridMoney(row.amount)});}
const duplicateKey=p=>JSON.stringify([p.date,p.kind,p.amount,p.reference,...(p.reference?[]:[p.category,p.method,p.description,p.bookingCode,p.room,p.source,p.counterparty,p.shift,p.depositRef])]);
export function validateGridRows(rows,{from,to,management=false,locked=()=>false,existing=[]}){
 const results=new Map(),keys=new Map();
 rows.forEach((row,index)=>{if(hasGridInput(row)&&(row._state==='saved'||row._submitted))try{keys.set(duplicateKey(row._submitted||rowPayload(row)),index);}catch{}});
 rows.forEach((row,index)=>{
  if(row._state==='saved'||!hasGridInput(row))return;
  const errors={};const date=parseGridDay(row.date),amount=parseGridMoney(row.amount);
  if(!isDay(date))errors.date='Ngày chưa hợp lệ; dùng dd/mm/yyyy hoặc yyyy-mm-dd.';
  else if(date<from||date>to)errors.date='Ngày nằm ngoài khoảng báo cáo.';
  else if(locked(date))errors.date='Ngày / tháng đã gửi hoặc khóa; cần quản lý mở lại.';
  if(!Object.hasOwn(financeKinds,row.kind)||row.kind==='stock'||!management&&['revenue','expense'].includes(row.kind))errors.kind='Loại nghiệp vụ chưa hợp lệ hoặc không thuộc quyền của bạn.';
  if(!Object.hasOwn(financeCategories,row.category)||['cogs','inventory_loss'].includes(row.category))errors.category='Chọn hạng mục hợp lệ.';
  if(!Object.hasOwn(financeMethods,row.method))errors.method='Chọn phương thức hợp lệ.';
  if(!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>1e12)errors.amount='Nhập số nguyên VND khác 0; không dùng công thức hoặc số thập phân.';
  if(!String(row.description||'').trim()||String(row.description).length>1000)errors.description='Nội dung cần từ 1 đến 1.000 ký tự.';
  for(const key of ['reference','bookingCode','room','source','counterparty','shift','depositRef','duplicateReason'])if(String(row[key]??'').length>200)errors[key]='Tối đa 200 ký tự; rút gọn trước khi lưu để không mất dữ liệu.';
  if(typeof row.recognizeExpense!=='boolean')errors.recognizeExpense='Chọn Có hoặc Không.';
  let payload;try{payload=row._submitted||rowPayload(row);}catch(e){errors.rule=e.message;}
  let sourceIssue=false;for(const c of gridColumns)if(/^#(?:CÔNG THỨC|LỖI EXCEL):/.test(String(row[c.key]??''))){errors[c.key]=String(row[c.key]).replace(/^#(?:CÔNG THỨC|LỖI EXCEL):\s*/,'');sourceIssue=true;}if(sourceIssue)delete errors.rule;
  if(payload&&!row.duplicateReason&&!row._submitted){
   const key=duplicateKey(payload);
   if(keys.has(key)){errors.reference='Giống dòng '+(keys.get(key)+1)+'. Kiểm tra hoặc nhập lý do trùng.';const previous=results.get(rows[keys.get(key)].requestId);if(previous)previous.errors.reference='Giống dòng '+(index+1)+'. Kiểm tra hoặc nhập lý do trùng.';}
   else keys.set(key,index);
   if(payload.reference&&existing.some(e=>e.status!=='void'&&e.date===payload.date&&e.kind===payload.kind&&Number(e.amount)===payload.amount&&e.reference===payload.reference&&e.requestId!==row.requestId))errors.reference='Đã có cùng ngày, chứng từ, loại và số tiền trong sổ.';
  }
  results.set(row.requestId,{index,errors,payload});
 });
 return results;
}
// TSV with quoted tabs/newlines, as copied by Excel. Never evaluate formulas.
export function parseGridTsv(text){
 const rows=[[]];let cell='',quoted=false,atStart=true;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&(quoted||atStart)){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;atStart=false;}
 else if(!quoted&&(c==='\t'||c==='\r'||c==='\n')){rows.at(-1).push(cell);cell='';atStart=true;if(c!=='\t'){if(c==='\r'&&text[i+1]==='\n')i++;rows.push([]);}}
 else{cell+=c;atStart=false;}}
 if(quoted)throw Error('Vùng dán có dấu ngoặc kép chưa đóng.');rows.at(-1).push(cell);
 while(rows.length&&rows.at(-1).every(c=>c===''))rows.pop();return rows;
}
export function pasteGrid(rows,text,startRow,startColumn,defaults){
 if(text.length>1e6)throw Error('Vùng dán quá lớn, tối đa 1 MB / 500 dòng.');
 let matrix=parseGridTsv(text),columns=null;
 const headers=new Map(gridColumns.flatMap(c=>[[fold(c.label),c.key],[fold(c.key),c.key]]));
 for(const [label,key] of [['Ngày phát sinh','date'],['Loại','kind'],['Số tiền','amount'],['Chứng từ','reference'],['Nguồn','source'],['Ca','shift'],['Người nộp/nhận','counterparty']])headers.set(fold(label),key);
 const matched=matrix[0]?.map(v=>headers.get(fold(v)))||[];
 if(matched.filter(Boolean).length>=2){if(matched.some(v=>!v))throw Error('Tiêu đề chưa khớp cột trong bảng. Dùng mẫu cột để tránh bỏ sót dữ liệu.');if(new Set(matched).size!==matched.length)throw Error('Tiêu đề có cột bị lặp.');columns=matched;matrix=matrix.slice(1);}
 if(startRow+matrix.length>GRID_LIMIT)throw Error('Tối đa 500 dòng. Vùng dán chưa được áp dụng; chia thành nhiều đợt.');
 if(matrix.some(r=>r.length>(columns?.length??gridColumns.length-startColumn)))throw Error('Vùng dán vượt số cột. Chọn ô bắt đầu hoặc dùng đúng mẫu cột.');
 const next=rows.slice();while(next.length<startRow+matrix.length)next.push(blankGridRow(defaults));
 matrix.forEach((cells,i)=>{if(gridFrozen(next[startRow+i]))throw Error('Vùng dán chạm dòng đã gửi / đã lưu. Chọn các dòng mới bên dưới.');const row={...next[startRow+i],_error:'',_state:'new'};delete row._submitted;cells.forEach((value,j)=>{const key=columns?columns[j]:gridColumns[startColumn+j].key;row[key]=normalizeGridCell(key,value);});next[startRow+i]=row;});
 return {rows:next,extra:columns?columns.some(k=>gridColumns.find(c=>c.key===k)?.extra):matrix.some(r=>r.length+startColumn>9),count:matrix.length};
}
export function gridDisplay(row,key){const value=row[key];return key==='kind'?financeKinds[value]||value:key==='category'?financeCategories[value]||value:key==='method'?financeMethods[value]||value:key==='recognizeExpense'?value===true?'Có':value===false?'Không':value:value;}
export function copyGrid(rows,range){const escape=v=>/[\t\r\n"]/.test(String(v??''))?'"'+String(v??'').replaceAll('"','""')+'"':String(v??'');return rows.slice(range.top,range.bottom+1).map(row=>gridColumns.slice(range.left,range.right+1).map(c=>escape(gridDisplay(row,c.key))).join('\t')).join('\r\n');}
