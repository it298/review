import test from 'node:test';import assert from 'node:assert/strict';
import {filterOccupancy} from '../src/modules/bluejay/occupancy-filter.js';
test('room-type filter keeps provider totals and rate, without mixing other types',()=>{
 const data={summary:{occupied:11,total:27,blocked:2,empty:14,occupancyRate:44},roomTypes:[{id:41,name:'Standard',occupied:4,total:10,blocked:2,empty:4,occupancyRate:50,daily:[{date:'2026-10-13',occupied:4}]},{id:42,name:'Suite',occupied:7,total:17,blocked:0,empty:10,occupancyRate:41.18,daily:[{date:'2026-10-13',occupied:7}]}]};
 assert.equal(filterOccupancy(data),data);const selected=filterOccupancy(data,'41');assert.equal(selected.roomTypes.length,1);assert.equal(selected.summary.occupied,4);assert.equal(selected.summary.total,10);assert.equal(selected.summary.occupancyRate,50);assert.equal(selected.roomTypes[0].daily[0].occupied,4);assert.equal(data.roomTypes.length,2);
 const absent=filterOccupancy(data,'999');assert.equal(absent.summary.occupied,null);assert.equal(absent.roomTypes.length,0);
});
