import {reportFontData} from '../../lib/report-export.js';
const money=n=>n.toLocaleString('vi-VN'),stamp=s=>new Date(s).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export async function exportPayablesExcel({from,to,groups,rows}){
 const XLSX=await import('@e965/xlsx'),book=XLSX.utils.book_new();
 const title=[['VISTA JOURNEY | DƯ NỢ THEO BLUEJAY'],['Kỳ báo cáo',from,to],['Chưa đối soát riêng hoa hồng và khoản OTA chuyển tiền'],[]];
 const totals=groups.reduce((s,g)=>s.map((v,i)=>v+g[['count','totalPrice','payment','balance','deposit'][i]]),[0,0,0,0,0]);
 const summary=XLSX.utils.aoa_to_sheet([...title,['Khách sạn','Nguồn','Booking','Tổng tiền VND','Thanh toán VND','Dư nợ VND','Đặt cọc VND','Ghi nhận'],...groups.map(g=>[g.hotelName,g.source,g.count,g.totalPrice,g.payment,g.balance,g.deposit,stamp(g.capturedAt)]),['Tổng theo bộ lọc','',...totals,'']]);
 const detail=XLSX.utils.aoa_to_sheet([...title,['Khách sạn','Nguồn','Mã booking','Channel Code','Loại phòng','Trạng thái','Nhận phòng','Trả phòng','Tổng VND','Thanh toán VND','Dư nợ VND','Đặt cọc VND','City Ledger','Ghi nhận'],...rows.map(r=>[r.hotelName,r.source,r.bookingCode,r.channelCode,r.roomType,r.status,r.checkInDay,r.checkOutDay,r.totalPrice,r.payment,r.balance,r.deposit,r.cityLedger,stamp(r.capturedAt)])]);
 summary['!cols']=[{wch:28},{wch:22},{wch:12},...Array.from({length:4},()=>({wch:20})),{wch:27}];detail['!cols']=Array.from({length:14},(_,i)=>({wch:[0,4,13].includes(i)?28:20}));
 XLSX.utils.book_append_sheet(book,summary,'Tổng hợp');XLSX.utils.book_append_sheet(book,detail,'Booking');XLSX.writeFile(book,`cong-no-bluejay-${from}_${to}.xlsx`);
}
export async function exportPayablesPdf({from,to,groups}){
 const {jsPDF}=await import('jspdf'),doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});doc.addFileToVFS('NotoSans.ttf',await reportFontData());doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans');
 const widths=[57,38,16,38,38,38,48],labels=['Khách sạn','Nguồn','Booking','Tổng tiền','Thanh toán','Dư nợ','Ghi nhận'];let y;
 const text=(v,x,y,size=8)=>{doc.setFontSize(size);doc.text(String(v),x,y);};
 function head(){doc.setTextColor('#624582');text('VISTA JOURNEY | CÔNG NỢ THEO BLUEJAY',12,17,17);text('Kỳ báo cáo: '+from+' - '+to+' | VND',12,27,9);text('Chưa đối soát riêng hoa hồng và khoản OTA chuyển tiền.',12,34,8);doc.setFillColor('#624582');doc.rect(12,43,273,9,'F');doc.setTextColor('#ffffff');let x=12;labels.forEach((s,i)=>{text(s,x+2,49,7);x+=widths[i];});y=52;doc.setTextColor('#362844');}
 const totals=groups.reduce((s,g)=>s.map((v,i)=>v+g[['count','totalPrice','payment','balance'][i]]),[0,0,0,0]);
 head();for(const g of [...groups,{hotelName:'Tổng theo bộ lọc',source:'',count:totals[0],totalPrice:totals[1],payment:totals[2],balance:totals[3],capturedAt:null}]){doc.setFontSize(7);const values=[g.hotelName,g.source,g.count,money(g.totalPrice),money(g.payment),money(g.balance),g.capturedAt?stamp(g.capturedAt):''].map((v,i)=>doc.splitTextToSize(String(v),widths[i]-5)),h=Math.max(16,...values.map(lines=>lines.length*4+6));if(y+h>187){doc.addPage();head();}let x=12;values.forEach((v,i)=>{text(v.join('\n'),x+2,y+6,7);x+=widths[i];});doc.setDrawColor('#e9e2ed');doc.line(12,y+h,285,y+h);y+=h;}
 for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);text('Dữ liệu báo cáo Bluejay đã lưu | '+i+'/'+doc.getNumberOfPages(),12,201,7);}doc.save(`cong-no-bluejay-${from}_${to}.pdf`);
}
