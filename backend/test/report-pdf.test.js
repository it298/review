import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pdfMatrix} from '../../frontend/src/lib/report-pdf.js';
import {createReportPdf} from '../../frontend/src/lib/report-export.js';
import {reportView} from '../../frontend/src/lib/report-view.js';

const row={entity_key:'a',name:'Khách sạn Quy Nhơn',category:'hotel',source:'google',rating:4.9,rating_first:5,rating_max:5,rating_change:-0.1,review_count:0,review_count_first:2,count_change:-2,count_first_day:'2026-10-08',count_last_day:'2026-10-10',rating_first_day:'2026-10-09',rating_last_day:'2026-10-10'};
const report={start:'2026-10-08',end:'2026-10-10',generated_at:'2026-10-10T09:00:00Z',rows:[row,{...row,source:'agoda',rating:9.4,rating_max:10,count_change:null},{...row,entity_key:'b',name:'Khách sạn Hội An',source:'google',rating:null,review_count:null}],alerts:[],filters:{metric:'count'}};
test('PDF matrix keeps places on one row and aligns every platform including missing and zero values',()=>{
 const matrix=pdfMatrix(report);assert.deepEqual(matrix.sources,['google','agoda']);assert.equal(matrix.groups.length,2);assert.equal(matrix.groups[0].name,'Khách sạn Hội An');
 assert.equal(matrix.groups[0].cells[0][0].text,'—');assert.equal(matrix.groups[0].cells[1][0].text,'—');
 const cells=matrix.groups[1].cells;assert.equal(cells[0][0].text,'0 đánh giá');assert.match(cells[0][1].text,/-2/);assert.match(cells[0][2].text,/08\/10 - 10\/10/);assert.match(cells[0][5].text,/-0,1/);assert.equal(cells[1][1].text,'Biến động: —');
 const selected=pdfMatrix(reportView(report,{source:'agoda',metric:'rating'}));assert.equal(selected.groups.length,1);assert.deepEqual(selected.sources,['agoda']);assert.equal(selected.groups[0].cells[0][0].text,'9,4 / 10 điểm');
});
test('actual PDF remains landscape and repeats the full matrix header across vertical pagination',async()=>{
 const fontBase64=(await fs.readFile(new URL('../../frontend/public/fonts/NotoSans-Regular.ttf',import.meta.url))).toString('base64');
 const doc=await createReportPdf({...report,rows:Array.from({length:20},(_,i)=>({...row,entity_key:'hotel-'+i,name:'Khách sạn số '+i}))},{fontBase64});
 assert.ok(doc.getNumberOfPages()>1);
 for(let page=1;page<=doc.getNumberOfPages();page++){doc.setPage(page);assert.ok(doc.internal.pageSize.getWidth()>doc.internal.pageSize.getHeight());}
 const output=doc.output();assert.equal(output.match(/\/Type \/Page\b/g).length,doc.getNumberOfPages());assert.ok(output.length>10000);
});
