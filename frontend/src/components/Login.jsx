import {useState} from 'react';
import {api} from '../lib/api.js';
import Icon from './Icon.jsx';
import './auth.css';
export default function Login({auth}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[remember,setRemember]=useState(false),[show,setShow]=useState(false),[forgot,setForgot]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  if(auth.recovery){if(password!==confirm)throw Error('Hai mật khẩu chưa khớp.');await auth.resetPassword(password);}
  else if(forgot){const result=await api('/api/auth/forgot-password',{method:'POST',publicRequest:true,body:JSON.stringify({email})});setMessage(result.message);}
  else{await auth.signIn(email,password,remember);setPassword('');}
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="login-page"><form className="card form-card" onSubmit={submit}><span className="login-brand"><Icon name="hotel" size={23}/> Vista Journey</span><span className="eyebrow">VJH WORKSPACE</span><h1>{auth.recovery?'Đặt mật khẩu mới.':forgot?'Khôi phục tài khoản.':'Chào mừng trở lại.'}</h1><p>{auth.recovery?'Chọn mật khẩu mới từ 12 ký tự.':forgot?'Nhập email đã được cấp quyền. Chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.':'Đăng nhập để theo dõi đánh giá và hoạt động kinh doanh.'}</p>
  {auth.mode==='supabase'&&!auth.recovery&&<label>Email công việc<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>}
  {!forgot&&<label>{auth.recovery?'Mật khẩu mới':'Mật khẩu'}<div className="auth-password-field"><input type={show?'text':'password'} autoComplete={auth.recovery?'new-password':'current-password'} required minLength={auth.recovery?12:undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/><button type="button" aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={show} onClick={()=>setShow(v=>!v)}>{show?'Ẩn':'Hiện'}</button></div></label>}
  {auth.recovery&&<label>Nhập lại mật khẩu<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={busy}/></label>}
  {!forgot&&!auth.recovery&&auth.mode==='supabase'&&<div className="auth-options"><label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Giữ đăng nhập 7 ngày</label><button type="button" onClick={()=>{setForgot(true);setError('');}}>Quên mật khẩu?</button></div>}
  <button className="primary" disabled={busy}>{busy?'Đang xử lý…':auth.recovery?'Lưu mật khẩu mới':forgot?'Gửi hướng dẫn':'Đăng nhập'}</button>
  {(error||auth.message)&&<p role={error?'alert':'status'} className={'notice '+(error?'error':'')}>{error||auth.message}</p>}{message&&<p role="status" className="notice success">{message}</p>}
  {forgot&&<button className="auth-back" type="button" onClick={()=>{setForgot(false);setMessage('');setError('');}}>Quay lại đăng nhập</button>}
  {!forgot&&!auth.recovery&&<small className="auth-footnote">Tài khoản nội bộ do quản trị viên cấp quyền.</small>}
 <a className="auth-footnote" href="/privacy" target="_blank" rel="noreferrer">Chính sách quyền riêng tư</a>
 </form></main>;
}
