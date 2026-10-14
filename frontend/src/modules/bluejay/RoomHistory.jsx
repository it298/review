import React,{useState} from 'react';
import {monthRange,roomHistory} from './room-history.js';
const count=n=>n.toLocaleString('vi-VN');
export default function RoomHistory({payload,onExport}) {
  const [room,setRoom]=useState('all');
  const filters=payload.reportFilters||{},month=filters.from?.slice(0,7),range=monthRange(month||'');
  if(!range||filters.dateType!=='3'||filters.from!==range.from||filters.to!==range.to)return <section className="panel bj-room-history"><h2>Lịch sử nguồn đặt theo phòng / tháng</h2><p>Chọn tháng và nhấn “Xem lịch sử tháng” phía trên để lấy đủ các booking có đêm lưu trú trong tháng đó.</p></section>;
  const rows=payload.data?.rows||[],rooms=[...new Set(rows.map(r=>r.roomName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  const chosen=rooms.includes(room)?room:'all',data=roomHistory(rows,month,chosen);
  const headers=['Mã booking','Phòng','Loại phòng','Nguồn','Trạng thái','Nhận phòng','Trả phòng','Từ đêm trong tháng','Đến (không gồm đêm này)','Đêm giao tháng','Đêm đặt trong tháng'];
  const csv=data.rows.map(r=>[r.bookingCode,r.roomName,r.roomType,r.source,r.status,r.checkInTime,r.checkOutTime,r.monthFrom,r.monthTo,r.overlapNights,r.bookedNights]);
  return <section className="panel bj-room-history"><div className="panelHeader"><div><h2>Lịch sử nguồn đặt theo phòng / tháng</h2><p>{month} · {payload.hotel?.name} · theo bản ghi hiện tại từ PMS</p></div><label>Số phòng<select aria-label="Phòng trong lịch sử tháng" value={chosen} onChange={e=>setRoom(e.target.value)}><option value="all">Tất cả phòng</option>{rooms.map(r=><option key={r}>{r}</option>)}</select></label><button className="ghost" onClick={()=>onExport(`room-history-${payload.hotel?.id}-${month}.csv`,headers,csv)}>Xuất lịch sử CSV</button></div>
    <p className="muted">Đêm đặt chỉ gồm đã xác nhận, đã nhận và đã trả phòng; giữ phòng, hủy, không đến và trạng thái khác tách riêng. Đêm trả phòng không được tính. Đây là đêm theo booking, không phải công suất thực tế; booking trùng lịch có thể làm số đêm vượt sức chứa. Bảng này không ghi lại lịch sử đổi phòng.</p>
    {data.invalidDates>0&&<p className="muted">{count(data.invalidDates)} dòng có ngày không hợp lệ, chưa tính vào lịch sử.</p>}
    <div className="tableWrap"><table><thead><tr><th>Nguồn đặt</th><th>Booking</th><th>Lượt phòng</th><th>Đêm đặt trong tháng</th><th>Dòng trạng thái khác</th></tr></thead><tbody>{data.groups.map(g=><tr key={g.source}><td>{g.source}</td><td>{count(g.bookings)}</td><td>{count(g.roomRows)}</td><td>{count(g.bookedNights)}</td><td>{count(g.excludedRows)}</td></tr>)}</tbody></table></div>
    <div className="tableWrap"><table><thead><tr><th>Mã booking</th><th>Phòng</th><th>Nguồn</th><th>Trạng thái</th><th>Nhận phòng</th><th>Trả phòng</th><th>Đêm giao tháng</th><th>Đêm đặt trong tháng</th></tr></thead><tbody>{data.rows.map((r,i)=><tr key={`${r.bookingCode}-${r.roomName}-${i}`}><td>{r.bookingCode||'—'}</td><td>{r.roomName||'Chưa xếp phòng'}</td><td>{r.source||'Chưa xác định'}</td><td>{r.status||'Chưa xác định'}</td><td>{r.checkInTime}</td><td>{r.checkOutTime}</td><td>{count(r.overlapNights)}</td><td>{r.included?count(r.bookedNights):'Không tính'}</td></tr>)}</tbody></table></div>
    {!data.rows.length&&<p className="muted">Không có booking có đêm lưu trú thuộc tháng này cho phòng đã chọn.</p>}
  </section>;
}
