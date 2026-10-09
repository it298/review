import {useEffect,useState} from 'react';
import Icon from './Icon.jsx';
import {locationPages} from '../pages/LocationGroup.jsx';
import {insightTitles} from '../lib/insight-labels.js';

const groups=[
 {key:'locations',label:'Địa điểm',icon:'hotel',items:[
  {key:'hotels',label:'Khách sạn',icon:'hotel'},
  {key:'cafes',label:'Café',icon:'coffee'},
  {key:'stores',label:'Cửa hàng',icon:'store'},
  {key:'activities',label:'Hoạt động',icon:'activity'}
 ]},
 {key:'analysis',label:'Phân tích',icon:'trend',items:[
  {key:'history',label:'Biểu đồ & lịch sử',icon:'trend'},
  {key:'compare',label:'Tốc độ tăng',icon:'trend'},
  {key:'comparison',label:'Đối thủ',icon:'hotel'},
  {key:'evidence',label:'Ảnh kiểm chứng',icon:'review'},
  {key:'reports',label:'Báo cáo tuần',icon:'calendar'}
 ]},
 {key:'connections',label:'Kết nối',icon:'link',items:[
  {key:'places',label:'Google',icon:'link',title:'Kết nối Google'},
  {key:'ota',label:'Đánh giá OTA',icon:'review'}
 ]}
];
const groupFor=page=>groups.find(group=>group.items.some(item=>item.key===page))?.key;

export default function Sidebar({page,setPage,onLogout}){
 const [openGroup,setOpenGroup]=useState(()=>groupFor(page)||'locations');
 const [collapsed,setCollapsed]=useState(false);
 const [narrow,setNarrow]=useState(()=>window.matchMedia('(max-width:950px)').matches);
 const compact=collapsed||narrow;
 useEffect(()=>{const group=groupFor(page);if(group)setOpenGroup(group);},[page]);
 useEffect(()=>{const media=window.matchMedia('(max-width:950px)');const update=()=>setNarrow(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 function itemButton(item){
  const title=item.title||locationPages[item.key]?.title||insightTitles[item.key]||item.label;
  return <button key={item.key} type="button" title={title} aria-label={title} className={page===item.key?'active':''} aria-current={page===item.key?'page':undefined} onClick={()=>setPage(item.key)}><Icon name={item.icon}/><span className="nav-text">{item.label}</span>{page===item.key&&<span className="active-dot"/>}</button>;
 }
 return <aside className={'sidebar compact-sidebar'+(compact?' is-compact':'')}>
  <div className="sidebar-heading"><div className="brand"><span className="brand-mark"><Icon name="hotel" size={22}/></span><div>Stay<span className="brand-accent">Scope</span><small>REVIEW INTELLIGENCE</small></div></div></div>
  <button type="button" className="sidebar-toggle" title={compact?'Mở rộng sidebar':'Thu gọn sidebar'} aria-label={compact?'Mở rộng sidebar':'Thu gọn sidebar'} aria-expanded={!compact} onClick={()=>setCollapsed(value=>!value)}><Icon name={compact?'panelOpen':'panelClose'} size={17}/><span>Thu gọn</span></button>
  <nav className="sidebar-navigation" aria-label="Điều hướng chính">
   <div className="nav-primary">
    {itemButton({key:'dashboard',label:'Tổng quan',icon:'dashboard'})}
    {itemButton({key:'attention',label:'Cần chú ý',icon:'alert'})}
   </div>
   {groups.map(group=>{
    const active=groupFor(page)===group.key,expanded=openGroup===group.key;
    return <section className="nav-group" key={group.key} aria-label={group.label}>
     {!compact&&<button type="button" className={'nav-group-toggle'+(active?' has-active':'')} aria-label={group.label} aria-expanded={expanded} aria-controls={'sidebar-'+group.key} onClick={()=>setOpenGroup(expanded?null:group.key)}><Icon name={group.icon} size={17}/><span className="nav-text">{group.label}</span><Icon name="chevron" size={14} className={'group-chevron'+(expanded?' is-open':'')}/></button>}
     {(compact||expanded)&&<div id={'sidebar-'+group.key} className="nav-group-items">{group.items.map(itemButton)}</div>}
    </section>;
   })}
  </nav>
  <div className="sidebar-bottom"><div className="workspace-user"><span className="avatar">AD</span><div>Workspace của bạn<small>Quản trị viên</small></div><button type="button" className="signout" title="Đăng xuất" aria-label="Đăng xuất" onClick={onLogout}><Icon name="logout" size={17}/></button></div></div>
 </aside>;
}
