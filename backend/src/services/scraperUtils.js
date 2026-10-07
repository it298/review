export function validateMapsUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('URL Google Maps không hợp lệ.'); }
  const host = url.hostname.toLowerCase();
  const allowed = ['google.com', 'www.google.com', 'maps.google.com', 'google.com.vn', 'www.google.com.vn', 'maps.google.com.vn'];
  const short = host === 'maps.app.goo.gl' || host === 'goo.gl';
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (!allowed.includes(host) && !short)) throw new Error('Chỉ hỗ trợ URL HTTPS Google Maps chính thức.');
  if (host === 'goo.gl' && !url.pathname.startsWith('/maps/')) throw new Error('URL rút gọn phải là goo.gl/maps/.');
  if (!short && !host.startsWith('maps.') && !/^\/maps(?:\/|$)/.test(url.pathname)) throw new Error('URL phải dẫn đến Google Maps.');
  return url.href;
}
export function parseRating(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 && value <= 5 ? value : null;
}
export function workerCount(input, total) {
  const value = Number(input ?? 3);
  return Math.min(Number.isInteger(value) && value > 0 ? Math.min(value, 5) : 3, Math.max(1,total));
}
export function mapsIdentity(input) {
  const url = new URL(input);
  const cid = url.searchParams.get('cid');
  if (cid && /^\d+$/.test(cid)) return 'cid:' + BigInt(cid).toString(16);
  const match = decodeURIComponent(url.href).match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (match) return 'cid:' + BigInt('0x' + match[1]).toString(16);
  const id = url.searchParams.get('query_place_id');
  if (id) return 'place:' + id;
  for (const key of ['hl','authuser','entry','g_ep','utm_source','utm_medium','utm_campaign']) url.searchParams.delete(key);
  url.hash = '';
  return url.href;
}

export function parseLocalizedCount(value) {
  const raw = String(value ?? '').replace(/\u00a0/g, ' ').trim().replace(/^\(\s*|\s*\)$/g, '');
  if (/^\d+$/.test(raw)) return Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
  if (/^\d{1,3}(?:([., ])\d{3})+$/.test(raw)) {
    const value = Number(raw.replace(/\D/g, ''));
    return Number.isSafeInteger(value) ? value : null;
  }
  return null;
}
export function extractCountFromReviewLabel(text) {
  const raw = String(text ?? '').replace(/\u00a0/g, ' ').trim();
  const words = '(?:reviews?|ratings?|đánh\\s*giá|avis|reseñas|recensioni|bewertungen|recenzji)';
  const before = raw.match(new RegExp('([0-9][0-9., ]*)\\s*' + words, 'i'));
  if (before) return parseLocalizedCount(before[1]);
  const after = raw.match(new RegExp(words + '\\s*[:：]?\\s*([0-9][0-9., ]*)', 'i'));
  return after ? parseLocalizedCount(after[1]) : null;
}
