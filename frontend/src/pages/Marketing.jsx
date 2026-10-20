import {lazy,Suspense,useState} from 'react';
import GoogleBusinessAnalytics from '../components/GoogleBusinessAnalytics.jsx';
import WebsiteAnalytics from '../components/WebsiteAnalytics.jsx';
import InstagramAnalytics from '../components/InstagramAnalytics.jsx';
import './marketing.css';
const FacebookAnalytics=lazy(()=>import('./FacebookAnalytics.jsx'));
const channels=[{key:'facebook',name:'Facebook',description:'Tương tác · lượt xem · followers',icon:'f'},{key:'instagram',name:'Instagram',description:'Tiếp cận · nội dung · tương tác',icon:'◎'},{key:'website',name:'Website GA4',description:'Người truy cập · phiên · lượt xem',icon:'↗'},{key:'maps',name:'Google Maps',description:'Hiển thị · gọi điện · chỉ đường',icon:'⌖'}];
export default function Marketing({user,onConnect}){
 const [tab,setTab]=useState(()=>new URLSearchParams(window.location.search).has('ga4')?'website':channels.some(c=>c.key===sessionStorage.getItem('marketing-tab'))?sessionStorage.getItem('marketing-tab'):'facebook');
 function select(value){setTab(value);sessionStorage.setItem('marketing-tab',value);}
 return <main className="content marketing-page marketing-hub"><header className="marketing-hero"><div><p className="eyebrow">VISTA JOURNEY · MARKETING</p><h1>Hiệu quả tiếp cận</h1><p>Theo dõi mạng xã hội, website và Google Maps trong cùng một không gian.</p></div><span className="marketing-hero-badge">4 kênh theo dõi</span></header><nav className="marketing-channel-nav" aria-label="Kênh marketing">{channels.map(c=><button key={c.key} aria-pressed={tab===c.key} className={tab===c.key?'selected':''} onClick={()=>select(c.key)}><span className="marketing-channel-icon" aria-hidden="true">{c.icon}</span><span><strong>{c.name}</strong><small>{c.description}</small></span><span aria-hidden="true">↗</span></button>)}</nav><div className="marketing-channel-content" key={tab}><Suspense fallback={<section className="panel" role="status">Đang mở biểu đồ marketing…</section>}>{tab==='facebook'?<FacebookAnalytics user={user} embedded/>:tab==='instagram'?<InstagramAnalytics user={user}/>:tab==='website'?<WebsiteAnalytics user={user}/>:<GoogleBusinessAnalytics user={user} onConnect={onConnect}/>}</Suspense></div></main>;
}
