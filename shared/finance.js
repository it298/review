export const financeKinds={receipt:'Thu tiền',payment:'Chi tiền',revenue:'Ghi nhận doanh thu',expense:'Chi phí / phân bổ chưa chi tiền'};
export const financeMethods={cash:'Tiền mặt',bank:'Chuyển khoản',card:'Thẻ',platform:'Nền tảng',none:'Không thu/chi tiền'};
export const financeCategories={room:'Tiền phòng',minibar:'Minibar',laundry:'Giặt ủi',outside_service:'Dịch vụ ngoài',sales:'Bán hàng',other:'Khác',deposit:'Cọc khách hàng',inventory:'Nhập hàng / tồn kho',assets:'Tài sản / công cụ',operations:'Vận hành',repair:'Sửa chữa / bảo dưỡng',payroll:'Nhân sự',rent:'Thuê mặt bằng',marketing:'Marketing',tax:'Thuế',commission:'Hoa hồng nền tảng',card_fee:'Phí thẻ',refund:'Hoàn tiền khách',funding:'Nhập quỹ / vốn',withdrawal:'Rút quỹ / trả chủ đầu tư'};
export const isDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const fail=m=>Object.assign(new Error(m),{status:400});
export function validateFinanceEntry(input){
 const p=input||{};
 if(!Object.hasOwn(financeKinds,p.kind)||!Object.hasOwn(financeCategories,p.category)||!Object.hasOwn(financeMethods,p.method)||!isDay(p.date))throw fail('Chọn loại nghiệp vụ, hạng mục, phương thức và ngày hợp lệ.');
 if(!Number.isSafeInteger(p.amount)||p.amount===0||Math.abs(p.amount)>1000000000000)throw fail('Số tiền VND phải là số nguyên khác 0, tối đa 1.000 tỷ.');
 if(typeof p.description!=='string'||!p.description.trim()||p.description.length>1000)throw fail('Nhập nội dung từ 1 đến 1.000 ký tự.');
 if(!/^[0-9a-f-]{36}$/i.test(p.requestId||''))throw fail('Thiếu mã chống gửi lặp. Tải lại biểu mẫu.');
 if(['revenue','expense'].includes(p.kind)?p.method!=='none':p.method==='none')throw fail('Nghiệp vụ thu/chi cần phương thức thanh toán; doanh thu/phân bổ chọn Không thu/chi tiền.');
 if(p.recognizeExpense===true&&(p.kind!=='payment'||['deposit','funding','withdrawal','inventory','assets','refund'].includes(p.category)))throw fail('Khoản này cần xử lý riêng, không tự tính toàn bộ vào chi phí HĐKD.');
 if(p.kind==='revenue'&&!['room','minibar','laundry','outside_service','sales','other','commission','card_fee'].includes(p.category))throw fail('Cọc, vốn, hàng tồn kho và tài sản không phải doanh thu.');
 if(p.kind==='expense'&&['deposit','funding','withdrawal','inventory','assets','refund','room','sales'].includes(p.category))throw fail('Chọn đúng hạng mục chi phí / phân bổ.');
 const out={kind:p.kind,category:p.category,method:p.method,date:p.date,amount:p.amount,description:p.description.trim(),requestId:p.requestId,recognizeExpense:p.recognizeExpense===true};
 for(const key of ['reference','bookingCode','room','source']){if(p[key]!=null&&typeof p[key]!=='string')throw fail('Thông tin chứng từ không hợp lệ.');out[key]=(p[key]||'').trim().slice(0,200);}
 return out;
}
export function financeSummary(entries){
 const posted=entries.filter(e=>e.status==='posted'),sum=kind=>posted.filter(e=>e.kind===kind).reduce((s,e)=>s+Number(e.amount),0);
 const receipts=sum('receipt'),payments=sum('payment'),revenue=sum('revenue'),expenses=sum('expense')+posted.filter(e=>e.kind==='payment'&&e.recognizeExpense).reduce((s,e)=>s+Number(e.amount),0);
 const days=new Map(),categories=new Map();
 for(const e of posted){if(!days.has(e.date))days.set(e.date,{date:e.date,receipts:0,payments:0,revenue:0,expenses:0});const d=days.get(e.date);if(e.kind==='receipt')d.receipts+=e.amount;if(e.kind==='payment')d.payments+=e.amount;if(e.kind==='revenue')d.revenue+=e.amount;if(e.kind==='expense'||e.kind==='payment'&&e.recognizeExpense)d.expenses+=e.amount;
 const key=e.kind+':'+e.category;if(!categories.has(key))categories.set(key,{kind:e.kind,category:e.category,amount:0});categories.get(key).amount+=e.amount;}
 return {receipts,payments,cashChange:receipts-payments,revenue:posted.some(e=>e.kind==='revenue')?revenue:null,expenses,provisionalResult:posted.some(e=>e.kind==='revenue')?revenue-expenses:null,drafts:entries.filter(e=>e.status==='draft').length,posted:posted.length,days:[...days.values()].map(d=>({...d,revenue:posted.some(e=>e.date===d.date&&e.kind==='revenue')?d.revenue:null})).sort((a,b)=>a.date.localeCompare(b.date)),categories:[...categories.values()]};
}
