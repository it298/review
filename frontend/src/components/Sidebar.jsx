import Icon from './Icon.jsx';
import {locationPages} from '../pages/LocationGroup.jsx';
export default function Sidebar({page,setPage,onLogout}){
 return <aside className="sidebar">
  <div className="brand"><span className="brand-mark"><Icon name="hotel" size={24}/></span><div>Stay<span className="brand-accent">Scope</span><small>REVIEW INTELLIGENCE</small></div></div>
  <div className="nav-label">WORKSPACE</div>
  <nav aria-label="Điều hướng chính">
   <button aria-label="Tổng quan" className={page==='dashboard'?'active':''} aria-current={page==='dashboard'?'page':undefined} onClick={()=>setPage('dashboard')}><Icon name="dashboard"/><span>Tổng quan</span>{page==='dashboard' && <span className="active-dot"/>}</button>
   {Object.entries(locationPages).map(([key,group])=><button key={key} aria-label={group.title} className={page===key?'active':''} aria-current={page===key?'page':undefined} onClick={()=>setPage(key)}><Icon name={{hotels:'hotel',cafes:'coffee',stores:'store',activities:'activity',comparison:'trend'}[key]}/><span>{group.title}</span>{page===key&&<span className="active-dot"/>}</button>)}
   <button aria-label="Kết nối Google" className={page==='places'?'active':''} aria-current={page==='places'?'page':undefined} onClick={()=>setPage('places')}><Icon name="link"/><span>Kết nối Google</span>{page==='places' && <span className="active-dot"/>}</button>
  </nav>
  <nav aria-label="Nguồn OTA"><button aria-label="Đánh giá OTA" className={page==='ota'?'active':''} aria-current={page==='ota'?'page':undefined} onClick={()=>setPage('ota')}><Icon name="review"/><span>Đánh giá OTA</span>{page==='ota'&&<span className="active-dot"/>}</button></nav>
  <div className="sidebar-bottom"><div className="source-note"><Icon name="shield"/><div>Google Maps + OTA<small>Điểm và tổng đánh giá theo nguồn</small></div></div><button className="signout" aria-label="Đăng xuất" onClick={onLogout}><Icon name="logout"/><span>Đăng xuất</span></button><div className="workspace-user"><span className="avatar">AD</span><div>Workspace của bạn<small>Quản trị viên</small></div><span className="online-dot"/></div></div>
 </aside>;
}
