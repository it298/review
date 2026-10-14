import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monthRange,roomHistory} from '../../frontend/src/modules/bluejay/room-history.js';
test('monthly room history clips nights, excludes checkout and separates canceled/no-show/holds',()=>{
 const row={bookingCode:'a',roomName:'201',source:'Agoda',status:'Đã trả phòng',checkInTime:'2026-09-29',checkOutTime:'2026-10-03'};
 const rows=[row,{...row,bookingCode:'b',source:'Booking.com',checkInTime:'2026-10-30',checkOutTime:'2026-11-02',status:'Đã xác nhận'},{...row,bookingCode:'c',status:'Đã huỷ'},{...row,bookingCode:'d',status:'Không đến'},{...row,bookingCode:'e',status:'Đang giữ phòng'},{...row,bookingCode:'f',checkInTime:'2026-09-28',checkOutTime:'2026-10-01'},{...row,bookingCode:'g',roomName:'202'},{...row,bookingCode:'h',checkInTime:'bad'}];
 const result=roomHistory(rows,'2026-10','201');
 assert.equal(result.rows.length,5);assert.equal(result.invalidDates,1);
 assert.equal(result.groups.find(g=>g.source==='Agoda').bookedNights,2);
 assert.equal(result.groups.find(g=>g.source==='Agoda').excludedRows,3);
 assert.equal(result.groups.find(g=>g.source==='Booking.com').bookedNights,2);
 assert.equal(result.rows.find(r=>r.bookingCode==='a').monthFrom,'2026-10-01');
 assert.equal(roomHistory(rows,'2026-10','202').rows.length,1);
 assert.equal(monthRange('2028-02').to,'2028-02-29');assert.equal(monthRange('2026-13'),null);
});
