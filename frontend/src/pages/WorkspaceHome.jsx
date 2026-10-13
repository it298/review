import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import Icon from '../components/Icon.jsx';
export default function WorkspaceHome({onOpen}){
 const [directory,setDirectory]=useState(null),[bluejay,setBluejay]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;Promise.all([api('/api/directory'),api('/api/bluejay/status')]).then(([d,b])=>{if(active){setDirectory(d.filter(x=>x.relationship==='managed'));setBluejay(b);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 const hotels=directory?.filter(d=>d.category==='hotel').length;
 return <main className="content workspace-home"><header className="page-header"><div><span className="eyebrow">VJH WORKSPACE</span><h1>Không gian quản lý<span className="heading-dot">.</span></h1><p>Chọn module để theo dõi từng mảng hoạt động của công ty.</p></div></header>
 <section className="hub-summary"><div><span>Cơ sở đang quản lý</span><strong>{directory?directory.length:'—'}</strong></div><div><span>Khách sạn</span><strong>{hotels??'—'}</strong></div><div><span>Module đang có</span><strong>2</strong></div></section>
 <section className="hub-modules" aria-label="Các module"><article className="hub-module-card"><div className="hub-module-icon"><Icon name="star" size={27}/></div><span className="eyebrow">ĐÁNH GIÁ KHÁCH HÀNG</span><h2>Theo dõi đánh giá</h2><p>Điểm và tổng review trên Google Maps, OTA, café và cửa hàng. Xem biến động, lịch sử và báo cáo.</p><div className="hub-module-status">{directory?`${directory.length} địa điểm quản lý`:'Đang đọc danh mục…'}</div><button className="primary" onClick={()=>onOpen('reviews')}>Mở module <Icon name="arrow" size={15}/></button></article>
 <article className="hub-module-card"><div className="hub-module-icon bluejay"><Icon name="hotel" size={27}/></div><span className="eyebrow">KINH DOANH KHÁCH SẠN</span><h2>Blue Jay Analytics</h2><p>Công suất phòng, đặt phòng, doanh thu và dịch vụ. Chọn khoảng ngày và đồng bộ dữ liệu từ Blue Jay PMS.</p><div className="hub-module-status">4 khách sạn · {bluejay?bluejay.configured?'Đã cấu hình kết nối':'Chưa kết nối Blue Jay':'Đang kiểm tra kết nối…'}</div><button className="primary" onClick={()=>onOpen('bluejay')}>Mở module <Icon name="arrow" size={15}/></button></article></section>
 {error&&<p className="notice error" role="alert">{error}</p>}<section className="panel hub-roadmap"><Icon name="plus"/><div><h3>Mở rộng cùng hệ thống</h3><p>Các module bổ sung sẽ xuất hiện tại đây khi được xây dựng.</p></div></section></main>;
}
