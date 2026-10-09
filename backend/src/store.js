import { randomUUID } from 'node:crypto';
import { calendarDate } from './utils/date.js';

export async function rpc(name, args = {}) {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error('Chưa cấu hình Supabase.');
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('URL Supabase không hợp lệ.');
  const headers = { apikey: secret, 'Content-Type': 'application/json' };
  if (!secret.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + secret;
  const response = await fetch(new URL('/rest/v1/rpc/' + name, base), {
    method: 'POST', headers, body: JSON.stringify(args), signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if(name==='review_tracker_manual_summary_ingest'&&data?.code==='22023')throw Object.assign(new Error(data.message),{status:400});
    if (data?.code === '23505') throw Object.assign(new Error('Địa điểm Google này đã được theo dõi. Chọn bản ghi đã có.'), {status:409});
    if (data?.code === 'P0002') throw Object.assign(new Error('Không tìm thấy địa điểm.'), { status: 404 });
    throw new Error('Không truy cập được Supabase. Kiểm tra secret key và chạy file SQL khởi tạo.');
  }
  return data;
}
export function state() { return rpc('review_tracker_state'); }
export function mutate(payload) { return rpc('review_tracker_mutate', { p: { ...payload, now: new Date().toISOString(), date: calendarDate() } }); }
export function getValue(name) { return rpc('review_tracker_kv_get', { p_key: name }); }
export function setValue(name, value, seconds = 86400) { return rpc('review_tracker_kv_set', { p_key: name, p_value: value, p_seconds: seconds }); }
export function deleteValue(name) { return rpc('review_tracker_kv_delete', { p_key: name }); }
export async function lock(name, seconds = 280) {
  const token = randomUUID();
  const ok = await rpc('review_tracker_lock', { p_name: name, p_token: token, p_seconds: seconds });
  return ok ? () => rpc('review_tracker_unlock', { p_name: name, p_token: token }) : null;
}
