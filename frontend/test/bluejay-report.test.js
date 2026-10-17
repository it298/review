import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardReport,reservationsReport} from '../src/modules/bluejay/report-data.js';
import {createBluejayWorkbook} from '../src/modules/bluejay/report-export.js';
const payload={reportFilters:{from:'2026-10-01',to:'2026-10-15',dateType:'1'},hotels:[{hotel:{id:1,name:'Sontra'},ok:true,source:'cache',savedAt:'2026-10-16T01:00:00Z',data:{summary:{total:20,occupied:9,empty:9,blocked:2,occupancyRate:50},roomTypes:[{id:7,name:'Suite',total:20,occupied:9,empty:9,blocked:2,occupancyRate:50,daily:[{date:'2026-10-01',total:10,occupied:4,empty:5,blocked:1},{date:'2026-10-02',total:10,occupied:5,empty:4,blocked:1}]}]}},{hotel:{id:2,name:'Missing'},ok:false},{hotel:{id:3,name:'Yzistel'},ok:true,data:{summary:{total:10,occupied:6,empty:4,blocked:0,occupancyRate:60},roomTypes:[]}}]};
test('dashboard exports scoped hotel, mode, source, daily rows and loaded period',()=>{
 const r=dashboardReport(payload,{hotelId:'1',mode:'hotels'});assert.equal(r.scope,'Sontra');assert.equal(r.from,'2026-10-01');assert.equal(r.sections[0].rows.length,1);assert.equal(r.sections[1].rows[0].room,'Suite');assert.equal(r.sections[2].rows.length,2);assert.equal(r.charts.length,1);assert.equal(r.kpis[0].value,50);assert.match(r.notes[0],/1\/1/);
 r.sections[0].rows[0].occupied=999;assert.equal(payload.hotels[0].data.summary.occupied,9);
});
test('dashboard totals exclude unavailable hotels and weight occupancy by sellable rooms',()=>{
 const r=dashboardReport(payload,{mode:'hotels'});assert.equal(r.kpis[0].value,53.57);assert.equal(r.kpis.find(k=>k.label==='Đã dùng').value,15);assert.equal(r.sections[0].rows[1].total,null);assert.match(r.notes[0],/2\/3/);
 const missing=dashboardReport(payload,{hotelId:'2'});assert.equal(missing.kpis.every(k=>k.value==null),true);assert.equal(missing.charts.length,0);
});
const reservations=[{bookingCode:'A1',roomName:'101',roomType:'Suite',guestName:'=1+1',source:'Agoda',status:'Đã nhận phòng',roomPrice:100,payment:0,deposit:0,balance:100,totalPrice:100,servicePrice:0,night:2,checkInTime:'2026-10-01',checkOutTime:'2026-10-03'},{bookingCode:'A1',roomName:'102',source:'Booking.com',status:'Đã hủy',roomPrice:0,totalPrice:0,payment:0,deposit:0,balance:0,servicePrice:0},{bookingCode:'',roomName:'103',source:'Agoda',status:'Không đến',roomPrice:null,totalPrice:null}];
const bookingPayload={hotel:{id:5381,name:'Sontra'},reportFilters:{from:'2026-10-01',to:'2026-10-15',dateType:'2'},source:'cache'};
test('reservation exports exact filtered rows, unique bookings and unknown money',()=>{
 const r=reservationsReport(bookingPayload,reservations,{search:'Suite',status:'Đã nhận phòng'});assert.equal(r.kpis[0].value,1);assert.equal(r.kpis[1].value,3);assert.equal(r.kpis.find(k=>k.label==='Tiền phòng').value,null);assert.equal(r.sections[0].rows.find(r=>r.label==='Agoda').roomRows,2);assert.match(r.view,/Suite/);assert.equal(r.dateLabel,'Ngày đặt');assert.equal(r.sections[2].rows.length,3);assert.equal(r.sections[3].rows[2].roomPrice,null);
 const empty=reservationsReport(bookingPayload,[]);assert.equal(empty.kpis[0].value,0);assert.equal(empty.kpis[2].value,0);assert.equal(empty.sections[2].rows.length,0);
});
test('Excel keeps typed numbers, zero versus blanks, literal formula-looking text and report filters',async()=>{
 const book=await createBluejayWorkbook(reservationsReport(bookingPayload,reservations));assert.equal(book.worksheets.length,5);
 const detail=book.getWorksheet('Danh sách đặt phòng');assert.equal(detail.getCell('B7').value,'=1+1');assert.equal(typeof detail.getCell('I7').value,'number');
 const amounts=book.worksheets[4];assert.equal(amounts.getCell('C8').value,0);assert.equal(amounts.getCell('C9').value,null);assert.match(amounts.getCell('A2').value,/2026-10-01 → 2026-10-15/);
 const {default:ExcelJS}=await import('exceljs'),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await book.xlsx.writeBuffer());assert.equal(loaded.getWorksheet('Danh sách đặt phòng').getCell('B7').type,ExcelJS.ValueType.String);assert.equal(loaded.worksheets[4].getCell('C8').value,0);assert.equal(loaded.worksheets[4].getCell('C9').value,null);
});
