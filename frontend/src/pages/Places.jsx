import { useEffect,useState } from 'react';
import { api } from '../lib/api.js';
export default function Places(){
 const [places,setPlaces]=useState([]);const [connection,setConnection]=useState(null);
 const [accounts,setAccounts]=useState([]);const [account,setAccount]=useState('');const [accountNext,setAccountNext]=useState('');
 const [locations,setLocations]=useState([]);const [location,setLocation]=useState('');const [locationNext,setLocationNext]=useState('');
 const [name,setName]=useState('');const [existing,setExisting]=useState('');const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState(()=>({connected:'Đã kết nối Google. Chọn tài khoản và khách sạn để theo dõi.',denied:'Bạn đã hủy cấp quyền Google.',error:'Kết nối Google chưa thành công. Kiểm tra OAuth và thử lại.'}[new URLSearchParams(window.location.search).get('google')] || ''));
 const [error,setError]=useState('');const [editing,setEditing]=useState(null);const [editName,setEditName]=useState('');const [deleting,setDeleting]=useState(null);const [confirmDisconnect,setConfirmDisconnect]=useState(false);
 async function fetchAccounts(next=''){
  const data=await api('/api/google/accounts'+(next?'?pageToken='+encodeURIComponent(next):''));
  setAccounts(current=>next?[...current,...(data.accounts || [])]:data.accounts || []);setAccountNext(data.nextPageToken || '');
 }
 async function load(){setPlaces(await api('/api/places'));const status=await api('/api/google/status');setConnection(status);if(status.connected)await fetchAccounts();}
 useEffect(()=>{load().catch(e=>setError(e.message));const url=new URL(window.location.href);url.searchParams.delete('google');window.history.replaceState({},'',url.pathname+url.search+url.hash);},[]);
 async function perform(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function chooseAccount(value){setAccount(value);setLocations([]);setLocation('');setLocationNext('');if(!value)return;await perform(async()=>{const data=await api('/api/google/locations?account='+encodeURIComponent(value));setLocations(data.locations || []);setLocationNext(data.nextPageToken || '');});}
 async function moreLocations(){await perform(async()=>{const data=await api('/api/google/locations?account='+encodeURIComponent(account)+'&pageToken='+encodeURIComponent(locationNext));setLocations(current=>[...current,...(data.locations || [])]);setLocationNext(data.nextPageToken || '');});}
 async function track(e){e.preventDefault();await perform(async()=>{const place=await api('/api/places/track',{method:'POST',body:JSON.stringify({account,location,name:name.trim() || undefined,existingPlaceId:existing?Number(existing):undefined})});setMessage('Đã lưu '+place.name+' — '+place.user_rating_count.toLocaleString('vi-VN')+' review.');setName('');setExisting('');await load();});}
 return <main className="content">
  <header className="topbar"><div><h1>Khách sạn Google Business</h1><p>Theo dõi địa điểm bạn có quyền quản lý</p></div></header>
  <section className="card form-card">
   <h3>Kết nối Google</h3>
   {connection?.configured===false && <p className="notice">Backend chưa có cấu hình Google OAuth. Cần thiết lập Google Cloud trước khi kết nối.</p>}
   <p>{connection?.connected?'Đã có kết nối Google.':'Chưa kết nối Google.'}</p>
   <p className="muted">Google yêu cầu quyền quản lý hồ sơ doanh nghiệp. Ứng dụng chỉ đọc danh sách khách sạn, tổng review và điểm sao.</p>
   <button className="primary" disabled={busy || !connection?.configured} onClick={()=>perform(async()=>{const data=await api('/api/google/connect',{method:'POST'});window.location.assign(data.url);})}>{connection?.connected?'Kết nối lại / Đổi tài khoản Google':'Kết nối Google'}</button>
   {connection?.connected && <button disabled={busy} onClick={()=>setConfirmDisconnect(true)}>Ngắt kết nối trong ứng dụng</button>}
   {confirmDisconnect && <div className="notice">Ngắt kết nối Google? Lịch sử vẫn được giữ. <button disabled={busy} onClick={()=>perform(async()=>{await api('/api/google/disconnect',{method:'POST'});setConfirmDisconnect(false);setAccounts([]);setAccount('');setLocations([]);setLocation('');await load();})}>Xác nhận</button> <button onClick={()=>setConfirmDisconnect(false)}>Hủy</button></div>}
  </section>
  {connection?.connected && <form className="card form-card" onSubmit={track}>
   <h3>Chọn khách sạn để theo dõi</h3>
   <label>Tài khoản / Nhóm doanh nghiệp<select required disabled={busy} value={account} onChange={e=>chooseAccount(e.target.value)}><option value="">Chọn tài khoản</option>{accounts.map(a=><option key={a.name} value={a.name}>{a.accountName || a.name}</option>)}</select></label>
   {accountNext && <button type="button" disabled={busy} onClick={()=>perform(()=>fetchAccounts(accountNext))}>Tải thêm tài khoản</button>}
   <label>Khách sạn<select required disabled={busy || !account} value={location} onChange={e=>setLocation(e.target.value)}><option value="">Chọn địa điểm</option>{locations.map(l=><option key={l.name} value={l.name}>{l.title || l.name}</option>)}</select></label>
   {locationNext && <button type="button" disabled={busy} onClick={moreLocations}>Tải thêm địa điểm</button>}
   {account && !busy && !locations.length && <p className="muted">Chưa có địa điểm trong tài khoản này hoặc Google chưa cho phép truy cập.</p>}
   <label>Tên tùy chọn<input maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label>
   {places.some(p=>!p.google_location) && <label>Giữ lịch sử của địa điểm cũ<select value={existing} onChange={e=>setExisting(e.target.value)}><option value="">Tạo địa điểm mới</option>{places.filter(p=>!p.google_location).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   <button className="primary" disabled={busy || !location}>{busy?'Đang xử lý...':'Thêm và lấy dữ liệu'}</button>
  </form>}
  <div role="status">{message && <div className="notice">{message}</div>}</div>{error && <div role="alert" className="notice error">{error}</div>}
  <section className="places-list">{places.map(p=><article className="card" key={p.id}>
   <h3><a href={p.google_maps_uri} target="_blank" rel="noreferrer">{p.name}</a></h3>
   <p>{p.user_rating_count.toLocaleString('vi-VN')} review · {p.rating ?? 'Chưa có điểm sao'}{p.rating==null?'':' sao'}</p>
   {!p.google_location && <p className="notice">Chưa liên kết Google Business. Chọn khách sạn ở trên và chọn giữ lịch sử của địa điểm này.</p>}
   <p className="muted">Cập nhật thành công: {p.last_sync_at?new Date(p.last_sync_at).toLocaleString('vi-VN'):'Chưa có thông tin'}</p>
   {p.last_error && <p className="notice error">{p.last_error}</p>}
   {editing===p.id?<form onSubmit={e=>{e.preventDefault();perform(async()=>{await api('/api/places/'+p.id,{method:'PATCH',body:JSON.stringify({name:editName})});setEditing(null);await load();});}}><input aria-label="Tên mới" required maxLength={200} value={editName} onChange={e=>setEditName(e.target.value)}/> <button disabled={busy}>Lưu</button> <button type="button" onClick={()=>setEditing(null)}>Hủy</button></form>:<button disabled={busy} onClick={()=>{setEditing(p.id);setEditName(p.name);}}>Đổi tên</button>}
   {deleting===p.id?<div className="notice">Xóa địa điểm và toàn bộ lịch sử? <button disabled={busy} onClick={()=>perform(async()=>{await api('/api/places/'+p.id,{method:'DELETE'});setDeleting(null);await load();})}>Xác nhận xóa</button> <button onClick={()=>setDeleting(null)}>Hủy</button></div>:<button className="danger" disabled={busy} onClick={()=>setDeleting(p.id)}>Xóa</button>}
  </article>)}{!places.length && <p className="muted">Chưa có khách sạn được theo dõi.</p>}</section>
 </main>;
}
