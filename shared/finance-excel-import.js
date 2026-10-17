import {financeKinds,financeCategories,financeMethods} from './finance.js';
import {blankGridRow,gridColumns,entryColumns,normalizeGridCell,parseGridMoney,parseGridDay,validateGridRows,hasExcelDuplicateConfirmation} from './finance-grid.js';

export const EXCEL_FILE_LIMIT=10*1024*1024;
export const fold=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
const clean=v=>String(v??'').trim();
const aliases={date:['ngay','date','ngaythang','ngayphatsinh','ngaygiaodich','transactiondate'],kind:['loai','loainghiepvu','loaithuchi','thuchi','type'],category:['hangmuc','hanmuc','dichvu','nhom','category','khoanmuc'],method:['phuongthuc','hinhthucthanhtoan','phuongthucthanhtoan','paymentmethod'],amount:['sotien','sotienvnd','thanhtien','amount','giatri'],description:['noidung','noidungchi','diengiai','description','ghichu','ghuchu'],reference:['sochungtu','chungtu','sohoadon','mahoadon','reference','voucher'],bookingCode:['mabooking','madatphong','idhethong','bookingid','bookingcode','idphong'],room:['phong','sophong','sophongtt','room'],source:['nguon','nendang','nentang','nguondat','nguondatphong','doitac','nguondoitac'],counterparty:['nguoinopnhan','nguoinop','nguoinhan','khachhang','nhacungcap','doituong'],shift:['ca','nhanvien','canhanvien','caphutrach'],depositRef:['macoc','macoclienket'],recognizeExpense:['tinhchiphi','ghinhanchiphi'],duplicateReason:['lydotrung','lydonhaptrung']};
const exact=new Map(Object.entries(aliases).flatMap(([key,list])=>list.map(a=>[a,key])));
for(const c of gridColumns){exact.set(fold(c.key),c.key);exact.set(fold(c.label),c.key);}
const moneyTarget=(kind,method,category='',source='')=>['money',kind,method,category,source].join('|');
export const importTargets=[{key:'',label:'Bỏ qua cột'},...gridColumns.map(c=>({key:c.key,label:c.label})),...['receipt','payment'].flatMap(kind=>['cash','bank','card','platform'].map(method=>({key:moneyTarget(kind,method),label:financeKinds[kind]+' · '+financeMethods[method]}))),...['cash','bank','card','platform'].map(method=>({key:moneyTarget('receipt',method,'deposit'),label:'Thu cọc mới · '+financeMethods[method]}))];

function direction(text){const s=fold(text);if(/^(bkchi|chikhachsan|bangchi|chiminimart)/.test(s)||s==='chi')return 'payment';if(/^(bkthu|thukhachsan|thuminimart|bangkethutien)/.test(s)||s==='thu')return 'receipt';return '';}
function headerTarget(label,context,kind){
 const s=fold(label),all=fold(context+' '+label);
 if(!s)return {target:'',reason:'Không có tiêu đề'};
 if(/^(tong|tondau|toncuoi|sodu|hoahong|phiquetthe|giamgia|tonghanghuy)/.test(s))return {target:'',reason:'Tổng hợp / khấu trừ, không tự tạo thêm tiền thu–chi'};
 if(/coc/.test(s)&&(/da[oơ]|danhan/.test(all))&&!/chuao/.test(s))return {target:'',reason:'Cọc đã nhận trước đó, tránh tính thu lần hai'};
 if(exact.get(s)==='reference')return {target:'',reason:'Không dùng cột số chứng từ trong bảng thu–chi'};
 if(exact.has(s))return {target:exact.get(s)};
 if(/^date/.test(s))return {target:'date'};
 let method=/shopee|grab/.test(s)?'platform':/taikhoan|tientk|tienck|coctk/.test(s)?'bank':/visa|quetthe|tienthe|thevisa/.test(s)?'card':/tienmat|tientm|thutm|chitm|coctm/.test(s)?'cash':'';
 if(!method&&/^(thu|chi|thutien|chitien)$/.test(s))return {target:moneyTarget(s.startsWith('chi')?'payment':'receipt','')};
 if(method){const k=/^chi/.test(s)?'payment':/^thu/.test(s)?'receipt':kind;return {target:moneyTarget(k,method,/coc/.test(s)&&/chuao/.test(s)?'deposit':'',/grab/.test(s)?'Grab Food':/shopee/.test(s)?'Shopee Food':'')};}
 return {target:'',reason:'Chưa nhận diện; chọn trường tương ứng nếu cần'};
}

