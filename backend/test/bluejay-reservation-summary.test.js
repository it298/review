import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReservations, normalizeOccupancy} from '../src/modules/bluejay/normalize.js';
import {summarizeBookings} from '../../frontend/src/modules/bluejay/reservation-summary.js';

test('multi-room bookings keep all distinct rooms, count unique codes, remove only identical provider rows and excluded types',()=>{
  const row={bookingCode:'003428',roomType:'Superior',roomName:'R-605',source:'Ctrip',status:'Đã nhận phòng',night:3,roomPrice:2214000,servicePrice:0,totalPrice:2214000,payment:0,balance:2214000,deposit:0};
  const raw={attributes:{reservations:[row,{...row}, {...row,roomName:'R-505',roomPrice:0,totalPrice:0,balance:0}, {...row,roomName:'R-202',status:'Đã huỷ',roomPrice:0,totalPrice:0,balance:0},{...row,bookingCode:'virtual',roomType:'M - STANDARD BED ROOM'}]}};
  const before=JSON.stringify(raw), result=normalizeReservations(raw);
  assert.equal(result.totals.count,1);
  assert.equal(result.totals.roomRows,3);
  assert.equal(result.totals.roomPrice,2214000);
  assert.equal(JSON.stringify(raw),before);
  const summary=summarizeBookings(result.rows);
  assert.equal(summary.bookings,1);
  assert.equal(summary.sources[0].roomRows,3);
  assert.equal(summary.statuses.find(g=>g.label==='Đã hủy').bookings,1);
  assert.equal(summary.statuses.find(g=>g.label==='Đã nhận phòng').roomRows,2);
  assert.equal(summarizeBookings(result.rows.filter(r=>r.status==='Đã huỷ')).totals.roomPrice,0);
});

test('missing financial fields and unknown booking codes are distinct from actual zero and no-show is a status group',()=>{
  const data=normalizeReservations({attributes:{reservations:[{bookingCode:'',status:'Không đến',source:'Booking.com',roomType:'Standard',roomName:'1',roomPrice:0},{bookingCode:'b',status:'Đã trả phòng',roomType:'Standard',roomName:'2'}]}});
  assert.equal(data.totals.count,1);
  assert.equal(data.totals.unknownBookingRows,1);
  assert.equal(data.totals.roomPrice,null);
  const summary=summarizeBookings(data.rows);
  assert.equal(summary.totals.servicePrice,null);
  assert.equal(summary.statuses.find(g=>g.label==='Không đến').roomRows,1);
  assert.equal(summary.sources.find(g=>g.label==='Booking.com').roomPrice,0);
});

test('Gia Lai spaced M-standard is excluded from daily occupancy and recomputed denominator',()=>{
  const data=normalizeOccupancy({GrandTotal:{GrandTotalRoomOccupied:9,GrandTotalRoom:27,GrandTotalBlocked:1,GrandTotalRoomEmpty:17,GrandTotalOccupancyRate:34.62,RoomTypes:[{RoomTypeId:1,RoomTypeName:'M - STANDARD BED ROOM',RoomTypeTotalRoomOccupied:1,RoomTypeTotalRoom:1,RoomTypeBlocked:0,RoomTypeTotalRoomEmpty:0}]}});
  assert.equal(data.summary.occupied,8);
  assert.equal(data.summary.total,26);
  assert.equal(data.summary.occupancyRate,32);
  assert.equal(data.roomTypes.length,0);
});
