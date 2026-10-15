import express from 'express';
import {readFile} from 'node:fs/promises';
import {rpc} from '../../store.js';
import {validateFinanceEntry,financeSummary,isDay} from '../../../../shared/finance.js';
import {getRecord} from '../bluejay/store.js';
import {normalizeOccupancy,normalizeReservations} from '../bluejay/normalize.js';
import {HOTELS} from '../bluejay/hotels.js';
const directory=JSON.parse(await readFile(new URL('../../../../data/company-directory.json',import.meta.url),'utf8')).filter(d=>d.relationship==='managed');
export function createFinanceRouter(){
 const app=express.Router();
 const call=async(req,action,fields={})=>{
  if(req.user.role!=='admin'&&action!=='scopes'){
   const scopes=await rpc('review_tracker_finance',{p:{action:'scopes',actor:req.user.id,admin:false}}),scope=scopes.find(s=>s.unit===fields.unit);
   if(!scope||scope.access==='none'||action==='save'&&scope.access!=='editor')throw Object.assign(new Error('Bạn chưa có quyền tài chính tại cơ sở này.'),{status:403});
  }
  return rpc('review_tracker_finance',{p:{...fields,action,actor:req.user.id,admin:req.user.role==='admin'}});
 };
 const unit=req=>directory.find(d=>d.key===(req.body?.unit||req.query.unit));
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(!e.status){e=Object.assign(new Error('Chưa truy cập được sổ thu–chi. Kiểm tra quyền cơ sở và chạy SQL khởi tạo module tài chính.'),{status:503});}next(e);}};
 app.get('/units',wrap(async(req,res)=>{const scopes=await call(req,'scopes');res.json({units:directory.filter(d=>req.user.role==='admin'||scopes.some(s=>s.unit===d.key)).map(d=>({key:d.key,name:d.name,category:d.category,access:req.user.role==='admin'?'admin':scopes.find(s=>s.unit===d.key)?.access})),scopes:req.user.role==='admin'?scopes:[]});}));
 app.get('/report',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.query.from)||!isDay(req.query.to)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày hợp lệ.'),{status:400});const data=await call(req,'read',{unit:unit(req).key,from:req.query.from,to:req.query.to});res.json({...data,summary:financeSummary(data.entries),unit:unit(req)});}));
 app.post('/entries',wrap(async(req,res)=>{if(!unit(req))throw Object.assign(new Error('Cơ sở chưa hợp lệ.'),{status:400});const entry=validateFinanceEntry(req.body);if(req.user.role!=='admin'&&['revenue','expense'].includes(entry.kind))throw Object.assign(new Error('Chỉ quản trị viên ghi nhận doanh thu hoặc chi phí phân bổ.'),{status:403});res.json(await call(req,'save',{unit:unit(req).key,entry}));}));
 app.get('/operations',wrap(async(req,res)=>{if(!unit(req)||!isDay(req.query.from)||!isDay(req.query.to)||req.query.from>req.query.to)throw Object.assign(new Error('Chọn cơ sở và khoảng ngày hợp lệ.'),{status:400});await call(req,'read',{unit:unit(req).key,from:req.query.from,to:req.query.to});const hotel=HOTELS.find(h=>h.entityKey===unit(req).key);if(!hotel)return res.json({connected:false});const params={from:req.query.from,to:req.query.to};const [occupancy,reservations]=await Promise.all([getRecord('occupancy',hotel.id,{...params,dateType:'1'}),getRecord('reservations',hotel.id,{...params,dateType:'3'})]);res.json({connected:true,hotel,occupancy:occupancy?{savedAt:occupancy.savedAt,data:normalizeOccupancy(occupancy.value).summary}:null,reservations:reservations?{savedAt:reservations.savedAt,data:normalizeReservations(reservations.value).totals}:null});}));
 app.post('/review',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản trị viên duyệt hoặc hủy ghi nhận.'),{status:403});if(!unit(req)||!/^\d+$/.test(String(req.body.id))||!['posted','void'].includes(req.body.status)||typeof req.body.reason!=='string'||!req.body.reason.trim()||req.body.reason.length>500)throw Object.assign(new Error('Nhập nghiệp vụ và lý do xử lý hợp lệ.'),{status:400});res.json(await call(req,'review',{unit:unit(req).key,id:req.body.id,status:req.body.status,reason:req.body.reason.trim()}));}));
 app.post('/scope',wrap(async(req,res)=>{if(req.user.role!=='admin')throw Object.assign(new Error('Chỉ quản trị viên phân quyền.'),{status:403});if(!unit(req)||!/^[0-9a-f-]{36}$/i.test(req.body.userId||'')||!['editor','viewer','none'].includes(req.body.access))throw Object.assign(new Error('Chọn cơ sở, UUID tài khoản và quyền hợp lệ.'),{status:400});res.json(await call(req,'scope',{unit:unit(req).key,userId:req.body.userId,access:req.body.access}));}));
 return app;
}
