import { useEffect,useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Places from './pages/Places.jsx';
import OtaReviews from './pages/OtaReviews.jsx';
import History from './pages/History.jsx';
import LocationGroup,{locationPages} from './pages/LocationGroup.jsx';
import { api } from './lib/api.js';
import Icon from './components/Icon.jsx';
export default function App(){
 const [page,setPage]=useState(()=>new URLSearchParams(window.location.search).has('google')?'places':'dashboard');const [login,setLogin]=useState(false);const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{const required=()=>setLogin(true);window.addEventListener('auth-required',required);return()=>window.removeEventListener('auth-required',required);},[]);
 async function signIn(e){e.preventDefault();setBusy(true);setError('');try{await api('/api/session',{headers:{Authorization:'Bearer '+password}});sessionStorage.setItem('review-access-token',password);setPassword('');setLogin(false);}catch(e){setError(e.message);}finally{setBusy(false);}}
 if(login)return <main className="login-page"><form className="card form-card" onSubmit={signIn}><h1>Theo dõi review</h1><p>Nhập mật khẩu truy cập ứng dụng.</p><label>Mật khẩu<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Đang kiểm tra...':'Đăng nhập'}</button>{error && <p role="alert" className="notice error">{error}</p>}</form></main>;
 return <div className="layout"><Sidebar page={page} setPage={setPage} onLogout={()=>{sessionStorage.removeItem('review-access-token');setLogin(true);}}/><div className="app-main"><div className="workspace-bar"><div>Workspace <Icon name="chevron" size={14}/><strong>{locationPages[page]?.title||(page==='dashboard'?'Tổng quan':page==='history'?'Biểu đồ & lịch sử':page==='ota'?'Đánh giá OTA':'Kết nối Google')}</strong></div><span className="workspace-tag"><Icon name="link" size={13}/> Google + OTA</span></div>{locationPages[page]?<LocationGroup key={page} page={page}/>:page==='dashboard'?<Dashboard onManage={()=>setPage('places')}/>:page==='history'?<History/>:page==='ota'?<OtaReviews/>:<Places/>}</div></div>;
}
