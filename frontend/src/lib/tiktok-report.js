export function tiktokVideosForPeriod(report,from,to){return (report?.videos||[]).filter(v=>(!from||v.date>=from)&&(!to||v.date<=to));}
export function tiktokVideoTotal(videos,metric){if(!videos.length)return 0;if(videos.some(v=>v[metric]==null))return null;const sum=videos.reduce((n,v)=>n+v[metric],0);return Number.isSafeInteger(sum)?sum:null;}
