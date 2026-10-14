import React, {useState} from 'react';
import {occupancyDays} from './occupancy-days.js';

const count=value=>value==null?'—':Number(value).toLocaleString('vi-VN');
const rate=value=>value==null?'—':`${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:2})}%`;
const width=value=>`${Math.min(100,Math.max(0,Number(value)||0))}%`;

export default function DashboardCharts({payload}){
  const rows=payload.hotels||[],available=rows.filter(row=>row.ok&&row.data?.summary);
  const [hotelId,setHotelId]=useState('');
  const selected=available.find(row=>String(row.hotel.id)===hotelId)||available[0];
  const days=occupancyDays(selected?.data?.roomTypes||[]);
  if(!available.length)return <section className="panel"><h2>Dashboard công suất</h2><p>Chưa có dữ liệu trong khoảng ngày đã chọn để vẽ biểu đồ.</p></section>;
  return <div className="bj-dashboard-charts">
    <section className="panel">
      <div className="panelHeader"><div><h2>Công suất các khách sạn</h2><p>{payload.meta?.from} → {payload.meta?.to} · Một cột cho mỗi khách sạn</p></div><span className="bj-chart-unit">Room-night</span></div>
      <div className="bj-chart-legend"><span><i className="used"/>Đã dùng</span><span><i className="empty"/>Còn trống</span><span><i className="blocked"/>Block</span></div>
      <div className="bj-summary-scroll"><div className="bj-unified-chart" role="group" aria-label="Biểu đồ cột công suất khách sạn">
        <div className="bj-unified-axis">{[1,.75,.5,.25,0].map(t=><span key={t}>{count(Math.ceil(Math.max(1,...available.map(r=>r.data.summary.total))/4)*4*t)}</span>)}</div>
        {rows.map(row=>{const s=row.data?.summary,max=Math.ceil(Math.max(1,...available.map(r=>r.data.summary.total))/4)*4;return <div className="bj-chart-column" key={row.hotel.id}>
          <strong className="bj-unified-rate">{row.ok?rate(s?.occupancyRate):'—'}<small>Công suất</small></strong>
          <div className="bj-unified-track">{row.ok&&s&&<div className="bj-unified-stack" style={{height:width(s.total/max*100)}} aria-label={`${row.hotel.name}: đã dùng ${s.occupied}, trống ${s.empty}, block ${s.blocked}`}>
            {[['used',s.occupied,'Đã dùng'],['empty',s.empty,'Còn trống'],['blocked',s.blocked,'Block']].map(([key,value,label])=>value>0&&<span key={key} className={key} style={{height:width(s.total?value/s.total*100:0)}} title={`${label}: ${count(value)} room-night`}>{value/s.total>=.08?count(value):''}</span>)}
          </div>}</div>
          <b>{row.hotel.name}</b>{row.ok&&s?<><small>Tổng <strong>{count(s.total)}</strong> room-night</small><div className="bj-unified-values"><span>Đã dùng <b>{count(s.occupied)}</b></span><span>Trống <b>{count(s.empty)}</b></span><span>Block <b>{count(s.blocked)}</b></span></div></>:<small>Chưa có dữ liệu</small>}
        </div>})}
      </div></div>
      <p className="muted">Chiều cao cột: tổng room-night. Công suất phía trên: đã dùng / phòng có thể bán, đã trừ block. Đã loại M-Standard.</p>
    </section>
    <details className="panel bj-detail-disclosure"><summary>Xem chi tiết theo loại phòng và ngày</summary>

      <div className="panelHeader"><div><h2>Chi tiết khách sạn</h2><p>Chọn khách sạn để xem loại phòng và công suất theo ngày</p></div><label className="bj-hotel-picker">Khách sạn<select aria-label="Khách sạn biểu đồ công suất" value={String(selected.hotel.id)} onChange={e=>setHotelId(e.target.value)}>{available.map(row=><option value={String(row.hotel.id)} key={row.hotel.id}>{row.hotel.name}</option>)}</select></label></div>
      <h3>Công suất theo loại phòng</h3>
      {(selected.data.roomTypes||[]).length?<div className="tableWrap"><table><thead><tr><th>Loại phòng</th><th>Công suất</th><th>Đã dùng</th><th>Trống</th><th>Block</th><th>Room-night</th></tr></thead><tbody>{selected.data.roomTypes.map(room=><tr key={room.id}><td>{room.name}</td><td><div className="bj-room-rate"><strong>{rate(room.occupancyRate)}</strong><div className="bj-room-track"><span style={{width:width(room.occupancyRate)}}/></div></div></td><td>{count(room.occupied)}</td><td>{count(room.empty)}</td><td>{count(room.blocked)}</td><td>{count(room.total)}</td></tr>)}</tbody></table></div>:<p className="muted">Bluejay chưa trả dữ liệu theo loại phòng.</p>}
      <h3 className="bj-daily-heading">Công suất theo ngày</h3>
      {days.length?<div className="bj-daily-scroll"><div className="bj-daily-chart" style={{gridTemplateColumns:`repeat(${days.length}, minmax(64px,1fr))`}} role="group" aria-label="Biểu đồ cột công suất theo ngày">{days.map(day=><div className="bj-daily-column" key={day.date}><strong>{rate(day.occupancyRate)}</strong><div className="bj-day-track"><span style={{height:width(day.occupancyRate)}}/></div><b>{day.date.slice(8,10)}/{day.date.slice(5,7)}</b><small>{count(day.occupied)} / {count(day.total)}</small></div>)}</div><p className="muted">Nhãn dưới cột: room-night đã dùng / tổng room-night. Di chuột hoặc xem bảng để đọc số chi tiết.</p><details><summary>Xem bảng số liệu theo ngày</summary><div className="tableWrap"><table><thead><tr><th>Ngày</th><th>Công suất</th><th>Đã dùng</th><th>Trống</th><th>Block</th><th>Room-night</th></tr></thead><tbody>{days.map(day=><tr key={day.date}><td>{day.date}</td><td>{rate(day.occupancyRate)}</td><td>{count(day.occupied)}</td><td>{count(day.empty)}</td><td>{count(day.blocked)}</td><td>{count(day.total)}</td></tr>)}</tbody></table></div></details></div>:<p className="muted">Báo cáo này chưa có chi tiết theo ngày. Chọn kiểu báo cáo Theo ngày và khoảng ngày cần theo dõi.</p>}
    </details>
  </div>;
}
