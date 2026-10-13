import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import {clearSession,saveSession,sessionToken} from './auth-session.js';
export default function useAuth(){
 const [state,setState]=useState({status:'loading',mode:'supabase',user:null,message:''}),[recovery,setRecovery]=useState(()=>{
  const hash=new URLSearchParams(window.location.hash.slice(1)),token=hash.get('access_token');
  if(hash.get('type')==='recovery'&&token){history.replaceState(null,'',window.location.pathname);return token;}return null;
 });
 const epoch=useRef(0);
 const invalidate=useCallback((message='Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')=>{epoch.current++;clearSession();setState(s=>({...s,status:'signedOut',user:null,message}));},[]);
 useEffect(()=>{
  let stopped=false;const id=++epoch.current;
  async function load(){try{const config=await api('/api/auth/config',{publicRequest:true});if(stopped||id!==epoch.current)return;
   if(!sessionToken()){setState({status:'signedOut',mode:config.mode,user:null,message:''});return;}
   const result=await api('/api/session');if(!stopped&&id===epoch.current)setState({status:'signedIn',mode:config.mode,user:result.user||{name:'Quản trị viên',role:'admin'},expiresAt:result.expiresAt,message:''});
  }catch(e){if(!stopped){if(e.status===401)invalidate();else setState(s=>({...s,status:'error',message:e.message}));}}}
  load();return()=>{stopped=true;};
 },[invalidate]);
 useEffect(()=>{const required=()=>invalidate(),storage=e=>{if(e.key==='vjh-session'&&!e.newValue)invalidate('Bạn đã đăng xuất trên tab khác.');};window.addEventListener('auth-required',required);window.addEventListener('storage',storage);return()=>{window.removeEventListener('auth-required',required);window.removeEventListener('storage',storage);};},[invalidate]);
 useEffect(()=>{if(state.status!=='signedIn')return;const check=()=>{if(document.visibilityState!=='hidden')api('/api/session').then(d=>setState(s=>s.status==='signedIn'?{...s,user:d.user||s.user,expiresAt:d.expiresAt}:s)).catch(()=>{});};const timer=setInterval(check,60000);window.addEventListener('focus',check);return()=>{clearInterval(timer);window.removeEventListener('focus',check);};},[state.status]);
 useEffect(()=>{if(state.status!=='signedIn'||!state.expiresAt)return;const remaining=Date.parse(state.expiresAt)-Date.now();const timer=setTimeout(()=>invalidate(),Math.max(0,remaining));return()=>clearTimeout(timer);},[state.status,state.expiresAt,invalidate]);
 async function signIn(email,password,remember){const id=++epoch.current;let result;
  if(state.mode==='supabase'){result=await api('/api/auth/login',{method:'POST',publicRequest:true,body:JSON.stringify({email,password,remember})});saveSession(result.token,remember);}
  else{result=await api('/api/session',{publicRequest:true,headers:{Authorization:'Bearer '+password}});saveSession(password,false);}
  if(id===epoch.current)setState(s=>({...s,status:'signedIn',user:result.user||{name:'Quản trị viên',role:'admin'},expiresAt:result.expiresAt,message:''}));
 }
 async function logout(all=false){try{await api('/api/auth/'+(all?'logout-all':'logout'),{method:'POST'});}catch(e){if(e.status!==401){invalidate('Đã thoát trên thiết bị này; máy chủ chưa xác nhận thu hồi phiên.');throw e;}return;}invalidate('Bạn đã đăng xuất.');}
 async function resetPassword(password){await api('/api/auth/reset-password',{method:'POST',publicRequest:true,body:JSON.stringify({accessToken:recovery,password})});setRecovery(null);invalidate('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');}
 return {...state,recovery,signIn,logout,resetPassword,invalidate};
}
