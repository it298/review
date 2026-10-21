import {lazy,Suspense,useState} from 'react';
import GoogleBusinessAnalytics from '../components/GoogleBusinessAnalytics.jsx';
import WebsiteAnalytics from '../components/WebsiteAnalytics.jsx';
import InstagramAnalytics from '../components/InstagramAnalytics.jsx';
import './marketing.css';
const MarketingOverview=lazy(()=>import('../components/MarketingOverview.jsx'));
const TikTokAnalytics=lazy(()=>import('../components/TikTokAnalytics.jsx'));
const FacebookAnalytics=lazy(()=>import('./FacebookAnalytics.jsx'));
const channels=[{key:'overview',name:'Tổng quan',description:'Tất cả nguồn · cùng màn hình',icon:'◉'},{key:'tiktok',name:'TikTok',description:'Follower · video · lượt xem',icon:'♪'},{key:'facebook',name:'Facebook',description:'Tương tác · lượt xem · followers',icon:'f'},{key:'instagram',name:'Instagram',description:'Tiếp cận · nội dung · tương tác',icon:'◎'},{key:'website',name:'Website GA4',description:'Người truy cập · phiên · lượt xem',icon:'↗'},{key:'maps',name:'Google Maps',description:'Hiển thị · gọi điện · chỉ đường',icon:'⌖'}];
export default function Marketing({user,onConnect}){
 const [tab,setTab]=useState(()=>new URLSearchParams(window.location.search).has('tiktok')?'tiktok':new URLSearchParams(window.location.search).has('ga4')?'website':channels.some(c=>c.key===sessionStorage.getItem('marketing-tab'))?sessionStorage.getItem('marketing-tab'):'overview');
 function select(value){setTab(value);sessionStorage.setItem('marketing-tab',value);}
 return <main className="content marketing-page marketing-hub"><header className="marketing-hero"><div><p className="eyebrow">VISTA JOURNEY · MARKETING</p><h1>Hiệu quả tiếp cận</h1><p>Theo dõi Facebook, Instagram, TikTok, website và Google Maps trong cùng một không gian.</p></div><span className="marketing-hero-badge">5 kênh theo dõi</span></header><nav className="marketing-channel-nav" aria-label="Kênh marketing">{channels.map(c=><button key={c.key} aria-pressed={tab===c.key} className={tab===c.key?'selected':''} onClick={()=>select(c.key)}><span className="marketing-channel-icon" aria-hidden="true">{c.icon}</span><span><strong>{c.name}</strong><small>{c.description}</small></span><span aria-hidden="true">↗</span></button>)}</nav><div className="marketing-channel-content" key={tab}><Suspense fallback={<section className="panel" role="status">Đang mở biểu đồ marketing…</section>}>{tab==='overview'?<MarketingOverview onOpen={select}/>:tab==='tiktok'?<TikTokAnalytics user={user}/>:tab==='facebook'?<FacebookAnalytics user={user} embedded/>:tab==='instagram'?<InstagramAnalytics user={user}/>:tab==='website'?<WebsiteAnalytics user={user}/>:<GoogleBusinessAnalytics user={user} onConnect={onConnect}/>}</Suspense></div></main>;
}
