import {numeric} from '../../lib/circular-chart.js';
import {occupancyDays} from './occupancy-days.js';
import {summarizeBookings} from './reservation-summary.js';
import {bookingColor} from './booking-colors.js';
const number=(key,label,format='number')=>({key,label,format});
const text=(key,label)=>({key,label});
const occupancyColumns=[number('occupancyRate','Công suất %','percent'),number('occupied','Đã dùng'),number('empty','Còn trống'),number('blocked','Block'),number('total','Room-night')];
const amounts=['roomPrice','servicePrice','totalPrice','payment','balance','deposit'];
const amountLabels=['Tiền phòng','Tiền dịch vụ','Tổng booking','Đã thanh toán','Còn lại','Đặt cọc'];
const sourceName=value=>value==='live'?'Mới từ API':value==='cache'?'Bản đã lưu':value||'—';
const stamp=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):null;
function occupancyParts(s){return [{label:'Đã dùng',value:s.occupied,color:'#765493'},{label:'Còn trống',value:s.empty,color:'#c5a45d'},{label:'Block',value:s.blocked,color:'#aab4bf'}];}
function reportBase(payload,kind,title){const filters=payload.reportFilters||payload.meta||{};return {kind,title,from:filters.from||'—',to:filters.to||'—',dateType:filters.dateType||'1',generatedAt:new Date().toISOString(),sections:[],charts:[]};}
const completeSum=(rows,key)=>rows.length&&rows.every(r=>numeric(r[key])!=null)?rows.reduce((s,r)=>s+Number(r[key]),0):null;
export function dashboardReport(payload,{hotelId='all',mode='rooms'}={}){
 const report=reportBase(payload,'dashboard','DASHBOARD CÔNG SUẤT'),hotels=(payload.hotels||[]).filter(r=>hotelId==='all'||String(r.hotel.id)===String(hotelId));
 const available=hotels.filter(r=>r.ok&&r.data?.summary),summaries=available.map(r=>r.data.summary);
 report.scope=hotelId==='all'?'Tất cả khách sạn':hotels[0]?.hotel.name||'Khách sạn đã chọn';report.view=mode==='rooms'?'Theo loại phòng':'Tổng khách sạn';report.dateLabel=report.dateType==='2'?'Theo tháng':'Theo ngày';
 report.notes=[`Có dữ liệu ${available.length}/${hotels.length} khách sạn trong phạm vi. Tổng chỉ tính khách sạn đọc được; chưa có dữ liệu để trống.`,`Miếng tròn: room-night đã dùng / trống / block. Công suất = đã dùng / phòng có thể bán sau khi trừ block. Đã loại M-Standard.`,`Bảng theo ngày giữ toàn bộ kỳ đã tải; bộ chọn ngày trong phần chi tiết chỉ thay đổi biểu đồ xem trên màn hình.`];
 const total=completeSum(summaries,'total'),occupied=completeSum(summaries,'occupied'),blocked=completeSum(summaries,'blocked'),empty=completeSum(summaries,'empty');
 const occupancyRate=summaries.length===1?numeric(summaries[0].occupancyRate):occupied!=null&&total!=null&&blocked!=null&&total>blocked?Math.round(occupied/(total-blocked)*10000)/100:null;
 report.kpis=[{label:'Công suất',value:occupancyRate,format:'percent'},{label:'Đã dùng',value:occupied},{label:'Còn trống',value:empty},{label:'Block',value:blocked},{label:'Tổng room-night',value:total}];
 report.sections.push({title:'Tổng hợp theo khách sạn',columns:[text('hotel','Khách sạn'),...occupancyColumns,text('state','Dữ liệu'),text('savedAt','Ghi nhận')],rows:hotels.map(r=>({hotel:r.hotel.name,...Object.fromEntries(occupancyColumns.map(c=>[c.key,r.ok?numeric(r.data?.summary?.[c.key]):null])),state:r.ok&&r.data?.summary?sourceName(r.source):'Chưa có dữ liệu',savedAt:stamp(r.savedAt)}))});
 const roomRows=available.flatMap(r=>(r.data.roomTypes||[]).map(room=>({hotel:r.hotel.name,room:room.name,...Object.fromEntries(occupancyColumns.map(c=>[c.key,numeric(room[c.key])]))})));
 report.sections.push({title:'Công suất theo loại phòng',columns:[text('hotel','Khách sạn'),text('room','Loại phòng'),...occupancyColumns],rows:roomRows});
 report.sections.push({title:'Chi tiết từng ngày',columns:[text('hotel','Khách sạn'),text('date','Ngày'),...occupancyColumns],rows:available.flatMap(r=>occupancyDays(r.data.roomTypes||[]).map(d=>({hotel:r.hotel.name,...d})))});
 report.charts=available.flatMap(r=>mode==='rooms'?(r.data.roomTypes||[]).map(room=>({title:r.hotel.name+' · '+room.name,data:occupancyParts(room),center:room.occupancyRate,centerFormat:'percent',centerLabel:'Công suất bán'})):[{title:r.hotel.name,data:occupancyParts(r.data.summary),center:r.data.summary.occupancyRate,centerFormat:'percent',centerLabel:'Công suất bán'}]);
 return structuredClone(report);
}
export function reservationsReport(payload,rows,{search='',status=''}={}){
 const report=reportBase(payload,'reservations','BÁO CÁO ĐẶT PHÒNG'),summary=summarizeBookings(rows);
 report.hotelId=payload.hotel?.id;report.scope=payload.hotel?.name||'Khách sạn';report.view='Tìm kiếm: '+(search||'Không lọc')+' | Trạng thái: '+(status||'Tất cả');report.dateLabel=({'0':'Ngày nhận','1':'Ngày trả','2':'Ngày đặt','3':'Đêm ở'})[report.dateType]||'Loại ngày đã tải';
 report.notes=[`Dữ liệu ${sourceName(payload.source)}; ghi nhận: ${stamp(payload.savedAt)||'—'}. Đã loại M-Standard.`,`Mỗi dòng là lượt phòng. Số booking đếm mã duy nhất; số booking giữa các nhóm không cộng lại để lấy tổng.`,`${summary.unknownBookingRows} dòng thiếu mã booking, chưa tính vào số booking. Số tiền thiếu để trống, không đổi thành 0.`,`Tiền là giá trị cả kỳ lưu trú của booking, gồm cả đêm ngoài khoảng chọn; không phải doanh thu ngày hoặc ADR. Hủy / no-show là trạng thái hiện tại trong báo cáo, không phải sự kiện phát sinh theo ngày.`];
 report.kpis=[{label:'Số booking',value:summary.bookings},{label:'Lượt phòng',value:summary.roomRows},...amounts.map((key,i)=>({label:amountLabels[i],value:summary.totals[key],format:'money'}))];
 const groupColumns=[text('label','Nhóm'),number('bookings','Booking'),number('roomRows','Lượt phòng'),number('roomPrice','Tiền phòng VND','money')];
 report.sections.push({title:'Theo nền tảng / nguồn',columns:groupColumns,rows:summary.sources},{title:'Theo trạng thái phòng',columns:groupColumns,rows:summary.statuses});
 report.sections.push({title:'Danh sách đặt phòng',columns:[text('bookingCode','Mã booking'),text('guestName','Khách'),text('roomType','Loại phòng'),text('roomName','Phòng'),text('source','Nguồn'),text('status','Trạng thái'),text('checkInTime','Nhận phòng'),text('checkOutTime','Trả phòng'),number('night','Số đêm')],rows});
 report.sections.push({title:'Chi tiết số tiền theo dòng phòng',columns:[text('bookingCode','Mã booking'),text('roomName','Phòng'),...amounts.map((key,i)=>number(key,amountLabels[i]+' VND','money'))],rows});
 report.charts=[{title:'Đặt phòng theo nền tảng / nguồn',data:summary.sources.map(g=>({label:g.label,value:g.roomRows,color:bookingColor(g.label)})),center:summary.roomRows,centerLabel:'Lượt phòng'},{title:'Trạng thái phòng trong booking',data:summary.statuses.map(g=>({label:g.label,value:g.roomRows,color:bookingColor(g.label)})),center:summary.roomRows,centerLabel:'Lượt phòng'}];
 // Snapshot only the columns included in the report, without retaining live UI rows.
 report.sections=report.sections.map(section=>({...section,rows:section.rows.map(row=>Object.fromEntries(section.columns.map(c=>[c.key,c.format?numeric(row[c.key]):row[c.key]==null?null:String(row[c.key])])))}));
 return structuredClone(report);
}
