import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import Icon from '../components/Icon.jsx';
export default function OtaReviews(){
 const [rows,setRows]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState('');
 async function load(){setBusy(true);setError('');try{setRows(await api('/api/ota/reviews'));}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{load();},[]);
 const filtered=rows.filter(r=>[r.propertyName,r.title,r.content,r.author].some(v=>String(v||'').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 return <main className="page"><header className="page-header"><div><div className="eyebrow">ĐÁNH GIÁ ĐA KÊNH</div><h1>Đánh giá OTA.</h1><p>Nội dung đánh giá đã thu thập từ các nền tảng đặt phòng.</p></div><button className="primary" onClick={load} disabled={busy}><Icon name="refresh" size={16}/>{busy?'Đang tải...':'Tải lại dữ liệu'}</button></header>
 <p className="notice">Dữ liệu thử nghiệm Agoda • Chưa đồng bộ tự động • Số hiển thị là review đã thu thập, không phải tổng review trên OTA.</p>
 {error&&<p className="notice error" role="alert">{error}</p>}
 <div className="filter-bar"><input aria-label="Tìm review OTA" placeholder="Tìm khách sạn, nội dung hoặc tên khách..." value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length} đánh giá đã thu thập</span></div>
 {!busy&&!error&&!rows.length&&<section className="card"><h2>Chưa có đánh giá OTA</h2><p>Dữ liệu sẽ hiển thị sau khi được nhập vào hệ thống.</p></section>}
 <div className="ota-review-list">{filtered.map(r=><article className="card ota-review" key={r.key}><header><div><small>{r.propertyName} · {r.source==='agoda'?'Agoda':r.source}</small><h2>{r.title||'Đánh giá không có tiêu đề'}</h2></div><strong className="ota-score">{r.rating}/{r.ratingMax}</strong></header><p className="ota-meta">{r.author||'Khách'} · Ngày đánh giá: {r.reviewedAt}</p><p className="ota-content">{r.content||'Đánh giá chỉ có điểm.'}</p>{r.response&&<details><summary>Phản hồi khách sạn{r.responseAt?' · '+r.responseAt:''}</summary><p className="ota-content">{r.response}</p></details>}<footer><span>Thu thập: {new Date(r.capturedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</span><a href={r.sourceUrl} target="_blank" rel="noreferrer">Xem trang nguồn ↗</a></footer></article>)}</div>
 </main>;
}
