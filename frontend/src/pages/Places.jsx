import { useEffect,useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
export default function Places(){
 const [places,setPlaces]=useState([]);const [connection,setConnection]=useState(null);
 const [accounts,setAccounts]=useState([]);const [account,setAccount]=useState('');const [accountNext,setAccountNext]=useState('');
 const [locations,setLocations]=useState([]);const [location,setLocation]=useState('');const [locationNext,setLocationNext]=useState('');
 const [name,setName]=useState('');const [existing,setExisting]=useState('');const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState(()=>({connected:'Đã kết nối Google. Chọn tài khoản và khách sạn để theo dõi.',denied:'Bạn đã hủy cấp quyền Google.',error:'Kết nối Google chưa thành công. Kiểm tra OAuth và thử lại.'}[new URLSearchParams(window.location.search).get('google')] || ''));
 const [query,setQuery]=useState('');const [sort,setSort]=useState('name');
 const [error,setError]=useState('');const [editing,setEditing]=useState(null);const [editName,setEditName]=useState('');const [deleting,setDeleting]=useState(null);const [confirmDisconnect,setConfirmDisconnect]=useState(false);
 async function fetchAccounts(next=''){
  const data=await api('/api/google/accounts'+(next?'?pageToken='+encodeURIComponent(next):''));
  setAccounts(current=>next?[...current,...(data.accounts || [])]:data.accounts || []);setAccountNext(data.nextPageToken || '');
 }
 async function load(){
  const [listing,status]=await Promise.allSettled([api('/api/places'),api('/api/google/status')]);
  if(listing.status==='fulfilled')setPlaces(listing.value);else setError(listing.reason.message);
  if(status.status==='fulfilled'){setConnection(status.value);if(status.value.connected)await fetchAccounts();}else setError(status.reason.message);
 }
 const shown=[...places].filter(p=>p.name.toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN'))).sort((a,b)=>sort==='reviews'?b.user_rating_count-a.user_rating_count:sort==='rating'?(b.rating ?? -1)-(a.rating ?? -1):a.name.localeCompare(b.name));
 useEffect(()=>{load().catch(e=>setError(e.message));const url=new URL(window.location.href);url.searchParams.delete('google');window.history.replaceState({},'',url.pathname+url.search+url.hash);},[]);
 async function perform(action){setBusy(true);setError('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function chooseAccount(value){setAccount(value);setLocations([]);setLocation('');setLocationNext('');if(!value)return;await perform(async()=>{const data=await api('/api/google/locations?account='+encodeURIComponent(value));setLocations(data.locations || []);setLocationNext(data.nextPageToken || '');});}
 async function moreLocations(){await perform(async()=>{const data=await api('/api/google/locations?account='+encodeURIComponent(account)+'&pageToken='+encodeURIComponent(locationNext));setLocations(current=>[...current,...(data.locations || [])]);setLocationNext(data.nextPageToken || '');});}
 async function track(e){e.preventDefault();await perform(async()=>{const place=await api('/api/places/track',{method:'POST',body:JSON.stringify({account,location,name:name.trim() || undefined,existingPlaceId:existing?Number(existing):undefined})});setMessage('Đã lưu '+place.name+' — '+place.user_rating_count.toLocaleString('vi-VN')+' review.');setName('');setExisting('');await load();});}
 return <main className="content places-page">
  <header className="page-header"><div><span className="eyebrow">QUẢN LÝ WORKSPACE</span><h1>Khách sạn<span className="heading-dot">.</span></h1><p>Kết nối tài khoản, chọn khách sạn và theo dõi uy tín của bạn.</p></div><span className="badge neutral"><Icon name="hotel" size={15}/>{places.length} khách sạn theo dõi</span></header>
  <div className="setup-grid">
  <section className="panel form-card connection-panel">
   <span className="connection-symbol"><Icon name="link" size={24}/></span><span className="eyebrow">NGUỒN DỮ LIỆU</span><h2>Google Business Profile</h2>
   {connection?.configured===false && <p className="notice">Backend chưa có cấu hình Google OAuth. Cần thiết lập Google Cloud trước khi kết nối.</p>}
   <span className={'badge '+(connection?.connected?'connected':'neutral')}><span className="status-dot"/>{connection?.connected?'Đã kết nối':'Chưa kết nối'}</span>
   <p className="muted">Google yêu cầu quyền quản lý hồ sơ doanh nghiệp. Ứng dụng chỉ đọc danh sách khách sạn, tổng review và điểm sao.</p>
   <button className="primary" disabled={busy || !connection?.configured} onClick={()=>perform(async()=>{const data=await api('/api/google/connect',{method:'POST'});window.location.assign(data.url);})}><Icon name="link"/>{connection?.connected?'Đổi tài khoản Google':'Kết nối Google'}</button>
   {connection?.connected && <button disabled={busy} onClick={()=>setConfirmDisconnect(true)}>Ngắt kết nối trong ứng dụng</button>}
   {confirmDisconnect && <div className="notice">Ngắt kết nối Google? Lịch sử vẫn được giữ. <button disabled={busy} onClick={()=>perform(async()=>{await api('/api/google/disconnect',{method:'POST'});setConfirmDisconnect(false);setAccounts([]);setAccount('');setLocations([]);setLocation('');await load();})}>Xác nhận</button> <button onClick={()=>setConfirmDisconnect(false)}>Hủy</button></div>}
  </section>
  {connection?.connected ? <form className="panel form-card setup-panel" onSubmit={track}>
   <div className="panel-header"><div><h2>Thêm khách sạn</h2><p>Chọn từ tài khoản Google bạn đang quản lý</p></div><span className="icon-box blue"><Icon name="plus"/></span></div>
   <label>Tài khoản / Nhóm doanh nghiệp<select required disabled={busy} value={account} onChange={e=>chooseAccount(e.target.value)}><option value="">Chọn tài khoản</option>{accounts.map(a=><option key={a.name} value={a.name}>{a.accountName || a.name}</option>)}</select></label>
   {accountNext && <button type="button" disabled={busy} onClick={()=>perform(()=>fetchAccounts(accountNext))}>Tải thêm tài khoản</button>}
   <label>Khách sạn<select aria-label="Khách sạn Google" required disabled={busy || !account} value={location} onChange={e=>setLocation(e.target.value)}><option value="">Chọn địa điểm</option>{locations.map(l=><option key={l.name} value={l.name}>{l.title || l.name}</option>)}</select></label>
   {locationNext && <button type="button" disabled={busy} onClick={moreLocations}>Tải thêm địa điểm</button>}
   {account && !busy && !locations.length && <p className="muted">Chưa có địa điểm trong tài khoản này hoặc Google chưa cho phép truy cập.</p>}
   <label>Tên tùy chọn<input maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></label>
   {places.some(p=>!p.google_location) && <label>Giữ lịch sử của địa điểm cũ<select value={existing} onChange={e=>setExisting(e.target.value)}><option value="">Tạo địa điểm mới</option>{places.filter(p=>!p.google_location).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
   <button className="primary" disabled={busy || !location}><Icon name="plus"/>{busy?'Đang xử lý...':'Thêm và lấy dữ liệu'}</button>
  </form>:<section className="panel setup-placeholder"><span className="badge neutral">THIẾT LẬP WORKSPACE</span><h2>Một kết nối.<br/>Tất cả khách sạn của bạn.</h2><p>Danh sách địa điểm sẽ xuất hiện sau khi kết nối tài khoản Google có quyền quản lý.</p><div className="setup-steps"><div><span>1</span><section><strong>Kết nối tài khoản Google</strong><small>Cấp quyền đọc dữ liệu hồ sơ doanh nghiệp</small></section></div><div><span>2</span><section><strong>Chọn khách sạn</strong><small>Thêm địa điểm bạn muốn theo dõi</small></section></div><div><span>3</span><section><strong>Theo dõi thay đổi review</strong><small>Lưu lịch sử và xuất CSV khi cần</small></section></div></div></section>}
  </div>
  <div role="status">{message && <div className="notice">{message}</div>}</div>{error && <div role="alert" className="notice error">{error}</div>}
  <div className="section-heading"><div><h2>Danh sách khách sạn</h2><p>Thông tin và trạng thái cập nhật gần nhất</p></div></div><div className="filter-bar"><label className="search-field"><Icon name="search"/><input aria-label="Tìm khách sạn" placeholder="Tìm khách sạn..." value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Sắp xếp khách sạn" value={sort} onChange={e=>setSort(e.target.value)}><option value="name">Theo tên khách sạn</option><option value="reviews">Nhiều review nhất</option><option value="rating">Điểm sao cao nhất</option></select><span className="filter-count">{shown.length} kết quả</span></div>
  <section className="places-list">{shown.map(p=><article className="panel hotel-card" key={p.id}>
   <div className="hotel-card-top"><span className="hotel-monogram">{p.name.slice(0,2).toUpperCase()}</span><span className={'badge '+(p.last_error?'warning':p.google_location?'connected':'neutral')}>{p.last_error?'Cần kiểm tra':p.google_location?'Đã liên kết':'Chưa liên kết'}</span></div><h3><a href={p.google_maps_uri} target="_blank" rel="noreferrer">{p.name}<Icon name="external" size={16}/></a></h3>{p.address && <p className="hotel-address">{p.address}</p>}
   <div className="hotel-metrics"><div><strong>{p.user_rating_count.toLocaleString('vi-VN')}</strong><small>Tổng review</small></div><div><strong><Icon name="star" size={17}/>{p.rating==null?'—':Number(p.rating).toLocaleString('vi-VN',{maximumFractionDigits:2})}</strong><small>Điểm sao</small></div></div>
   {!p.google_location && <p className="notice">Chưa liên kết Google Business. Chọn khách sạn ở trên và chọn giữ lịch sử của địa điểm này.</p>}
   <p className="muted">Cập nhật thành công: {p.last_sync_at?new Date(p.last_sync_at).toLocaleString('vi-VN'):'Chưa có thông tin'}</p>
   {p.last_error && <p className="notice error">{p.last_error}</p>}
   {editing===p.id?<form onSubmit={e=>{e.preventDefault();perform(async()=>{await api('/api/places/'+p.id,{method:'PATCH',body:JSON.stringify({name:editName})});setEditing(null);await load();});}}><input aria-label="Tên mới" required maxLength={200} value={editName} onChange={e=>setEditName(e.target.value)}/> <button disabled={busy}>Lưu</button> <button type="button" onClick={()=>setEditing(null)}>Hủy</button></form>:<button disabled={busy} onClick={()=>{setEditing(p.id);setEditName(p.name);}}>Đổi tên</button>}
   {deleting===p.id?<div className="notice">Xóa địa điểm và toàn bộ lịch sử? <button disabled={busy} onClick={()=>perform(async()=>{await api('/api/places/'+p.id,{method:'DELETE'});setDeleting(null);await load();})}>Xác nhận xóa</button> <button onClick={()=>setDeleting(null)}>Hủy</button></div>:<button className="danger" disabled={busy} onClick={()=>setDeleting(p.id)}>Xóa</button>}
  </article>)}{!shown.length && <div className="panel list-empty"><Icon name="hotel" size={28}/><h3>{places.length?'Không có khách sạn khớp tìm kiếm':'Chưa có khách sạn được theo dõi'}</h3><p>Danh sách khách sạn sẽ hiển thị tại đây sau khi được thêm.</p></div>}</section>
 </main>;
}
