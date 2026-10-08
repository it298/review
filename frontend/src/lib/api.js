export async function api(path, options = {}) {
 const {headers,...rest}=options;
 const token=sessionStorage.getItem('review-access-token');
 const base=(import.meta.env.VITE_API_URL || '').replace(/\/$/,'');
 if(import.meta.env.PROD && !base)throw new Error('Chưa cấu hình VITE_API_URL của Web Service.');
 const response=await fetch(base+path,{...rest,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers}});
 const data=await response.json().catch(()=>({error:'Máy chủ trả về dữ liệu không hợp lệ.'}));
 if(response.status===401)window.dispatchEvent(new Event('auth-required'));
 if(!response.ok)throw new Error(data.error || 'Yêu cầu thất bại.');return data;
}
export async function apiBlob(path){
 const token=sessionStorage.getItem('review-access-token'),base=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
 if(import.meta.env.PROD&&!base)throw new Error('Chưa cấu hình API.');
 const response=await fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:{}});
 if(response.status===401)window.dispatchEvent(new Event('auth-required'));
 if(!response.ok)throw new Error('Không tải được ảnh kiểm chứng ('+response.status+').');return response.blob();
}
