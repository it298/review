import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';
import { calendarDate } from '../backend/src/utils/date.js';
let client;
export function redis() {
 if(!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error('Chưa cấu hình Upstash Redis.');
 return client ||= new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN,retry:{retries:1,backoff:()=>200},signal:()=>AbortSignal.timeout(10000)});
}
export const key=name=>(process.env.REDIS_PREFIX || 'review-tracker')+':'+name;
const mutation=String.raw`
local raw=redis.call('GET',KEYS[1])
local s=raw and cjson.decode(raw) or {nextPlaceId=1,nextSnapshotId=1,places={},snapshots={}}
local p=cjson.decode(ARGV[1]);local op=p.op;local id=tostring(p.id or '')
local result={ok=true}
if op=='save' then
 local row=nil
 if p.id then row=s.places[id]; if not row then return cjson.encode({missing=true}) end
 else for k,v in pairs(s.places) do if v.place_id==p.identity then row=v;id=k;break end end end
 if not row then id=tostring(s.nextPlaceId);s.nextPlaceId=s.nextPlaceId+1;row={id=tonumber(id),created_at=p.now,tracked=1};s.places[id]=row end
 if p.custom and p.custom~='' then row.custom_name=p.custom end
 row.name=row.custom_name or p.fresh.name;row.place_id=p.identity;row.address=p.fresh.address
 row.rating=p.fresh.rating;row.user_rating_count=p.fresh.reviewCount;row.google_maps_uri=p.fresh.url
 row.updated_at=p.now;row.last_sync_at=p.now;row.last_error=cjson.null
 local sk=id..':'..p.date;local snap=s.snapshots[sk]
 if not snap then snap={id=s.nextSnapshotId,place_id=tonumber(id)};s.nextSnapshotId=s.nextSnapshotId+1 end
 snap.date=p.date;snap.captured_at=p.now;snap.user_rating_count=p.fresh.reviewCount;snap.rating=p.fresh.rating;s.snapshots[sk]=snap
 result=row
elseif op=='rename' then
 local row=s.places[id];if not row then return cjson.encode({missing=true}) end
 row.name=p.name;row.custom_name=p.name;row.updated_at=p.now;result=row
elseif op=='delete' then
 if not s.places[id] then return cjson.encode({missing=true}) end
 s.places[id]=nil;for k,v in pairs(s.snapshots) do if v.place_id==tonumber(id) then s.snapshots[k]=nil end end
elseif op=='error' then
 if s.places[id] then s.places[id].last_error=p.error end
end
redis.call('SET',KEYS[1],cjson.encode(s));return cjson.encode(result)
`;
export async function state(){return await redis().get(key('state')) || {places:{},snapshots:{}};}
export async function mutate(payload){
 const result=await redis().eval(mutation,[key('state')],[JSON.stringify({...payload,now:new Date().toISOString(),date:calendarDate()})]);
 const data=typeof result==='string'?JSON.parse(result):result;
 if(data.missing) throw Object.assign(new Error('Không tìm thấy địa điểm.'),{status:404});
 return data;
}
export async function lock(name,seconds=280){
 const token=randomUUID();const ok=await redis().set(key(name),token,{nx:true,ex:seconds});
 return ok ? async()=>{await redis().eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",[key(name)],[token]);}:null;
}