// Read Excel's stored results like ordinary values; never execute workbook formulas.
export async function readFinanceExcel(file,XLSX){
 if(!file||!file.size||file.size>EXCEL_FILE_LIMIT||!/[.](xlsx|xls)$/i.test(file.name))throw Error('Chọn file .xlsx hoặc .xls, tối đa 10 MB.');
 if(!XLSX)throw Error('Thiếu bộ đọc Excel.');
 let book;try{book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,cellFormula:true,cellText:true,sheetStubs:true,sheetRows:10002});}catch{throw Error('Không mở được Excel. Kiểm tra file có bị lỗi hoặc đặt mật khẩu không.');}
 if(!book.SheetNames.length||book.SheetNames.length>60)throw Error('File cần từ 1 đến 60 sheet.');
 const date1904=book.Workbook?.WBProps?.date1904===true||book.Workbook?.WBProps?.date1904===1;
 let cellBudget=0;
 const sheets=book.SheetNames.map(name=>{
  const ws=book.Sheets[name],range=XLSX.utils.decode_range(ws['!ref']||'A1');
  if(ws['!fullref']&&XLSX.utils.decode_range(ws['!fullref']).e.r>=10000||range.e.r>=10000||range.e.c>159) return {name,error:'Sheet vượt 10.000 dòng hoặc 160 cột; tách file trước khi nhập.',rows:[]};
  cellBudget+=(range.e.r+1)*(range.e.c+1);if(cellBudget>1500000)throw Error('File có quá nhiều ô; chia nhỏ trước khi tải lên.');
  const rows=[];
  for(let r=0;r<=range.e.r;r++){const cells=[];for(let c=0;c<=range.e.c;c++){const cell=ws[XLSX.utils.encode_cell({r,c})],cacheAvailable=Boolean(cell&&cell.t!=='z'&&cell.v!==undefined&&cell.v!==null);cells.push(cell?{v:cacheAvailable?cell.v:'',f:cell.f||'',text:cacheAvailable?(cell.w??String(cell.v)):'',type:cell.t,cacheAvailable}:null);}rows.push(cells);}
  // Only explicit vertical merges inherit the original date. Blank dates are not filled down.
  const merges=(ws['!merges']||[]).filter(m=>m.s.c===m.e.c&&m.e.r>m.s.r);
  for(const m of merges)for(let r=m.s.r+1;r<=Math.min(m.e.r,range.e.r);r++)if(!rows[r][m.s.c])rows[r][m.s.c]=rows[m.s.r][m.s.c];
  return {name,rows,date1904};
 });
 return {name:file.name,sheets};
}

