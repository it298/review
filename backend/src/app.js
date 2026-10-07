import express from 'express';
import { createHash,timingSafeEqual } from 'node:crypto';
import { state,mutate,getValue,setValue,deleteValue } from './store.js';
import { matrix,track,sync } from './service.js';
export function authorized(header,secret){if(!secret)return false;const expected=createHash('sha256').update('Bearer '+secret).digest();const actual=createHash('sha256').update(header || '').digest();return timingSafeEqual(expected,actual);}
export function createApp(){
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(!origin)return next();
  res.vary('Origin');
  const allowed=(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s=>s.trim().replace(/\/$/,''));
  if(!allowed.includes(origin))return res.status(403).json({error:'Origin không được phép.'});
  res.set('Access-Control-Allow-Origin',origin);
  res.set('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers','Authorization,Content-Type');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
 });
 app.use(express.json({limit:'16kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/',(_req,res)=>res.json({service:'review-tracker-api',health:'/api/health'}));
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.get('/api/cron',async(req,res,next)=>{try{
  if(!authorized(req.headers.authorization,process.env.CRON_SECRET))return res.status(401).json({error:'Unauthorized'});
  let job=await getValue('cron-job');
  if(job && !await getValue('job:'+job)){await deleteValue('cron-job');job=null;}
  let summary=await sync(job || undefined);
  if(!summary.skipped){if(summary.done)await deleteValue('cron-job');else await setValue('cron-job',summary.jobId,604800);}
  res.json(summary);
 }catch(e){next(e);}});
 app.use('/api',(req,res,next)=>{
  if(!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length<16)return res.status(503).json({error:'Cần cấu hình APP_PASSWORD dài ít nhất 16 ký tự.'});
  if(!authorized(req.headers.authorization,process.env.APP_PASSWORD))return res.status(401).json({error:'Vui lòng đăng nhập.'});next();
 });
 app.get('/api/session',(_req,res)=>res.json({ok:true}));
 app.get('/api/places',async(_req,res,next)=>{try{res.json(Object.values((await state()).places));}catch(e){next(e);}});
 app.get('/api/places/dashboard-matrix',async(_req,res,next)=>{try{res.json(matrix(await state()));}catch(e){next(e);}});
 app.post('/api/places/track',async(req,res,next)=>{try{const {googleMapsUrl,name}=req.body || {};if(typeof googleMapsUrl!=='string' || !googleMapsUrl.trim() || (name!==undefined && (typeof name!=='string' || name.length>200)))return res.status(400).json({error:'URL hoặc tên không hợp lệ.'});res.json(await track(googleMapsUrl.trim(),name?.trim()));}catch(e){next(e);}});
 app.post('/api/places/sync',async(req,res,next)=>{try{res.json(await sync(req.body?.jobId));}catch(e){next(e);}});
 app.patch('/api/places/:id',async(req,res,next)=>{try{const name=req.body?.name;if(typeof name!=='string' || !name.trim() || name.length>200)return res.status(400).json({error:'Tên phải dài 1–200 ký tự.'});res.json(await mutate({op:'rename',id:Number(req.params.id),name:name.trim()}));}catch(e){next(e);}});
 app.delete('/api/places/:id',async(req,res,next)=>{try{res.json(await mutate({op:'delete',id:Number(req.params.id)}));}catch(e){next(e);}});
 app.get('/api/places/:id/history',async(req,res,next)=>{try{const s=await state();if(!s.places[req.params.id])return res.status(404).json({error:'Không tìm thấy địa điểm.'});res.json(Object.values(s.snapshots).filter(v=>v.place_id===Number(req.params.id)).sort((a,b)=>a.captured_at.localeCompare(b.captured_at)).map(v=>({capturedAt:v.captured_at,userRatingCount:v.user_rating_count,rating:v.rating})));}catch(e){next(e);}});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Không tìm thấy API.'}));
 app.use((err,_req,res,_next)=>{res.status(err.status || 500).json({error:err.status?err.message:'Không xử lý được yêu cầu. Kiểm tra cấu hình dịch vụ hoặc thử lại sau.'});});
 return app;
}
