import express from 'express';
import {validateBook,planBook,bookDebts,employeeBooks} from '../../../../shared/finance-books.js';
import {financeReport} from './report.js';
import {buildFinanceDashboard} from '../../../../shared/finance-dashboard.js';
import {readFile} from 'node:fs/promises';
import {rpc} from '../../store.js';
import {validateFinanceEntry,isDay,validateDay} from '../../../../shared/finance.js';
import {getRecord} from '../bluejay/store.js';
import {normalizeOccupancy,normalizeReservations} from '../bluejay/normalize.js';
import {storeFinanceFile,readFinanceFile} from './files.js';
import {HOTELS} from '../bluejay/hotels.js';
import {validateFinanceBatch} from '../../../../shared/finance-batch.js';
const directory=JSON.parse(await readFile(new URL('../../../../data/company-directory.json',import.meta.url),'utf8')).filter(d=>d.relationship==='managed');
export function createFinanceRouter(){
 const app=express.Router();
 const management=req=>['admin','manager'].includes(req.user.role);
 const scopesFor=req=>rpc('review_tracker_finance',{p:{action:'scopes',actor:req.user.id,admin:req.user.role==='admin'}});
 const authorize=async(req,action,fields={})=>{
  if(req.user.role==='viewer'&&!['read','scopes','books_read','file_read'].includes(action))throw Object.assign(new Error('Tài khoản chỉ xem không được sửa dữ liệu.'),{status:403});
  let unitManager=req.user.role==='admin';
  if(req.user.role!=='admin'&&action!=='scopes'){
   const scopes=req.financeScopes??(req.financeScopes=await scopesFor(req)),scope=scopes.find(s=>s.unit===fields.unit);
   unitManager=req.user.role==='manager'&&scope?.access==='manager';
   if(!scope||scope.access==='none'||!unitManager&&scope.access==='manager'||action==='save'&&!['editor','manager'].includes(scope.access))throw Object.assign(new Error('Bạn chưa có quyền tại cơ sở này.'),{status:403});
   if(req.user.role==='manager'&&!unitManager)throw Object.assign(new Error('Quản lý chưa được giao cơ sở này.'),{status:403});
  }
  return unitManager;
 };
 const call=async(req,action,fields={})=>rpc('review_tracker_finance',{p:{...fields,action,actor:req.user.id,admin:await authorize(req,action,fields),actorName:req.user.email||req.user.name}});
 const unit=req=>directory.find(d=>d.key===(req.body?.unit||req.query.unit));
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(!e.status){e=Object.assign(new Error('Chưa truy cập được sổ thu–chi. Kiểm tra quyền cơ sở và chạy SQL khởi tạo module tài chính.'),{status:503});}next(e);}};
 app.get('/units',wrap(async(req,res)=>{const scopes=await call(req,'scopes');res.json({units:directory.filter(d=>req.user.role==='admin'||scopes.some(s=>s.unit===d.key&&(req.user.role==='manager'?s.access==='manager':s.access!=='manager'))).map(d=>({key:d.key,name:d.name,category:d.category,access:req.user.role==='admin'?'admin':scopes.find(s=>s.unit===d.key)?.access})),scopes:req.user.role==='admin'?scopes:[]});}));
 app.get('/dashboard',wrap(async(req,res)=>{
  if(!management(req))throw Object.assign(new Error('Chỉ quản lý xem dashboard tài chính.'),{status:403});
  if(req.user.role==='manager')req.financeScopes=await scopesFor(req);const {from,to}=req.query;if(!isDay(from)||!isDay(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>365)throw Object.assign(new Error('Chọn khoảng ngày hợp lệ, tối đa 366 ngày.'),{status:400});
  const allowed=req.user.role==='admin'?directory:directory.filter(d=>req.financeScopes.some(s=>s.unit===d.key&&s.access==='manager'));const rows=[];let cursor=0;
  await Promise.all(Array.from({length:3},async()=>{while(cursor<allowed.length){const property=allowed[cursor++];try{const data=await call(req,'read',{unit:property.key,from,to});rows.push({unit:{key:property.key,name:property.name,category:property.category},report:financeReport(data,from,to)});}catch{rows.push({unit:{key:property.key,name:property.name,category:property.category},error:'Chưa đọc được báo cáo cơ sở này.'});}}}));
  res.json(buildFinanceDashboard(rows,from,to));
 }));
 app.get('/report',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.query.from)||!isDay(req.query.to)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày hợp lệ.'),{status:400});const data=await call(req,'read',{unit:unit(req).key,from:req.query.from,to:req.query.to});if(!management(req)){const entries=data.entries.filter(e=>!['revenue','expense'].includes(e.kind));return res.json({entries,days:data.days||[],previousDay:data.previousDay,months:data.months||[],files:(data.files||[]).filter(f=>entries.some(e=>Number(e.id)===Number(f.entry_id))),inventory:{items:financeReport(data,req.query.from,req.query.to).inventory.items.map(({sku,name,unit,quantity})=>({sku,name,unit,quantity}))},deposits:financeReport(data,req.query.from,req.query.to).deposits,access:data.access,unit:unit(req)});}res.json({...financeReport(data,req.query.from,req.query.to),unit:unit(req)});}));
 app.post('/entries',wrap(async(req,res)=>{if(!unit(req))throw Object.assign(new Error('Cơ sở chưa hợp lệ.'),{status:400});const entry=validateFinanceEntry(req.body);if(!management(req)&&['revenue','expense'].includes(entry.kind))throw Object.assign(new Error('Chỉ quản lý ghi nhận doanh thu hoặc chi phí phân bổ.'),{status:403});res.json(await call(req,'save',{unit:unit(req).key,entry}));}));
 app.post('/entries/batch',wrap(async(req,res)=>{
  const selected=unit(req);if(!selected)throw Object.assign(new Error('Cơ sở chưa hợp lệ.'),{status:400});
  await authorize(req,'save',{unit:selected.key});const entries=validateFinanceBatch(req.body,{management:management(req)}),results=[];
  // Each row uses the existing SQL transaction, locks, audit trail and requestId.
  // A partial result is explicit: a failed row never rolls back earlier rows.
  for(let i=0;i<entries.length;i++){
   const entry=entries[i];try{const saved=await call(req,'save',{unit:selected.key,entry});results.push({requestId:entry.requestId,ok:true,id:saved.id,status:saved.status||'draft'});}
   catch(e){const uncertain=!e.status;results.push({requestId:entry.requestId,ok:false,status:e.status||503,uncertain,error:uncertain?'Chưa xác nhận được kết quả lưu. Thử lại cùng dòng để tránh gửi trùng.':e.message});
    if(uncertain||[401,403].includes(e.status)){for(const pending of entries.slice(i+1))results.push({requestId:pending.requestId,ok:false,notAttempted:true,error:'Chưa gửi do kết nối / quyền bị gián đoạn.'});break;}
   }
  }
  res.json({results,saved:results.filter(r=>r.ok).length});
 }));
 app.get('/operations',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.query.from)||!isDay(req.query.to)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày hợp lệ.'),{status:400});await call(req,'read',{unit:unit(req).key,from:req.query.from,to:req.query.to});const hotel=HOTELS.find(h=>h.entityKey===unit(req).key);if(!hotel)return res.json({connected:false});const params={from:req.query.from,to:req.query.to};const [occupancy,reservations]=await Promise.all([getRecord('occupancy',hotel.id,{...params,dateType:'1'}),getRecord('reservations',hotel.id,{...params,dateType:'3'})]);res.json({connected:true,hotel,occupancy:occupancy?{savedAt:occupancy.savedAt,data:normalizeOccupancy(occupancy.value).summary}:null,reservations:reservations?{savedAt:reservations.savedAt,data:normalizeReservations(reservations.value).totals,bookings:normalizeReservations(reservations.value).rows.map(r=>({bookingCode:r.bookingCode,room:r.roomName,source:r.source}))}:null});}));
 app.post('/review',wrap(async(req,res)=>{if(!management(req))throw Object.assign(new Error('Chỉ quản lý duyệt hoặc hủy ghi nhận.'),{status:403});if(!unit(req)||!/^\d+$/.test(String(req.body.id))||!['posted','returned','void'].includes(req.body.status)||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw Object.assign(new Error('Nhập nghiệp vụ và lý do xử lý hợp lệ.'),{status:400});res.json(await call(req,'review',{unit:unit(req).key,id:req.body.id,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/scope',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản trị viên phân quyền.'),{status:403});if(!unit(req)||!/^[0-9a-f-]{36}$/i.test(req.body.userId||'')||!['editor','viewer','manager','none'].includes(req.body.access))throw Object.assign(new Error('Chọn cơ sở, UUID tài khoản và quyền hợp lệ.'),{status:400});res.json(await call(req,'scope',{unit:unit(req).key,userId:req.body.userId,access:req.body.access}));}));

 app.patch('/entries/:id',wrap(async(req,res)=>{if(!unit(req)||!/^\d+$/.test(req.params.id))throw Object.assign(new Error('Nghiệp vụ chưa hợp lệ.'),{status:400});const entry=validateFinanceEntry(req.body);if(!management(req)&&['revenue','expense'].includes(entry.kind))throw Object.assign(new Error('Chỉ quản lý ghi nhận doanh thu/phân bổ.'),{status:403});res.json(await call(req,'edit',{unit:unit(req).key,id:req.params.id,entry}));}));
 app.post('/months/review',wrap(async(req,res)=>{if(!management(req))throw Object.assign(new Error('Chỉ quản lý khóa tháng.'),{status:403});if(!unit(req)||!isDay(req.body.month+'-01')||!['locked','open'].includes(req.body.status)||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw Object.assign(new Error('Chọn tháng và nhập lý do.'),{status:400});res.json(await call(req,'month_review',{unit:unit(req).key,month:req.body.month,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/days',wrap(async(req,res)=>{if(!unit(req))throw Object.assign(new Error('Chọn cơ sở.'),{status:400});const report=validateDay(req.body);res.json(await call(req,'day_save',{unit:unit(req).key,date:report.date,report}));}));
 app.post('/days/submit',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.body.date))throw Object.assign(new Error('Chọn ngày báo cáo.'),{status:400});res.json(await call(req,'day_submit',{unit:unit(req).key,date:req.body.date}));}));
 app.post('/days/review',wrap(async(req,res)=>{if(!management(req))throw Object.assign(new Error('Chỉ quản lý duyệt báo cáo ngày.'),{status:403});if(!unit(req)||!isDay(req.body.date)||!['closed','returned'].includes(req.body.status)||!req.body.reason?.trim()||req.body.reason.length>500)throw Object.assign(new Error('Nhập ngày, xử lý và lý do.'),{status:400});res.json(await call(req,'day_review',{unit:unit(req).key,date:req.body.date,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/entries/:id/files',express.raw({type:['image/png','image/jpeg','application/pdf'],limit:'5mb'}),wrap(async(req,res)=>{const selected=directory.find(d=>d.key===req.query.unit);if(!selected||!/^\d+$/.test(req.params.id))throw Object.assign(new Error('Chứng từ chưa hợp lệ.'),{status:400});await call(req,'file_context',{unit:selected.key,id:req.params.id});const file=await storeFinanceFile(req.query.name,req.headers['content-type'],req.body);res.json(await call(req,'file_add',{unit:selected.key,id:req.params.id,...file}));}));
 app.get('/files/:id',wrap(async(req,res)=>{if(!unit(req)||!/^[0-9a-f-]{36}$/i.test(req.params.id))throw Object.assign(new Error('Chứng từ chưa hợp lệ.'),{status:400});const file=await call(req,'file_read',{unit:unit(req).key,fileId:req.params.id});const bytes=await readFinanceFile(file);res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`).set('X-Content-Type-Options','nosniff').type(file.mime).send(bytes);}));

 app.get('/books',wrap(async(req,res)=>{
  if(!unit(req)||!isDay(req.query.to)||!isDay(req.query.from)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày.'),{status:400});
  const result=await call(req,'books_read',{unit:unit(req).key,from:req.query.from,to:req.query.to});
  res.json({books:result.books||[],debts:management(req)?bookDebts(result.books||[],result.matches||[],req.query.to):[]});
 }));
 app.post('/books',wrap(async(req,res)=>{
  if(!unit(req))throw Object.assign(new Error('Chọn cơ sở.'),{status:400});const book=validateBook(req.body.book);
  if(!management(req)&&!employeeBooks.includes(book.type))throw Object.assign(new Error('Sổ này dành cho quản lý.'),{status:403});
  if(book.type==='stocktake'){const data=await call(req,'read',{unit:unit(req).key,from:book.date,to:book.date});const inventory=financeReport(data,book.date,book.date).inventory;book.data.expected=book.data.lines.map(l=>({sku:l.sku,quantity:inventory.items.find(i=>i.sku===l.sku)?.quantity||0}));}
  res.json(await call(req,'books_save',{unit:unit(req).key,id:book.id,book,version:Number(req.body.version||0)}));
 }));
 app.post('/books/review',wrap(async(req,res)=>{
  if(!management(req))throw Object.assign(new Error('Chỉ quản lý duyệt phiếu.'),{status:403});
  if(!unit(req)||!['posted','returned','void'].includes(req.body.status)||!String(req.body.reason||'').trim()||String(req.body.reason).length>500||!/^[0-9a-f-]{36}$/i.test(req.body.id||''))throw Object.assign(new Error('Chọn phiếu, trạng thái và lý do.'),{status:400});
  const result=await call(req,'books_read',{unit:unit(req).key,id:req.body.id,to:'9999-12-31'}),record=result.books.find(b=>b.id===req.body.id);
  if(!record)throw Object.assign(new Error('Không tìm thấy phiếu.'),{status:404});let plan;
  if(req.body.status==='posted'){const data=await call(req,'read',{unit:unit(req).key,from:record.day,to:record.day});plan=planBook(record.data,{entries:data.entries,inventory:financeReport(data,record.day,record.day).inventory});}
  res.json(await call(req,'books_review',{unit:unit(req).key,id:record.id,version:Number(req.body.version),status:req.body.status,reason:req.body.reason.trim(),plan}));
 }));
 app.delete('/files/:id',wrap(async(req,res)=>{
  if(!unit(req)||!/^[0-9a-f-]{36}$/i.test(req.params.id)||!String(req.body.reason||'').trim()||String(req.body.reason).length>500)throw Object.assign(new Error('Nhập lý do gỡ chứng từ.'),{status:400});
  res.json(await call(req,'file_remove',{unit:unit(req).key,fileId:req.params.id,reason:req.body.reason.trim()}));
 }));
 return app;
}
