import { useEffect,useState,lazy,Suspense } from 'react';
import WorkspaceHome from './pages/WorkspaceHome.jsx';
import './modules/workspace.css';
const BluejayModule=lazy(()=>import('./modules/bluejay/BluejayModule.jsx'));
const workspaceDate=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'long',year:'numeric'}).format(new Date());
const bluejayTitles={dashboard:'Tổng quan công suất',occupancy:'Công suất chi tiết',reservations:'Đặt phòng',services:'Dịch vụ',sync:'Đồng bộ Blue Jay'};
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Places from './pages/Places.jsx';
import OtaReviews from './pages/OtaReviews.jsx';
import History from './pages/History.jsx';
import Attention from './pages/Attention.jsx';
import GrowthComparison from './pages/GrowthComparison.jsx';
import Evidence from './pages/Evidence.jsx';
import WeeklyReports from './pages/WeeklyReports.jsx';
import {insightTitles,alertText,visibleAlerts} from './lib/insight-labels.js';
import LocationGroup,{locationPages} from './pages/LocationGroup.jsx';
import { api } from './lib/api.js';
import Icon from './components/Icon.jsx';
export default function App(){
 const [module,setActiveModule]=useState(()=>new URLSearchParams(window.location.search).has('google')?'reviews':['home','reviews','bluejay'].includes(sessionStorage.getItem('workspace-module'))?sessionStorage.getItem('workspace-module'):'home');
 const [bluejayTab,setBluejayTab]=useState('dashboard');
 function setModule(value){setActiveModule(value);sessionStorage.setItem('workspace-module',value);}
 const [page,setPage]=useState(()=>new URLSearchParams(window.location.search).has('google')?'places':'dashboard');const [login,setLogin]=useState(false);const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const [focus,setFocus]=useState({}),[alerts,setAlerts]=useState([]),[toast,setToast]=useState(null);
 function go(next,context={}){setModule("reviews");setFocus(context);setPage(next);}
 useEffect(()=>{
  if(login||!sessionStorage.getItem('review-access-token')){setAlerts([]);setToast(null);return;}
  let stopped=false,known=null;
  async function poll(){if(document.visibilityState==='hidden')return;try{const data=await api('/api/insights?days=7');if(stopped)return;const fresh=visibleAlerts(data.alerts).filter(a=>a.relationship==='managed'&&!a.read);setAlerts(fresh);if(known){const added=fresh.find(a=>!known.has(a.key));if(added)setToast(added);}known=new Set(fresh.map(a=>a.key));}catch{}}
  poll();const timer=setInterval(poll,60000);window.addEventListener('insights-updated',poll);return()=>{stopped=true;clearInterval(timer);window.removeEventListener('insights-updated',poll);};
 },[login]);
 useEffect(()=>{const required=()=>setLogin(true);window.addEventListener('auth-required',required);return()=>window.removeEventListener('auth-required',required);},[]);
 async function signIn(e){e.preventDefault();setBusy(true);setError('');try{await api('/api/session',{headers:{Authorization:'Bearer '+password}});sessionStorage.setItem('review-access-token',password);setPassword('');setLogin(false);}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(login)return <main className="login-page"><form className="card form-card" onSubmit={signIn}><span className="login-brand"><Icon name="hotel" size={22}/> VJH Workspace</span><span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h1>Không gian quản lý<br/>của bạn.</h1><p>Đăng nhập để theo dõi đánh giá khách hàng và hoạt động kinh doanh.</p><label>Mật khẩu<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Đang kiểm tra...':'Đăng nhập'}</button>{error && <p role="alert" className="notice error">{error}</p>}</form></main>;
 return <div className="layout"><Sidebar module={module} setModule={setModule} bluejayTab={bluejayTab} setBluejayTab={setBluejayTab} page={page} setPage={go} onLogout={()=>{sessionStorage.removeItem('review-access-token');setLogin(true);}}/><div className="app-main"><div className="workspace-bar"><div><button className="breadcrumb-home" onClick={()=>setModule("home")}>VJH Workspace</button> <Icon name="chevron" size={14}/><strong>{module==='home'?'Tổng quan hệ thống':module==='bluejay'?bluejayTitles[bluejayTab]:locationPages[page]?.title||insightTitles[page]||(page==='dashboard'?'Tổng quan':page==='history'?'Biểu đồ & lịch sử':page==='ota'?'Đánh giá OTA':'Kết nối Google')}</strong></div><time className="workspace-date">{workspaceDate}</time><button className="alerts-button" onClick={()=>go('attention')} aria-label="Mở cảnh báo"><Icon name="alert" size={16}/>Cảnh báo{alerts.length>0&&<b>{alerts.length>99?'99+':alerts.length}</b>}</button><span className="workspace-tag"><Icon name="link" size={13}/> {module==='bluejay'?'Blue Jay PMS':module==='home'?'VJH Workspace':'Google + OTA'}</span></div>{module==='home'?<WorkspaceHome onOpen={(value,next)=>{setModule(value);if(next)setPage(next);}}/>:module==='bluejay'?<Suspense fallback={<main className="content">Đang mở Blue Jay Analytics…</main>}><BluejayModule tab={bluejayTab} onTabChange={setBluejayTab}/></Suspense>:locationPages[page]?<LocationGroup key={page} page={page}/>:page==='dashboard'?<Dashboard onManage={()=>go('places')} onAttention={()=>go('attention')}/>:page==='history'?<History key={(focus.entity||'')+(focus.source||'')} focus={focus} onEvidence={v=>go('evidence',v)}/>:page==='attention'?<Attention onHistory={v=>go('history',v)} onEvidence={v=>go('evidence',v)}/>:page==='compare'?<GrowthComparison/>:page==='evidence'?<Evidence key={(focus.entity||'')+(focus.source||'')+(focus.historyId||'')} focus={focus}/>:page==='reports'?<WeeklyReports/>:page==='ota'?<OtaReviews/>:<Places/>}</div>{toast&&<aside className="alert-toast" role="status"><div><strong>Cảnh báo mới · {toast.name}</strong><p>{alertText(toast)}</p><button onClick={()=>{go('attention');setToast(null);}}>Xem cảnh báo</button></div><button aria-label="Đóng thông báo" onClick={()=>setToast(null)}>×</button></aside>}</div>;
}
