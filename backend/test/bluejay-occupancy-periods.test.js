import {test} from 'node:test';
import assert from 'node:assert/strict';
import {occupancyPeriods,getRoomOccupancy} from '../src/modules/bluejay/bluejay.js';
import {normalizeOccupancy} from '../src/modules/bluejay/normalize.js';
test('occupancy ranges are split at month boundaries without gaps or duplicate days',()=>{
 assert.deepEqual(occupancyPeriods('2026-01-30','2026-03-02'),[{from:'2026-01-30',to:'2026-01-31'},{from:'2026-02-01',to:'2026-02-28'},{from:'2026-03-01',to:'2026-03-02'}]);
 assert.equal(occupancyPeriods('2026-01-01','2026-10-14').length,10);
 assert.throws(()=>occupancyPeriods('2026-02-30','2026-03-01'));
 assert.deepEqual(occupancyPeriods('2028-02-01','2028-02-29'),[{from:'2028-02-01',to:'2028-02-29'}]);
});
test('monthly responses merge room nights, daily rows and weighted occupancy; partial errors are never returned as success',async()=>{
 const old=globalThis.fetch,key=process.env.BLUEJAY_API_KEY;process.env.BLUEJAY_API_KEY='test-only';let fail=false,calls=[];
 globalThis.fetch=async url=>{const params=new URL(url).searchParams;calls.push(Object.fromEntries(params));if(fail&&params.get('from')==='2026-02-01')return new Response(JSON.stringify({errors:{message:'khoảng cách giữa ngày from và to không được quá 1 tháng'}}));
 const used=params.get('from')==='2026-01-31'?1:3;
 return new Response(JSON.stringify({data:{GrandTotal:{GrandTotalRoomOccupied:used,GrandTotalBlocked:1,GrandTotalRoom:5,GrandTotalRoomEmpty:4-used,GrandTotalOccupancyRate:used/4*100,RoomTypes:[{RoomTypeId:1,RoomTypeName:'Standard',RoomTypeTotalRoomOccupied:used,RoomTypeBlocked:1,RoomTypeTotalRoom:5,RoomTypeTotalRoomEmpty:4-used,DailyDetails:[{Date:params.get('from'),RoomOccupied:used,Blocked:1,TotalRoom:5,EmptyRoom:4-used}]}]}}}));};
 try{
  const raw=await getRoomOccupancy({hotelId:5381,from:'2026-01-31',to:'2026-02-01'}),n=normalizeOccupancy(raw);
  assert.deepEqual(n.summary,{occupied:4,blocked:2,total:10,empty:4,occupancyRate:50});
  assert.equal(n.roomTypes[0].daily.length,2);assert.equal(raw.meta.assembled,true);
  assert.deepEqual(calls.map(p=>[p.from,p.to]),[['2026-01-31','2026-01-31'],['2026-02-01','2026-02-01']]);
  fail=true;await assert.rejects(()=>getRoomOccupancy({hotelId:5381,from:'2026-01-31',to:'2026-02-01'}),{code:'BLUEJAY_RANGE'});
 }finally{globalThis.fetch=old;if(key===undefined)delete process.env.BLUEJAY_API_KEY;else process.env.BLUEJAY_API_KEY=key;}
});
