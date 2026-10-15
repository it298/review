import express from 'express';
import {financeReport} from './report.js';
import {buildFinanceDashboard} from '../../../../shared/finance-dashboard.js';
import {readFile} from 'node:fs/promises';
import {rpc} from '../../store.js';
import {validateFinanceEntry,isDay,validateDay} from '../../../../shared/finance.js';
import {getRecord} from '../bluejay/store.js';
import {normalizeOccupancy,normalizeReservations} from '../bluejay/normalize.js';
import {storeFinanceFile,readFinanceFile} from './files.js';
import {HOTELS} from '../bluejay/hotels.js';
const directory=JSON.parse(await readFile(new URL('../../../../data/company-directory.json',import.meta.url),'utf8')).filter(d=>d.relationship==='managed');
export function createFinanceRouter(){
 const app=express.Router();
 const call=async(req,action,fields={})=>{
  if(req.user.role!=='admin'&&action!=='scopes'){
   const scopes=await rpc('review_tracker_finance',{p:{action:'scopes',actor:req.user.id,admin:false}}),scope=scopes.find(s=>s.unit===fields.unit);
   if(!scope||scope.access==='none'||action==='save'&&scope.access!=='editor')throw Object.assign(new Error('Bạn chưa có quyền tài chính tại cơ sở này.'),{status:403});
  }
  return rpc('review_tracker_finance',{p:{...fields,action,actor:req.user.id,admin:req.user.role==='admin',actorName:req.user.email||req.user.name}});
 };
 const unit=req=>directory.find(d=>d.key===(req.body?.unit||req.query.unit));
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(!e.status){e=Object.assign(new Error('Chưa truy cập được sổ thu–chi. Kiểm tra quyền cơ sở và chạy SQL khởi tạo module tài chính.'),{status:503});}next(e);}};
 app.get('/units',wrap(async(req,res)=>{const scopes=await call(req,'scopes');res.json({units:directory.filter(d=>req.user.role==='admin'||scopes.some(s=>s.unit===d.key)).map(d=>({key:d.key,name:d.name,category:d.category,access:req.user.role==='admin'?'admin':scopes.find(s=>s.unit===d.key)?.access})),scopes:req.user.role==='admin'?scopes:[]});}));
 app.get('/dashboard',wrap(async(req,res)=>{
  if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản trị viên xem dashboard toàn hệ thống.'),{status:403});
  const {from,to}=req.query;if(!isDay(from)||!isDay(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>365)throw Object.assign(new Error('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.'),{status:400});
  const rows=[];let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{while(cursor<directory.length){const property=directory[cursor++];try{const data=await call(req,'read',{unit:property.key,from,to});rows.push({unit:{key:property.key,name:property.name,category:property.category},report:financeReport(data,from,to)});}catch{rows.push({unit:{key:property.key,name:property.name,category:property.category},error:'Chưa đọc được báo cáo cơ sở này.'});}}}));
  res.json(buildFinanceDashboard(rows,from,to));
 }));
 app.get('/report',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.query.from)||!isDay(req.query.to)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày hợp lệ.'),{status:400});const data=await call(req,'read',{unit:unit(req).key,from:req.query.from,to:req.query.to});res.json({...financeReport(data,req.query.from,req.query.to),unit:unit(req)});}));
 app.post('/entries',wrap(async(req,res)=>{if(!unit(req))throw Object.assign(new Error('Cơ sở chưa hợp lệ.'),{status:400});const entry=validateFinanceEntry(req.body);if(req.user.role!=='admin'&&['revenue','expense'].includes(entry.kind))throw Object.assign(new Error('Chỉ quản trị viên ghi nhận doanh thu hoặc chi phí phân bổ.'),{status:403});res.json(await call(req,'save',{unit:unit(req).key,entry}));}));
 app.get('/operations',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.query.from)||!isDay(req.query.to)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày hợp lệ.'),{status:400});await call(req,'read',{unit:unit(req).key,from:req.query.from,to:req.query.to});const hotel=HOTELS.find(h=>h.entityKey===unit(req).key);if(!hotel)return res.json({connected:false});const params={from:req.query.from,to:req.query.to};const [occupancy,reservations]=await Promise.all([getRecord('occupancy',hotel.id,{...params,dateType:'1'}),getRecord('reservations',hotel.id,{...params,dateType:'3'})]);res.json({connected:true,hotel,occupancy:occupancy?{savedAt:occupancy.savedAt,data:normalizeOccupancy(occupancy.value).summary}:null,reservations:reservations?{savedAt:reservations.savedAt,data:normalizeReservations(reservations.value).totals,bookings:normalizeReservations(reservations.value).rows.map(r=>({bookingCode:r.bookingCode,room:r.roomName,source:r.source}))}:null});}));
 app.post('/review',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản trị viên duyệt hoặc hủy ghi nhận.'),{status:403});if(!unit(req)||!/^\d+$/.test(String(req.body.id))||!['posted','returned','void'].includes(req.body.status)||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw Object.assign(new Error('Nhập nghiệp vụ và lý do xử lý hợp lệ.'),{status:400});res.json(await call(req,'review',{unit:unit(req).key,id:req.body.id,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/scope',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản trị viên phân quyền.'),{status:403});if(!unit(req)||!/^[0-9a-f-]{36}$/i.test(req.body.userId||'')||!['editor','viewer','none'].includes(req.body.access))throw Object.assign(new Error('Chọn cơ sở, UUID tài khoản và quyền hợp lệ.'),{status:400});res.json(await call(req,'scope',{unit:unit(req).key,userId:req.body.userId,access:req.body.access}));}));

 app.patch('/entries/:id',wrap(async(req,res)=>{if(!unit(req)||!/^\d+$/.test(req.params.id))throw Object.assign(new Error('Nghiệp vụ chưa hợp lệ.'),{status:400});const entry=validateFinanceEntry(req.body);if(req.user.role!=='admin'&&['revenue','expense'].includes(entry.kind))throw Object.assign(new Error('Chỉ quản lý ghi nhận doanh thu/phân bổ.'),{status:403});res.json(await call(req,'edit',{unit:unit(req).key,id:req.params.id,entry}));}));
 app.post('/months/review',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản lý khóa tháng.'),{status:403});if(!unit(req)||!isDay(req.body.month+'-01')||!['locked','open'].includes(req.body.status)||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw Object.assign(new Error('Chọn tháng và nhập lý do.'),{status:400});res.json(await call(req,'month_review',{unit:unit(req).key,month:req.body.month,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/days',wrap(async(req,res)=>{if(!unit(req))throw Object.assign(new Error('Chọn cơ sở.'),{status:400});const report=validateDay(req.body);res.json(await call(req,'day_save',{unit:unit(req).key,date:report.date,report}));}));
 app.post('/days/submit',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.body.date))throw Object.assign(new Error('Chọn ngày báo cáo.'),{status:400});res.json(await call(req,'day_submit',{unit:unit(req).key,date:req.body.date}));}));
 app.post('/days/review',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản lý duyệt báo cáo ngày.'),{status:403});if(!unit(req)||!isDay(req.body.date)||!['closed','returned'].includes(req.body.status)||!req.body.reason?.trim()||req.body.reason.length>500)throw Object.assign(new Error('Nhập ngày, xử lý và lý do.'),{status:400});res.json(await call(req,'day_review',{unit:unit(req).key,date:req.body.date,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/entries/:id/files',express.raw({type:['image/png','image/jpeg','application/pdf'],limit:'5mb'}),wrap(async(req,res)=>{const selected=directory.find(d=>d.key===req.query.unit);if(!selected||!/^\d+$/.test(req.params.id))throw Object.assign(new Error('Chứng từ chưa hợp lệ.'),{status:400});await call(req,'file_context',{unit:selected.key,id:req.params.id});const file=await storeFinanceFile(req.query.name,req.headers['content-type'],req.body);res.json(await call(req,'file_add',{unit:selected.key,id:req.params.id,...file}));}));
 app.get('/files/:id',wrap(async(req,res)=>{if(!unit(req)||!/^[0-9a-f-]{36}$/i.test(req.params.id))throw Object.assign(new Error('Chứng từ chưa hợp lệ.'),{status:400});const file=await call(req,'file_read',{unit:unit(req).key,fileId:req.params.id});const bytes=await readFinanceFile(file);res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`).set('X-Content-Type-Options','nosniff').type(file.mime).send(bytes);}));
 return app;
}
