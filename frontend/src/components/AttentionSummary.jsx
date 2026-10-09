import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {platforms} from '../lib/directory.js';
import {alertText,visibleAlerts} from '../lib/insight-labels.js';
import Icon from './Icon.jsx';
export default function AttentionSummary({onOpen}){
 const [alerts,setAlerts]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let stop=false;api('/api/insights?days=7').then(d=>{if(!stop)setAlerts(visibleAlerts(d.alerts).filter(a=>a.relationship==='managed'&&!a.read));}).catch(e=>{if(!stop)setError(e.message);});return()=>{stop=true;};},[]);
 return <section className="card attention-summary"><div className="source-heading"><div><h2><Icon name="alert"/> Cần chú ý hôm nay</h2><p>{alerts===null?'Đang kiểm tra biến động…':alerts.length?alerts.length+' cảnh báo chưa xem của công ty.':'Chưa có cảnh báo mới đủ điều kiện.'}</p></div><button onClick={onOpen}>Xem tất cả</button></div>{error&&<p className="notice error">Không tải được cảnh báo: {error}</p>}<div className="attention-mini">{alerts?.slice(0,3).map(a=><button key={a.key} onClick={onOpen}><span className={'severity-dot '+a.severity}/><div><strong>{a.name} · {platforms[a.source]?.name}</strong><small>{alertText(a)}</small></div><Icon name="chevron"/></button>)}</div></section>;
}
