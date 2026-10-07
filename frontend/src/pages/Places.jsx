import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
export default function Places() {
  const [places,setPlaces] = useState([]);
  const [url,setUrl] = useState('');
  const [name,setName] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [editing,setEditing] = useState(null);
  const [editName,setEditName] = useState('');
  const [deleting,setDeleting] = useState(null);
  async function load() { setPlaces(await api('/api/places')); }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function perform(action) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); await load(); } catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  function track(e) {
    e.preventDefault();
    perform(async () => {
      const place = await api('/api/places/track', { method:'POST', body:JSON.stringify({googleMapsUrl:url.trim(), name:name.trim() || undefined}) });
      setMessage('Đã lưu ' + place.name); setUrl(''); setName('');
    });
  }
  return <main className="content">
    <header className="topbar"><div><h1>Địa điểm</h1><p>Quản lý khách sạn và trạng thái lấy dữ liệu Google Maps</p></div></header>
    <form className="card form-card" onSubmit={track}>
      <h3>Thêm địa điểm</h3>
      <label>URL Google Maps<input type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://www.google.com/maps/place/..." /></label>
      <label>Tên tùy chọn<input maxLength={200} value={name} onChange={e=>setName(e.target.value)} placeholder="Tên hiển thị của khách sạn" /></label>
      <button className="primary" disabled={busy}>{busy?'Đang xử lý...':'Thêm và kiểm tra'}</button>
    </form>
    <div role="status">{message && <div className="notice">{message}</div>}</div>
    {error && <div role="alert" className="notice error">{error}</div>}
    <section className="places-list">
      {places.map(p=><article className="card" key={p.id}>
        <h3><a href={p.google_maps_uri} target="_blank" rel="noreferrer">{p.name}</a></h3>
        <p>{p.user_rating_count.toLocaleString('vi-VN')} review · {p.rating ?? 'Chưa đọc được điểm'} sao</p>
        <p className="muted">Cập nhật thành công: {p.last_sync_at ? new Date(p.last_sync_at).toLocaleString('vi-VN') : 'Chưa có thông tin'}</p>
        {p.last_error && <p className="notice error">{p.last_error}</p>}
        {editing===p.id ? <form onSubmit={e=>{e.preventDefault();perform(async()=>{await api('/api/places/'+p.id,{method:'PATCH',body:JSON.stringify({name:editName})});setEditing(null);});}}>
          <input aria-label="Tên mới" required maxLength={200} value={editName} onChange={e=>setEditName(e.target.value)} /> <button disabled={busy}>Lưu</button> <button type="button" onClick={()=>setEditing(null)}>Hủy</button>
        </form> : <button disabled={busy} onClick={()=>{setEditing(p.id);setEditName(p.name);}}>Đổi tên</button>}
        {deleting===p.id ? <div className="notice">Xóa địa điểm và toàn bộ lịch sử của địa điểm này? <button disabled={busy} onClick={()=>perform(async()=>{await api('/api/places/'+p.id,{method:'DELETE'});setDeleting(null);})}>Xác nhận xóa</button> <button onClick={()=>setDeleting(null)}>Hủy</button></div> : <button className="danger" disabled={busy} onClick={()=>setDeleting(p.id)}>Xóa</button>}
      </article>)}
      {!places.length && <p className="muted">Chưa có địa điểm được theo dõi.</p>}
    </section>
  </main>;
}
