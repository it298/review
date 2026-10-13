import React, {useState} from 'react';
import {occupancyDays} from './occupancy-days.js';

const count=value=>value==null?'—':Number(value).toLocaleString('vi-VN');
const rate=value=>value==null?'—':`${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:2})}%`;
const width=value=>`${Math.min(100,Math.max(0,Number(value)||0))}%`;
const colors=['#674982','#b58c43','#477e83','#886d9c'];

export default function DashboardCharts({payload}){
  const rows=payload.hotels||[],available=rows.filter(row=>row.ok&&row.data?.summary);
  const [hotelId,setHotelId]=useState('');
  const selected=available.find(row=>String(row.hotel.id)===hotelId)||available[0];
  const days=occupancyDays(selected?.data?.roomTypes||[]);
  if(!available.length)return <section className="panel"><h2>Dashboard công suất</h2><p>Chưa có dữ liệu trong khoảng ngày đã chọn để vẽ biểu đồ.</p></section>;
  return <div className="bj-dashboard-charts">
    <section className="panel">
      <div className="panelHeader"><div><h2>Công suất các khách sạn</h2><p>Cùng thang 0–100% · {payload.meta?.from} → {payload.meta?.to}</p></div><span className="bj-chart-unit">% công suất</span></div>
      <div className="bj-column-chart" role="group" aria-label="Biểu đồ cột công suất khách sạn">
        <div className="bj-chart-ticks">{[100,75,50,25,0].map(t=><span key={t}>{t}%</span>)}</div>
        <div className="bj-chart-columns" style={{gridTemplateColumns:`repeat(${rows.length}, minmax(0,1fr))`}}>
          {rows.map((row,i)=><div className="bj-chart-column" key={row.hotel.id}>
            <div className="bj-column-track"><div className="bj-column-fill" style={{height:row.ok?width(row.data?.summary?.occupancyRate):'0%',background:colors[i%colors.length]}}/><strong>{row.ok?rate(row.data?.summary?.occupancyRate):'—'}</strong></div>
            <b>{row.hotel.name}</b><small>{row.ok?`${count(row.data?.summary?.occupied)} đã dùng / ${count(row.data?.summary?.total)} room-night`:'Chưa có dữ liệu'}</small>
          </div>)}
        </div>
      </div>
      <p className="muted">Công suất tính trên số phòng có thể bán, đã trừ phòng block. Khoảng nhiều ngày được tính theo room-night.</p>
    </section>
    <section className="panel">
      <div className="panelHeader"><div><h2>Cơ cấu sử dụng phòng</h2><p>Số lượng theo từng khách sạn trong khoảng đã chọn</p></div></div>
      <div className="bj-chart-legend"><span><i className="used"/>Đã dùng</span><span><i className="empty"/>Còn trống</span><span><i className="blocked"/>Block</span></div>
      {rows.map(row=>{const s=row.data?.summary,parts=s?[['used',s.occupied,'Đã dùng'],['empty',s.empty,'Còn trống'],['blocked',s.blocked,'Block']]:[];const total=parts.reduce((n,p)=>n+(Number(p[1])||0),0);return <div className="bj-composition-row" key={row.hotel.id}><b>{row.hotel.name}</b>{row.ok&&s?<><div className="bj-stacked-bar" aria-label={`${row.hotel.name}: đã dùng ${s.occupied}, trống ${s.empty}, block ${s.blocked}`}>
        {parts.map(([key,value,label])=>Number(value)>0&&<span className={key} key={key} style={{width:width(total?value/total*100:0)}} title={`${label}: ${count(value)} room-night`}/>)}</div><div className="bj-composition-values">{parts.map(([key,value,label])=><span key={key}>{label} <strong>{count(value)}</strong></span>)}</div></>:<small>Chưa có dữ liệu</small>}</div>})}
    </section>
    <section className="panel">
      <div className="panelHeader"><div><h2>Chi tiết khách sạn</h2><p>Chọn khách sạn để xem loại phòng và công suất theo ngày</p></div><label className="bj-hotel-picker">Khách sạn<select aria-label="Khách sạn biểu đồ công suất" value={String(selected.hotel.id)} onChange={e=>setHotelId(e.target.value)}>{available.map(row=><option value={String(row.hotel.id)} key={row.hotel.id}>{row.hotel.name}</option>)}</select></label></div>
      <h3>Công suất theo loại phòng</h3>
      {(selected.data.roomTypes||[]).length?<div className="tableWrap"><table><thead><tr><th>Loại phòng</th><th>Công suất</th><th>Đã dùng</th><th>Trống</th><th>Block</th><th>Room-night</th></tr></thead><tbody>{selected.data.roomTypes.map(room=><tr key={room.id}><td>{room.name}</td><td><div className="bj-room-rate"><strong>{rate(room.occupancyRate)}</strong><div className="bj-room-track"><span style={{width:width(room.occupancyRate)}}/></div></div></td><td>{count(room.occupied)}</td><td>{count(room.empty)}</td><td>{count(room.blocked)}</td><td>{count(room.total)}</td></tr>)}</tbody></table></div>:<p className="muted">Bluejay chưa trả dữ liệu theo loại phòng.</p>}
      <h3 className="bj-daily-heading">Công suất theo ngày</h3>
      {days.length?<div className="bj-daily-scroll"><div className="bj-daily-chart" style={{gridTemplateColumns:`repeat(${days.length}, minmax(64px,1fr))`}} role="group" aria-label="Biểu đồ cột công suất theo ngày">{days.map(day=><div className="bj-daily-column" key={day.date}><strong>{rate(day.occupancyRate)}</strong><div className="bj-day-track"><span style={{height:width(day.occupancyRate)}}/></div><b>{day.date.slice(8,10)}/{day.date.slice(5,7)}</b><small>{count(day.occupied)} / {count(day.total)}</small></div>)}</div><p className="muted">Nhãn dưới cột: room-night đã dùng / tổng room-night. Di chuột hoặc xem bảng để đọc số chi tiết.</p><details><summary>Xem bảng số liệu theo ngày</summary><div className="tableWrap"><table><thead><tr><th>Ngày</th><th>Công suất</th><th>Đã dùng</th><th>Trống</th><th>Block</th><th>Room-night</th></tr></thead><tbody>{days.map(day=><tr key={day.date}><td>{day.date}</td><td>{rate(day.occupancyRate)}</td><td>{count(day.occupied)}</td><td>{count(day.empty)}</td><td>{count(day.blocked)}</td><td>{count(day.total)}</td></tr>)}</tbody></table></div></details></div>:<p className="muted">Báo cáo này chưa có chi tiết theo ngày. Chọn kiểu báo cáo Theo ngày và khoảng ngày cần theo dõi.</p>}
    </section>
  </div>;
}
