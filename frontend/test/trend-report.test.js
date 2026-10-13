import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTrendReport,createTrendWorkbook,printTrendRows} from '../src/lib/trend-report.js';

const series=[{id:'p0',name:'Khách sạn thử',category:'hotel',lastCount:102,lastRating:4.5,countChange:2,ratingChange:.1,countAt:'2026-10-03T02:00:00Z',ratingAt:'2026-10-02T02:00:00Z'}];
const rows=[{day:'2026-10-01',p0Count:100,p0Rating:4.4,p1Count:500},{day:'2026-10-02',p0Count:null,p0Rating:4.5},{day:'2026-10-03',p0Count:102,p0Rating:null}];
const make=()=>prepareTrendReport({source:'google',category:'hotel',metric:'count',view:'compare',start:'2026-10-01',end:'2026-10-03',series,rows});

test('export snapshot contains only selected locations and keeps missing values',()=>{
 const report=make();assert.equal(report.series[0].firstCount,100);assert.equal(report.series[0].countDays,2);assert.equal(report.series[0].ratingDays,2);
 assert.equal('p1Count' in report.rows[0],false);assert.equal(report.rows[1].p0Count,null);
 report.rows[0].p0Count=900;assert.equal(rows[0].p0Count,100);report.series[0].name='changed';assert.equal(series[0].name,'Khách sạn thử');
});
test('workbook preserves numeric values, blanks, dates and native platform scale',async()=>{
 const book=await createTrendWorkbook(make());const summary=book.getWorksheet('Tổng hợp'),detail=book.getWorksheet('Theo ngày');
 assert.equal(summary.getCell('C8').value,100);assert.equal(summary.getCell('D8').value,102);assert.equal(summary.getCell('I8').value,5);
 assert.equal(detail.columnCount,5);assert.equal(detail.getCell('A6').value,'2026-10-01');assert.equal(detail.getCell('B7').value,null);assert.equal(detail.getCell('C7').value,4.5);
 const {default:ExcelJS}=await import('exceljs');const restored=new ExcelJS.Workbook();await restored.xlsx.load(await book.xlsx.writeBuffer());
 assert.equal(restored.getWorksheet('Theo ngày').getCell('B7').value,null);assert.equal(restored.getWorksheet('Tổng hợp').getCell('D8').type,ExcelJS.ValueType.Number);
});
test('long print ranges retain latest observed field in each bucket without filling missing data',()=>{
 const daily=Array.from({length:40},(_,i)=>({day:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),p0Count:i===0?100:i===2?101:null}));
 const weekly=printTrendRows(daily,series,'count');assert.equal(weekly.interval,'week');assert.equal(weekly.rows[0].p0Count,101);assert.equal(weekly.rows[1].p0Count,undefined);assert.equal(daily[1].p0Count,null);
 const monthly=printTrendRows([{day:'2026-01-01',p0Rating:4},{day:'2026-01-31',p0Rating:4.2},{day:'2026-08-01',p0Rating:null}],series,'rating');
 assert.equal(monthly.interval,'month');assert.equal(monthly.rows[0].p0Rating,4.2);assert.equal(monthly.rows[1].p0Rating,undefined);
});
