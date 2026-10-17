import express from 'express';
import * as XLSX from '@e965/xlsx';
import {readFile} from 'node:fs/promises';
import {rpc} from '../../store.js';
import {readFinanceExcel} from '../../../../shared/finance-excel-import.js';
import {analyzeWorkbook,validMonth} from '../../../../shared/excel-dashboard.js';
import {checkExcelArchive} from './archive.js';
import {saveReport,listReports,readReport,summaryRecord,listSavedPeriods} from './storage.js';
const directory=JSON.parse(await readFile(new URL('../../../../data/company-directory.json',import.meta.url),'utf8')).filter(d=>d.relationship==='managed');
const management=req=>['admin','manager'].includes(req.user.role);
const publicRecord=(r,req)=>management(req)?summaryRecord(r):Object.fromEntries(['id','fileName','unit','unitName','month','family','uploadedAt'].map(k=>[k,r[k]]));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createExcelReportsRouter(){
 const app=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e.status?e:fail('Chưa đọc/lưu được báo cáo Excel. Thử lại hoặc kiểm tra kết nối kho báo cáo.',503));}};
 async function units(req){
  if(req.user.role==='admin')return directory.map(d=>({...d,access:'admin'}));
  const scopes=await rpc('review_tracker_finance',{p:{action:'scopes',actor:req.user.id,admin:false}});
  return directory.flatMap(d=>{const scope=scopes.find(s=>s.unit===d.key),access=scope?.access;if(!access||access==='none'||req.user.role==='manager'&&access!=='manager'||req.user.role!=='manager'&&access==='manager')return [];return [{...d,access}];});
 }
 app.get('/units',wrap(async(req,res)=>res.json({units:(await units(req)).map(({key,name,category,access})=>({key,name,category,access}))})));
 app.get('/history',wrap(async(req,res)=>{const allowed=await units(req),selected=req.query.unit&&req.query.unit!=='all'?allowed.filter(u=>u.key===req.query.unit):allowed;if(req.query.unit&&req.query.unit!=='all'&&!selected.length)throw fail('Bạn chưa có quyền xem cơ sở này.',403);res.json({periods:await listSavedPeriods(selected)});}));
 app.get('/',wrap(async(req,res)=>{if(!validMonth(req.query.month))throw fail('Chọn tháng báo cáo hợp lệ.');const allowed=await units(req);const selected=req.query.unit&&req.query.unit!=='all'?allowed.filter(u=>u.key===req.query.unit):allowed;if(req.query.unit&&req.query.unit!=='all'&&!selected.length)throw fail('Bạn chưa có quyền xem cơ sở này.',403);res.json({reports:(await listReports(selected,req.query.month)).map(r=>publicRecord(r,req)),month:req.query.month});}));
 app.get('/source',wrap(async(req,res)=>{if(!management(req))throw fail('Chỉ quản lý xem số liệu chi tiết báo cáo.',403);const allowed=await units(req);if(!allowed.some(u=>u.key===req.query.unit))throw fail('Bạn chưa có quyền xem cơ sở này.',403);if(!validMonth(req.query.month)||!['cash','business'].includes(req.query.family))throw fail('Bộ lọc báo cáo không hợp lệ.');const record=await readReport(req.query.unit,req.query.month,req.query.family);if(!record)throw fail('Chưa có báo cáo này.',404);res.json(record);}));
 app.post('/',express.raw({type:'application/octet-stream',limit:'10mb'}),wrap(async(req,res)=>{
  const allowed=await units(req),unit=allowed.find(u=>u.key===req.query.unit);
  if(!unit||req.user.role==='viewer'||!['admin','manager','editor'].includes(unit.access))throw fail('Bạn chưa có quyền tải báo cáo tại cơ sở này.',403);
  if(!validMonth(req.query.month))throw fail('Chọn tháng báo cáo hợp lệ.');
  const name=req.query.name;if(typeof name!=='string'||!name.trim()||name.length>200||!/[.](xlsx|xls)$/i.test(name)||!Buffer.isBuffer(req.body)||!req.body.length)throw fail('Chọn file Excel .xlsx hoặc .xls, tối đa 10 MB.');
  let report;try{checkExcelArchive(req.body);const book=await readFinanceExcel({name,size:req.body.length,arrayBuffer:async()=>req.body},XLSX);report=analyzeWorkbook(book,req.query.month);}catch(e){throw fail(e.message);}
  const result=await saveReport({...report,unit:unit.key,unitName:unit.name},req.body,req.user.id);
  res.json({report:publicRecord(result.record,req),unchanged:result.unchanged,replaced:result.replaced||false});
 }));
 return app;
}
