import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOccupancy} from '../src/modules/bluejay/normalize.js';

test('occupancy excludes M-standard from room rows and totals, including cached raw reports',()=>{
  const raw={data:{GrandTotal:{GrandTotalRoomOccupied:8,GrandTotalBlocked:2,GrandTotalRoom:15,GrandTotalRoomEmpty:5,GrandTotalOccupancyRate:61.54,RoomTypes:[
    {RoomTypeId:1,RoomTypeName:' M-STANDARD ',RoomTypeTotalRoomOccupied:3,RoomTypeBlocked:1,RoomTypeTotalRoom:5,RoomTypeTotalRoomEmpty:1,DailyDetails:[{Date:'2026-10-13',RoomOccupied:3}]},
    {RoomTypeId:2,RoomTypeName:'Standard',RoomTypeTotalRoomOccupied:5,RoomTypeBlocked:1,RoomTypeTotalRoom:10,RoomTypeTotalRoomEmpty:4,RoomTypeTotalOccupancyRate:55.56}
  ]}}};
  const original=JSON.stringify(raw),data=normalizeOccupancy(raw);
  assert.deepEqual(data.summary,{occupied:5,blocked:1,total:10,empty:4,occupancyRate:55.56});
  assert.deepEqual(data.roomTypes.map(r=>r.name),['Standard']);
  assert.equal(JSON.stringify(raw),original);
  assert.deepEqual(normalizeOccupancy(raw),data);
  raw.data.GrandTotal.RoomTypes[0].RoomTypeName='M–standard';
  assert.equal(normalizeOccupancy(raw).roomTypes.length,1);
  for (const name of ['M-Standard Room-1 Bed', 'M-Standard Room-2 Beds', 'M-standard (Virtual)', 'M Standard Room']) {
    raw.data.GrandTotal.RoomTypes[0].RoomTypeName=name;
    assert.equal(normalizeOccupancy(raw).roomTypes.length,1,name);
    assert.equal(normalizeOccupancy(raw).summary.total,10,name);
  }
  raw.data.GrandTotal.RoomTypes[0].RoomTypeName='M-StandardPlus';
  assert.equal(normalizeOccupancy(raw).roomTypes.length,2);
});

test('reports without M-standard preserve provider summary',()=>{
  const data=normalizeOccupancy({GrandTotal:{GrandTotalRoomOccupied:11,GrandTotalBlocked:2,GrandTotalRoom:27,GrandTotalRoomEmpty:14,GrandTotalOccupancyRate:44,RoomTypes:[]}});
  assert.equal(data.summary.occupancyRate,44);
  assert.equal(data.summary.total,27);
});