export function detectFinanceBlocks(sheet,headerOverride){
 if(sheet.error)return [];
 const rows=sheet.rows,limit=Math.min(rows.length,60);let header=headerOverride;
 if(header==null){let best=-1;header=0;for(let r=0;r<limit;r++){const values=rows[r].map(c=>clean(c?.v)),recognized=values.map(v=>headerTarget(v,'','').target),fields=new Set(recognized.filter(Boolean));
   const score=recognized.filter(Boolean).length+(fields.has('date')?8:0)+(fields.has('description')?4:0)+(recognized.some(v=>v==='amount'||v.startsWith('money|'))?6:0);
   if(fields.has('date')&&score>best){best=score;header=r;}
  }}
 const labels=rows[header]?.map(c=>clean(c?.v))||[],starts=labels.map((v,i)=>headerTarget(v,'','').target==='date'?i:-1).filter(i=>i>=0);
 if(!starts.length)starts.push(0);else starts[0]=0;
 return starts.map((start,index)=>{
  let end=starts[index+1]??labels.length,kind='';
  const above=rows.slice(Math.max(0,header-3),header).flatMap(row=>row.slice(start,end).map(c=>clean(c?.v))).filter(Boolean).join(' ');
  kind=rows.slice(Math.max(0,header-3),header).reverse().flatMap(row=>row.slice(start,end).map(c=>direction(c?.v))).find(Boolean)||direction(above)||direction(sheet.name);
  const title=kind==='payment'?'Chi tiền':kind==='receipt'?'Thu tiền':'Bảng nghiệp vụ';
  let depth=1;
  const next=rows[header+1]||[];
  if(labels.some((v,c)=>c>=start&&c<end&&/^(thutienkhachsan|tiencocdanhan)$/.test(fold(v)))&&next.slice(start,end).some(c=>/tien|coc/.test(fold(c?.v))))depth=2;
  const columns=[];const used=new Set();
  for(let c=start;c<end;c++){
   const top=labels[c]||'',bottom=depth===2?clean(next[c]?.v):'',label=bottom||top;
   const hasMoney=columns.some(c=>c.target==='amount'||c.target.startsWith('money|'));
   if(c>start&&hasMoney&&/sobluejay|doanhthutheongay|tonghop|chitieu|tongchi|tongthu/.test(fold(top))){end=c;break;}
   let guessed=headerTarget(label,top,kind);
   if(guessed.target==='description'&&used.has('description')&&/^(ghichu|ghuchu)$/.test(fold(label)))guessed={target:'',reason:'Ghi chú phụ; cột nội dung đã có, có thể ghép lại bằng tay'};
   // A second category/description table at the right belongs to the summary, not the ledger.
   if(['category','description'].includes(guessed.target)&&used.has(guessed.target)){if(hasMoney){end=c;break;}guessed={target:'',reason:'Có cột cùng trường ở trước; chọn lại ghép cột nếu cần'};}
   if(guessed.target)used.add(guessed.target);
   columns.push({index:c,label:label||'Cột '+(c+1),...guessed});
  }
  return {id:sheet.name+':'+start,header,depth,start,end,title,kind,columns};
 }).filter((block,i)=>i===0||block.columns.some(c=>['description','category','reference','bookingCode'].includes(c.target)));
}

