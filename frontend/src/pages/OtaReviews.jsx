import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import Icon from '../components/Icon.jsx';
export default function OtaReviews(){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState('');
 async function load(){setBusy(true);setError('');try{setRows(await api('/api/ota/reviews'));}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{load();},[]);
 const filtered=rows.filter(r=>[r.propertyName,r.title,r.content,r.author].some(v=>String(v||'').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 function exportCSV(){const cell=v=>'"'+String(v??'').replace(/^\s*([=+@-])/,'\u0027$1').replaceAll('"','""')+'"';const data=[['Khách sạn','OTA','Ngày đánh giá','Điểm','Thang điểm','Khách','Tiêu đề','Nội dung','Phản hồi','Ngày thu thập'],...filtered.map(r=>[r.propertyName,r.source,r.reviewedAt,r.rating,r.ratingMax,r.author,r.title,r.content,r.response,r.capturedAt])];const url=URL.createObjectURL(new Blob(['\uFEFF'+data.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='ota-reviews.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <main className="page"><header className="page-header"><div><div className="eyebrow">ĐÁNH GIÁ ĐA KÊNH</div><h1>Đánh giá OTA.</h1><p>Nội dung đánh giá đã thu thập từ các nền tảng đặt phòng.</p></div><button className="primary" onClick={load} disabled={busy}><Icon name="refresh" size={16}/>{busy?'Đang tải...':'Tải lại dữ liệu'}</button></header>
 <p className="notice">Dữ liệu thử nghiệm OTA • Chưa đồng bộ tự động • Số hiển thị là review đã thu thập, không phải tổng review trên OTA.</p>
 {error&&<p className="notice error" role="alert">{error}</p>}
 <div className="filter-bar"><input aria-label="Tìm review OTA" placeholder="Tìm khách sạn, nội dung hoặc tên khách..." value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length} đánh giá đã thu thập</span></div>
 <button onClick={exportCSV} disabled={!filtered.length}><Icon name="download" size={16}/> Xuất Excel (CSV)</button>
 {!busy&&!error&&!rows.length&&<section className="card"><h2>Chưa có đánh giá OTA</h2><p>Dữ liệu sẽ hiển thị sau khi được nhập vào hệ thống.</p></section>}
 <div className="ota-sheet card"><table><caption>Bảng theo dõi từng đánh giá OTA</caption><thead><tr>{['Khách sạn','Nguồn','Ngày đánh giá','Điểm','Khách','Nội dung đánh giá','Phản hồi khách sạn','Thu thập lúc'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={r.key}><td>{r.propertyName}</td><td><a href={r.sourceUrl} target="_blank" rel="noreferrer">{r.source==='agoda'?'Agoda':r.source==='trip'?'Trip.com':r.source==='traveloka'?'Traveloka':r.source} ↗</a></td><td>{r.reviewedAt}</td><td><strong className="ota-score">{r.rating}/{r.ratingMax}</strong></td><td>{r.author||'Khách'}</td><td className="ota-cell-text"><strong>{r.title}</strong><p>{r.content||'Chỉ có điểm'}</p></td><td className="ota-cell-text">{r.response?<details><summary>Xem phản hồi{r.responseAt?' · '+r.responseAt:''}</summary><p>{r.response}</p></details>:'—'}</td><td>{new Date(r.capturedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</td></tr>)}</tbody></table></div>
 </main>;
}
