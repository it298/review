const key='vjh-session';
export function sessionToken(){return sessionStorage.getItem(key)||localStorage.getItem(key)||sessionStorage.getItem('review-access-token');}
export function saveSession(token,remember){clearSession();(remember?localStorage:sessionStorage).setItem(key,token);}
export function clearSession(){sessionStorage.removeItem(key);localStorage.removeItem(key);sessionStorage.removeItem('review-access-token');sessionStorage.removeItem('workspace-module');}
