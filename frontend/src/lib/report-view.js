import {platforms} from './directory.js';
export const reportDate=value=>value?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
export function reportGroups(rows){
 const groups=new Map();
 for(const row of rows){const group=groups.get(row.entity_key)||{key:row.entity_key,name:row.name,category:row.category,sources:{}};group.sources[row.source]=row;groups.set(row.entity_key,group);}
 return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'));
}
export function reportView(report,{category='all',source='all',query='',movement='all',metric='count'}={}){
 if(!report)return null;
 const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
 const text=normalize(query.trim()),field=metric==='rating'?'rating_change':'count_change';
 const rows=report.rows.filter(r=>(category==='all'||r.category===category)&&(source==='all'||r.source===source)&&(!text||normalize(r.name).includes(text))&&(movement==='all'||r[field]!=null&&(movement==='up'?r[field]>0:movement==='down'?r[field]<0:r[field]!==0)));
 const keys=new Set(rows.map(r=>r.entity_key+':'+r.source));
 return {...report,rows,locations:new Set(rows.map(r=>r.entity_key)).size,confirmed_sources:rows.filter(r=>r.status==='confirmed').length,missing_sources:rows.filter(r=>r.status==='missing').length,
  alerts:(report.alerts||[]).filter(a=>keys.has(a.entity_key+':'+a.source)),
  top_growth:rows.filter(r=>r.count_change>0).sort((a,b)=>b.count_change-a.count_change).slice(0,5),rating_drops:rows.filter(r=>r.rating_change!=null&&r.rating_change<0).sort((a,b)=>a.rating_change-b.rating_change).slice(0,5),
  filters:{category,source,query:query.trim(),movement,metric}};
}
export const reportSources=rows=>Object.keys(platforms).filter(source=>rows.some(r=>r.source===source));
