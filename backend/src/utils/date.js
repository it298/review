import 'dotenv/config';
export const TIMEZONE = process.env.TIMEZONE || 'Asia/Ho_Chi_Minh';
export function calendarDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = type => parts.find(p => p.type === type).value;
  return get('year') + '-' + get('month') + '-' + get('day');
}
