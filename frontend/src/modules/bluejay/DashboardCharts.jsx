import CircularChart from '../../components/CircularChart.jsx';
import React, {useState} from 'react';
import {occupancyDays} from './occupancy-days.js';
import ReportExport from './ReportExport.jsx';
import {dashboardReport} from './report-data.js';

const count=value=>value==null?'—':Number(value).toLocaleString('vi-VN');
const rate=value=>value==null?'—':`${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:2})}%`;
function OccupancyCircle({summary,title}){return <CircularChart title={title} center={rate(summary.occupancyRate)} centerLabel="Công suất bán" unit="RN" data={[{label:'Đã dùng',value:summary.occupied,color:'#765493'},{label:'Còn trống',value:summary.empty,color:'#c5a45d'},{label:'Block',value:summary.blocked,color:'#aab4bf'}]}/>;}

export default function DashboardCharts({payload}){
  const rows=payload.hotels||[],available=rows.filter(row=>row.ok&&row.data?.summary);
  const [hotelId,setHotelId]=useState(''),[day,setDay]=useState('');
  const [chartMode,setChartMode]=useState('rooms'),[chartHotel,setChartHotel]=useState('all');
  const chartRows=rows.filter(row=>chartHotel==='all'||String(row.hotel.id)===chartHotel).flatMap(row=>chartMode==='hotels'?[{...row,columnKey:String(row.hotel.id),label:row.hotel.name}]:row.ok&&row.data?.roomTypes?.length?row.data.roomTypes.map(room=>({...row,columnKey:row.hotel.id+':'+room.id,label:room.name,data:{summary:room}})):[{...row,ok:false,columnKey:String(row.hotel.id),label:'Chưa có loại phòng'}]);
  const selected=available.find(row=>String(row.hotel.id)===hotelId)||available[0];
  const days=occupancyDays(selected?.data?.roomTypes||[]);
  const selectedDay=days.find(d=>d.date===day)||days.at(-1);
  if(!available.length)return <section className="panel"><h2>Dashboard công suất</h2><p>Chưa có dữ liệu trong khoảng ngày đã chọn để vẽ biểu đồ.</p></section>;
  return <div className="bj-dashboard-charts">
    <section className="panel">
      <div className="panelHeader"><div><h2>Công suất các khách sạn</h2><p>{payload.meta?.from} → {payload.meta?.to} · {chartMode==='rooms'?'Mỗi biểu đồ một loại phòng':'Mỗi biểu đồ một khách sạn'}</p></div><span className="bj-chart-unit">Room-night</span></div>
      <div className="bj-chart-tools"><div role="group" aria-label="Chế độ biểu đồ công suất"><button aria-pressed={chartMode==='hotels'} onClick={()=>setChartMode('hotels')}>Tổng khách sạn</button><button aria-pressed={chartMode==='rooms'} onClick={()=>setChartMode('rooms')}>Theo loại phòng</button></div><label className="bj-hotel-picker">Lọc khách sạn<select aria-label="Lọc khách sạn trên biểu đồ" value={chartHotel} onChange={e=>setChartHotel(e.target.value)}><option value="all">Tất cả khách sạn</option>{rows.map(row=><option key={row.hotel.id} value={String(row.hotel.id)}>{row.hotel.name}</option>)}</select></label></div>
      <ReportExport label="dashboard" getReport={()=>dashboardReport(payload,{hotelId:chartHotel,mode:chartMode})}/>
      <div className="bj-chart-legend"><span><i className="used"/>Đã dùng</span><span><i className="empty"/>Còn trống</span><span><i className="blocked"/>Block</span></div>
      <div className="circular-grid" aria-label="Biểu đồ tròn công suất khách sạn">{chartRows.map(row=><article className="circular-card" key={row.columnKey}><h3>{row.hotel.name}</h3>{chartMode==='rooms'&&<p>{row.label}</p>}{row.ok&&row.data?.summary?<><OccupancyCircle summary={row.data.summary} title={row.hotel.name+' · '+row.label}/><p>Tổng {count(row.data.summary.total)} room-night</p></>:<p>Chưa có dữ liệu</p>}</article>)}</div>
      <p className="muted">Miếng tròn: tỷ trọng đã dùng / trống / block trên tổng room-night. Công suất ở tâm: đã dùng / phòng có thể bán, đã trừ block. Đã loại M-Standard.</p>
    </section>
    <details className="panel bj-detail-disclosure"><summary>Xem chi tiết theo loại phòng và ngày</summary>

      <div className="panelHeader"><div><h2>Chi tiết khách sạn</h2><p>Chọn khách sạn để xem loại phòng và công suất theo ngày</p></div><label className="bj-hotel-picker">Khách sạn<select aria-label="Khách sạn biểu đồ công suất" value={String(selected.hotel.id)} onChange={e=>setHotelId(e.target.value)}>{available.map(row=><option value={String(row.hotel.id)} key={row.hotel.id}>{row.hotel.name}</option>)}</select></label></div>
      <h3>Công suất theo loại phòng</h3>
      {(selected.data.roomTypes||[]).length?<div className="tableWrap"><table><thead><tr><th>Loại phòng</th><th>Công suất</th><th>Đã dùng</th><th>Trống</th><th>Block</th><th>Room-night</th></tr></thead><tbody>{selected.data.roomTypes.map(room=><tr key={room.id}><td>{room.name}</td><td><div className="bj-room-rate"><strong>{rate(room.occupancyRate)}</strong></div></td><td>{count(room.occupied)}</td><td>{count(room.empty)}</td><td>{count(room.blocked)}</td><td>{count(room.total)}</td></tr>)}</tbody></table></div>:<p className="muted">Bluejay chưa trả dữ liệu theo loại phòng.</p>}
      <h3 className="bj-daily-heading">Công suất theo ngày</h3>
      {days.length?<div><label className="circular-selector">Ngày hiển thị<select aria-label="Ngày biểu đồ công suất" value={selectedDay.date} onChange={e=>setDay(e.target.value)}>{days.map(d=><option key={d.date} value={d.date}>{d.date}</option>)}</select></label><OccupancyCircle title={selected.hotel.name+' · '+selectedDay.date} summary={selectedDay}/><details><summary>Xem bảng số liệu theo ngày</summary><div className="tableWrap"><table><thead><tr><th>Ngày</th><th>Công suất</th><th>Đã dùng</th><th>Trống</th><th>Block</th><th>Room-night</th></tr></thead><tbody>{days.map(day=><tr key={day.date}><td>{day.date}</td><td>{rate(day.occupancyRate)}</td><td>{count(day.occupied)}</td><td>{count(day.empty)}</td><td>{count(day.blocked)}</td><td>{count(day.total)}</td></tr>)}</tbody></table></div></details></div>:<p className="muted">Báo cáo này chưa có chi tiết theo ngày. Chọn kiểu báo cáo Theo ngày và khoảng ngày cần theo dõi.</p>}
    </details>
  </div>;
}
