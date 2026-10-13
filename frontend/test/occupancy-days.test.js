import {test} from 'node:test';
import assert from 'node:assert/strict';
import {occupancyDays} from '../src/modules/bluejay/occupancy-days.js';
test('daily chart combines room types by day and excludes blocked rooms from available capacity',()=>{
  const rows=[{daily:[{date:'2026-10-14',occupied:2,total:5,blocked:0,empty:3},{date:'2026-10-13T00:00:00',occupied:4,total:10,blocked:2,empty:4}]},{daily:[{date:'2026-10-13',occupied:7,total:17,blocked:0,empty:10}]}];
  assert.deepEqual(occupancyDays(rows),[{date:'2026-10-13',occupied:11,total:27,blocked:2,empty:14,occupancyRate:44},{date:'2026-10-14',occupied:2,total:5,blocked:0,empty:3,occupancyRate:40}]);
  assert.deepEqual(occupancyDays([]),[]);
  assert.equal(occupancyDays([{daily:[{date:'2026-10-13',total:2,blocked:2,occupied:0}]}])[0].occupancyRate,null);
});
