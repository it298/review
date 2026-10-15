import {createHash} from 'node:crypto';
import {getValue,rpc,lock} from '../../store.js';
import {normalizeOccupancy,normalizeReservations,normalizeServices} from './normalize.js';
const persist=(key,value)=>rpc('review_tracker_bluejay_cache_set',{p_key:key,p_value:value});
const lifetime=366*86400;
const stable=params=>Object.fromEntries(Object.entries(params||{}).filter(([,v])=>v!==undefined&&v!==null&&v!=='').sort(([a],[b])=>a.localeCompare(b)));
export function recordKey(type,hotelId,params={}){return 'bluejay:record:'+createHash('sha256').update(JSON.stringify([type,String(hotelId),stable(params)])).digest('hex');}
const validators={occupancy:normalizeOccupancy,reservations:normalizeReservations,services:normalizeServices};
const backupKey=(type,hotelId,params)=>recordKey(type,hotelId,{...params,__lastValid:true});
function validRecord(type,record){if(!record)return false;try{if(validators[type])validators[type](record.value);else if(!['payables','payables-history'].includes(type))return false;return true;}catch{return false;}}
export async function getRecord(type,hotelId,params={}){
 const current=await getValue(recordKey(type,hotelId,params));
 if(validRecord(type,current))return current;
 if(current){const backup=await getValue(backupKey(type,hotelId,params));if(validRecord(type,backup))return backup;}
 return null;
}
async function editIndex(callback){let release;for(let attempt=0;attempt<10&&!release;attempt++){release=await lock('bluejay:index',30);if(!release)await new Promise(resolve=>setTimeout(resolve,60));}if(!release)throw Object.assign(new Error('Đồng bộ Blue Jay đang bận. Thử lại sau.'),{status:409});try{return await callback();}finally{await release();}}
export async function putRecord(type,hotelId,params,value,source='live'){
 const validate=validators[type];
 if(!validate&&!['payables','payables-history'].includes(type))throw Error('Loại dữ liệu Blue Jay chưa hợp lệ.');
 if(validate)validate(value);
 const key=recordKey(type,hotelId,params),record={type,hotelId:Number(hotelId),params:stable(params),savedAt:new Date().toISOString(),source,value};
 if(JSON.stringify(record).length>5000000)throw Error('Báo cáo quá lớn; chọn khoảng ngày ngắn hơn.');
 const previous=await getValue(key);
 if(validRecord(type,previous))await persist(backupKey(type,hotelId,params),previous);
 await persist(key,record);
 await editIndex(async()=>{const rows=await getValue('bluejay:index')||{};rows[key]={type,hotelId:record.hotelId,savedAt:record.savedAt};await persist('bluejay:index',rows);});return record;
}
export async function appendSyncLog(entry){await editIndex(async()=>{const rows=await getValue('bluejay:sync-log')||[];await persist('bluejay:sync-log',[{at:new Date().toISOString(),...entry},...rows].slice(0,200));});}
export async function getSyncLog(limit=30){return (await getValue('bluejay:sync-log')||[]).slice(0,limit);}
export async function storeStats(){const rows=Object.values(await getValue('bluejay:index')||{}).filter(r=>Date.parse(r.savedAt)>=Date.now()-lifetime*1000);return {records:rows.length,latestSavedAt:rows.map(r=>r.savedAt).sort().at(-1)||null};}
