export const reportToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const shiftReportDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function initialReportRange(){const end=reportToday(),weekday=new Date(end+'T00:00:00Z').getUTCDay();return {start:shiftReportDay(end,-((weekday+6)%7)),end};}
