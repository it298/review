import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkoutRevenue,revenueDay} from '../src/modules/bluejay/revenue.js';
const row={bookingCode:'A',roomName:'101',source:'Agoda',status:'Đã trả phòng',checkOutTime:'2026-10-02 12:00:00',roomPrice:1000,servicePrice:200,totalPrice:1200,payment:500,balance:600,deposit:100};
test('checkout revenue includes entire completed stay once in checkout period, never adds payment/deposit/service report',()=>{
 const r=checkoutRevenue([row,{...row,roomName:'102',roomPrice:300,servicePrice:0,totalPrice:300},{...row,status:'Đã hủy'},{...row,status:'No Show'},{...row,status:'Đã nhận phòng'},{...row,checkOutTime:'2026-11-01'},{...row,checkOutTime:'bad'}],'2026-10-01','2026-10-31');
 assert.equal(r.totals.revenue,1500);assert.equal(r.totals.bookings,1);assert.equal(r.totals.rows,2);assert.equal(r.excluded.length,5);assert.equal(r.daily[0].revenue,1500);assert.equal(r.sources[0].revenue,1500);
});
test('missing amounts stay unavailable; negative adjustments and zero preserved; source totals reconcile',()=>{
 const r=checkoutRevenue([row,{...row,bookingCode:'',roomPrice:null,servicePrice:0}],'2026-10-02','2026-10-02');assert.equal(r.totals.revenue,null);assert.equal(r.totals.servicePrice,200);assert.equal(r.missingAmounts,1);assert.equal(r.unknownBookings,1);
 const z=checkoutRevenue([{...row,roomPrice:-100,servicePrice:0,totalPrice:-100},{...row,roomPrice:0,servicePrice:0,totalPrice:0}],'2026-10-02','2026-10-02');assert.equal(z.totals.revenue,-100);assert.equal(z.mismatches,0);
 const diff=checkoutRevenue([{...row,totalPrice:999}],'2026-10-02','2026-10-02');assert.equal(diff.mismatches,1);
});
test('checkout dates use Vietnam day for offsets and validate calendar days',()=>{assert.equal(revenueDay('2026-10-01T18:00:00Z'),'2026-10-02');assert.equal(revenueDay('2026-02-30'),null);assert.equal(revenueDay('2026-10-02 12:00:00'),'2026-10-02');});
test('booking codes are counted independently across hotels; an empty valid report is zero',()=>{const r=checkoutRevenue([{...row,hotelId:1},{...row,hotelId:2}],'2026-10-02','2026-10-02');assert.equal(r.totals.bookings,2);assert.equal(r.sources[0].bookings,2);assert.equal(checkoutRevenue([],'2026-10-01','2026-10-31').totals.revenue,0);});