export function guessCategory(value){
 const s=fold(value),direct=normalizeGridCell('category',clean(value));if(Object.hasOwn(financeCategories,direct))return direct;
 if(/^(?:chi)?boithuong(?:kh|khach|khachhang)$/.test(s))return 'compensation';
 if(/^(?:casual(?:hk|housekeeping)?|(?:chi)?tiencasual(?:hk)?)$/.test(s))return 'payroll';
 // These exact source labels include the spelling used in the Sontra rent ledger.
 if(/^(?:chi)?thue(?:khachsan|khacsan)$/.test(s))return 'rent';
 if(/^(tienquetthe(?:thangnay|thangtruoc)?|doisoat(?:tien)?the|quyettoan(?:tien)?the|chuyentienthe(?:venganhang|vetaikhoan)?)$/.test(s))return 'card_settlement';
 if(/^(dichvuks|dvks|dichvukhachsan)$/.test(s)||/^(?:ke)?(?:dem|giuong)phu|^extrabed|^phuthutreem/.test(s))return 'hotel_service';
 if(/^(phichuyenkhoan|phinganhang|phichuyentien|phiduytritaikhoan)/.test(s))return 'bank_fee';
 if(/^(laitiengui|lainganhang|laitaikhoan)/.test(s))return 'interest_income';
 const rules=[['deposit',/tiencoc|cocphong|datcoc/],['minibar',/minibar/],['laundry',/giatui|giatla/],['outside_service',/dichvungoai|dvthuexe|dvxemay|dvx[e]?oto/],['room',/tienphong|thuphong|doanhthuphong|nanghangphong|langhangphong/],['sales',/banhang|thuminimart/],['commission',/hoahong/],['card_fee',/phiquetthe|phithe/],['inventory',/muahanghoa|nhaphang|hanghoank/],['assets',/tscd|taisan|ccdc|congcudungcu/],['repair',/suachua|baoduong/],['payroll',/luong|nhansu|baohiem|bhxh|thuongnv|thuongnhanvien/],['rent',/thuenha|thuematbang/],['tax',/thue(gtgt|tn|monbai)|nopthue/],['marketing',/marketing|maketing|quangcao/],['refund',/hoantien/],['funding',/nhapquy|gopvon/],['withdrawal',/rutquy|trachudautu/],['operations',/diennuoc|tienmang|vesinh|vattu|vanhanh|dvketoan/],['other',/^(khac|chikhac|thukhac|chiphikhac)$/]];
 return rules.find(([,re])=>re.test(s))?.[0]||'';
}
export function guessMethod(value){const v=normalizeGridCell('method',value);if(Object.hasOwn(financeMethods,v))return v;const s=fold(value);return /^(tm|tienmat|cash)$/.test(s)?'cash':/^(tk|ck|chuyenkhoan|taikhoan|banktransfer|nganhang)$/.test(s)?'bank':/^(visa|mastercard|quetthe|tienthe|card)$/.test(s)?'card':/^(ota|grab|shopee|nentang)$/.test(s)?'platform':'';}
function guessKind(value){const v=normalizeGridCell('kind',value);if(Object.hasOwn(financeKinds,v))return v;const s=fold(value);return /^(thu|income|credit)$/.test(s)?'receipt':/^(chi|expense|debit)$/.test(s)?'payment':v;}
const missingFormulaResult=cell=>Boolean(cell?.f&&(cell.cacheAvailable===false||cell.v===undefined||cell.v===null));
function valueOf(cell,key,date1904,allowCached){
 if(!cell)return '';
 if(cell.f&&!allowCached)return '#CÔNG THỨC: cần xác nhận dùng kết quả đã lưu';
 if(missingFormulaResult(cell))return '#LỖI EXCEL: Công thức chưa có kết quả đã lưu; mở Excel, tính và lưu lại file hoặc nhập giá trị thủ công.';
 if(cell.type==='e')return '#LỖI EXCEL: '+cell.text;
 if(key==='date'&&typeof cell.v==='number'){if(!Number.isFinite(cell.v)||cell.v<1||cell.v>2957000)return clean(cell.v);return date1904?new Date(Date.UTC(1904,0,1)+Math.floor(cell.v)*86400000).toISOString().slice(0,10):parseGridDay(String(Math.floor(cell.v)));}
 if(['bookingCode','reference','room','depositRef'].includes(key)&&typeof cell.v==='number'&&/^[0-9]+$/.test(cell.text))return cell.text;
 return cell.v;
}
const totalLabel=v=>/^(tong|tongcong|tongthu|tongchi|cong|sodudauky|soducuoiky|tondau|toncuoi|tonghop)([0-9]*)$/.test(fold(v));
export function previewFinanceImport(sheet,blocks,{management=false,defaultKind='',defaultMethod='',defaultDate='',allowCached=true,from,to}={}){
 const entries=[],skipped=[],warnings=[];
 for(const block of blocks){
  const mapped=block.columns.filter(c=>c.target),fields=mapped.filter(c=>!c.target.startsWith('money|')),monies=mapped.filter(c=>c.target.startsWith('money|')||c.target==='amount');
  const repeats=fields.filter((c,i)=>fields.findIndex(v=>v.target===c.target)!==i);if(repeats.length){warnings.push(block.title+': một trường được gán nhiều cột.');continue;}
  if(!fields.some(c=>c.target==='date')&&!defaultDate){warnings.push(block.title+': chưa chọn cột ngày hoặc ngày mặc định.');continue;}
  if(!monies.length){warnings.push(block.title+': chưa chọn cột số tiền.');continue;}
  for(let r=block.header+block.depth;r<sheet.rows.length;r++){
   const source=sheet.rows[r],selected=mapped.map(c=>source[c.index]);if(selected.every(c=>!clean(c?.v)&&!c?.f))continue;
   const rawFields=Object.fromEntries(fields.map(c=>[c.target,valueOf(source[c.index],c.target,sheet.date1904,allowCached)]));
   if(aliases.date.includes(fold(rawFields.date))&&fields.filter(c=>exact.has(fold(source[c.index]?.v))).length>=2){skipped.push({row:r+1,block:block.title,reason:'Hàng tiêu đề lặp / tiêu đề ô gộp'});continue;}
   if(totalLabel(rawFields.date)||totalLabel(rawFields.description)||(!clean(rawFields.date)&&!clean(rawFields.description)&&!clean(rawFields.category)&&!clean(rawFields.reference)&&!clean(rawFields.bookingCode))){skipped.push({row:r+1,block:block.title,reason:'Dòng tổng / không có ngày, nội dung hay chứng từ'});continue;}
   const rawDate=clean(rawFields.date)||defaultDate,date=parseGridDay(rawDate),rawCategory=clean(rawFields.category);
   // Entirely blank amounts do not create a zero-value transaction.
   for(const col of monies){const cell=source[col.index];if(!cell||!cell.f&&!clean(cell.v))continue;
    const raw=valueOf(cell,'amount',sheet.date1904,allowCached),amount=parseGridMoney(raw);if(amount===0){skipped.push({row:r+1,block:block.title,reason:'Số tiền bằng 0',column:col.index+1});continue;}
    const [,fixedKind,fixedMethod,fixedCategory,fixedSource]=col.target.split('|');
    const kind=fixedKind||guessKind(rawFields.kind||'')||block.kind||defaultKind;
    const mappedCategory=rawCategory?(guessCategory(rawCategory)||rawCategory):'';
    const category=fixedCategory||(mappedCategory==='hotel_service'?(guessCategory(rawFields.description||'')||mappedCategory):mappedCategory)||guessCategory(rawFields.description||'');
    const method=fixedMethod||(clean(rawFields.method)?guessMethod(rawFields.method)||clean(rawFields.method):(['revenue','expense','deposit_use'].includes(kind)?'none':defaultMethod));
    const row={...blankGridRow({date,kind,category,method}),...rawFields,date,kind,category,method,amount:Number.isSafeInteger(amount)?amount:clean(raw),description:clean(rawFields.description),source:fixedSource||clean(rawFields.source),recognizeExpense:rawFields.recognizeExpense==null?false:normalizeGridCell('recognizeExpense',rawFields.recognizeExpense)};
    if(!row.description&&rawCategory)row.description=rawCategory;
    for(const c of gridColumns)if(!['recognizeExpense','amount'].includes(c.key))row[c.key]=clean(row[c.key]);
    row._importSource={sheet:sheet.name,row:r+1,column:col.index+1,label:col.label};
    const validation=validateGridRows([row],{from:from||'1900-01-01',to:to||'2100-12-31',management}).get(row.requestId);
    entries.push({row,errors:validation?.errors||{},cached:Boolean(cell.f||fields.some(c=>source[c.index]?.f)),missingFormula:missingFormulaResult(cell)||fields.some(c=>missingFormulaResult(source[c.index]))});
   }
  }
 }
 // Check the full sheet as well as individual fields: repeated business values
 // must be visible before the user transfers a portion into the grid.
 const validation=validateGridRows(entries.map(e=>e.row),{from:from||'1900-01-01',to:to||'2100-12-31',management});
 for(const entry of entries)entry.errors=validation.get(entry.row.requestId)?.errors||entry.errors;
 const invalid=entries.filter(e=>Object.keys(e.errors).length).length;
 return {entries,skipped,warnings,invalid,cached:entries.filter(e=>e.cached).length,missingFormula:entries.filter(e=>e.missingFormula).length,receipts:entries.filter(e=>e.row.kind==='receipt'&&Number.isSafeInteger(e.row.amount)).reduce((s,e)=>s+e.row.amount,0),payments:entries.filter(e=>e.row.kind==='payment'&&Number.isSafeInteger(e.row.amount)).reduce((s,e)=>s+e.row.amount,0)};
}

export async function identifyImportedRows(entries,unit){
 return Promise.all(entries.map(async entry=>{
  const row=entry.row||entry,origin=row._importSource,canonical=entryColumns.map(c=>c.key==='duplicateReason'&&hasExcelDuplicateConfirmation(row)?'':row[c.key]);
  const bytes=new TextEncoder().encode(JSON.stringify(['vjh-finance-import-v1',unit,origin,canonical]));
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).slice(0,16);digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128;
  const h=digest.map(v=>v.toString(16).padStart(2,'0')).join(''),requestId=h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  return {...row,requestId};
 }));
}
