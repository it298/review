import express from 'express';
import { createHash,timingSafeEqual } from 'node:crypto';
import { state,mutate,getValue,setValue,deleteValue,rpc } from './store.js';
import { matrix,track,sync } from './service.js';
import {validateOtaResult} from './ota-validation.js';
import {validateGoogleSummary} from './google-summary-validation.js';
import {validatePublicSummary} from './public-summary-validation.js';
import {validateManualSummary} from './manual-summary.js';
import {buildAlerts,reports,reportForRange} from './insights.js';
import {uploadEvidence,downloadEvidence} from './evidence.js';
import { connectionStatus,startOAuth,finishOAuth,frontendUrl,disconnectGoogle,listAccounts,listLocations } from './google.js';
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
 app.use(express.json({limit:'512kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/',(_req,res)=>res.json({service:'review-tracker-api',health:'/api/health'}));
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 app.get('/api/google/callback',async(req,res,next)=>{
  res.set('Referrer-Policy','no-referrer');
  let result='error';
  try{result=await finishOAuth(req.query);}catch{}
  try{const target=frontendUrl();target.searchParams.set('google',result);res.redirect(303,target.href);}catch(e){next(e);}
 });
 app.get('/api/cron',async(req,res,next)=>{try{
  if(!authorized(req.headers.authorization,process.env.CRON_SECRET))return res.status(401).json({error:'Unauthorized'});
  let job=await getValue('cron-job');
  if(job && !await getValue('job:'+job)){await deleteValue('cron-job');job=null;}
  let summary=await sync(job || undefined);
  if(!summary.skipped){if(summary.done)await deleteValue('cron-job');else await setValue('cron-job',summary.jobId,604800);}
  res.json(summary);
 }catch(e){next(e);}});
 const workerAuth=(req,res,next)=>{const secret=process.env.OTA_WORKER_SECRET;if(!secret||secret.length<24||!authorized(req.headers.authorization,secret))return res.status(401).json({error:'Unauthorized'});next();};
 app.post('/api/evidence/worker/upload',workerAuth,express.raw({type:'image/png',limit:'2mb'}),async(req,res,next)=>{try{res.json(await uploadEvidence(req.query,req.body));}catch(e){next(e);}});
 app.post('/api/insights/worker/report',workerAuth,async(_req,res,next)=>{try{await reports();res.json({ok:true});}catch(e){next(e);}});
 app.get('/api/ota/worker/targets',workerAuth,async(_req,res,next)=>{try{res.json(await rpc('review_tracker_ota_targets_read'));}catch(e){next(e);}});
 app.post('/api/ota/worker/results',workerAuth,async(req,res,next)=>{try{const payload=validateOtaResult(req.body);res.json(await rpc('review_tracker_ota_ingest',{p:payload}));}catch(e){next(e);}});
 app.get('/api/google/worker/targets',workerAuth,async(_req,res,next)=>{try{res.json(await rpc('review_tracker_google_targets_read'));}catch(e){next(e);}});
 app.post('/api/google/worker/results',workerAuth,async(req,res,next)=>{try{res.json(await rpc('review_tracker_google_summary_ingest',{p:validateGoogleSummary(req.body)}));}catch(e){next(e);}});
  app.get('/api/public/worker/targets',workerAuth,async(_req,res,next)=>{try{res.json(await rpc('review_tracker_public_targets_read'));}catch(e){next(e);}});
  app.post('/api/public/worker/results',workerAuth,async(req,res,next)=>{try{res.json(await rpc('review_tracker_public_summary_ingest',{p:validatePublicSummary(req.body)}));}catch(e){next(e);}});
 app.use('/api',(req,res,next)=>{
  if(!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length<16)return res.status(503).json({error:'Cần cấu hình APP_PASSWORD dài ít nhất 16 ký tự.'});
  if(!authorized(req.headers.authorization,process.env.APP_PASSWORD))return res.status(401).json({error:'Vui lòng đăng nhập.'});next();
 });
 app.get('/api/google/status',async(_req,res,next)=>{try{res.json(await connectionStatus());}catch(e){next(e);}});
 app.post('/api/google/connect',async(_req,res,next)=>{try{res.json({url:await startOAuth()});}catch(e){next(e);}});
 app.post('/api/google/disconnect',async(_req,res,next)=>{try{res.json(await disconnectGoogle());}catch(e){next(e);}});
 app.get('/api/google/accounts',async(req,res,next)=>{try{res.json(await listAccounts(typeof req.query.pageToken==='string'?req.query.pageToken:undefined));}catch(e){next(e);}});
 app.get('/api/google/locations',async(req,res,next)=>{try{res.json(await listLocations(req.query.account,typeof req.query.pageToken==='string'?req.query.pageToken:undefined));}catch(e){next(e);}});
 app.get('/api/session',(_req,res)=>res.json({ok:true}));
 app.get('/api/directory',async(_req,res,next)=>{try{res.json(await rpc('review_tracker_directory_read'));}catch(e){next(e);}});
 app.post('/api/manual-summary',async(req,res,next)=>{try{res.json(await rpc('review_tracker_manual_summary_ingest',{p:validateManualSummary(req.body)}));}catch(e){next(e);}});
 app.get('/api/insights',async(req,res,next)=>{try{const days=Number(req.query.days||30);if(![7,30,90].includes(days))return res.status(400).json({error:'Khoảng ngày không hợp lệ.'});const data=await rpc('review_tracker_insights_read',{p_days:days});res.json({...data,alerts:buildAlerts(data),generated_at:new Date().toISOString()});}catch(e){next(e);}});
 app.post('/api/alerts/read',async(req,res,next)=>{try{if(typeof req.body?.key!=='string'||req.body.key.length>600||!req.body.key.length)return res.status(400).json({error:'Mã cảnh báo không hợp lệ.'});await rpc('review_tracker_alert_read',{p_key:req.body.key});res.json({ok:true});}catch(e){next(e);}});
 app.get('/api/reports',async(req,res,next)=>{try{res.json(req.query.start!==undefined||req.query.end!==undefined?await reportForRange(req.query.start,req.query.end):await reports());}catch(e){next(e);}});
 app.get('/api/evidence',async(req,res,next)=>{try{if(typeof req.query.entity!=='string'||req.query.entity.length>200||!['google','tripadvisor','agoda','booking','expedia','trip','traveloka','grab','shopee'].includes(req.query.source))return res.status(400).json({error:'Bộ lọc ảnh không hợp lệ.'});res.json(await rpc('review_tracker_evidence_read',{p_entity:req.query.entity,p_source:req.query.source}));}catch(e){next(e);}});
 app.get('/api/evidence/:id/image',async(req,res,next)=>{try{if(!/^\d{1,15}$/.test(req.params.id))return res.status(400).json({error:'Mốc ảnh không hợp lệ.'});res.type('image/png').send(await downloadEvidence(Number(req.params.id)));}catch(e){next(e);}});
 app.get('/api/source-history',async(req,res,next)=>{try{
  const {entity,source}=req.query,days=Number(req.query.days||30);
  if(typeof entity!=='string'||!entity||entity.length>200||!['google','tripadvisor','agoda','booking','expedia','trip','traveloka','grab','shopee'].includes(source)||![7,30,90,365].includes(days))return res.status(400).json({error:'Bộ lọc lịch sử không hợp lệ.'});
  res.json(await rpc('review_tracker_source_history_read',{p_entity:entity,p_source:source,p_days:days}));
 }catch(e){next(e);}});
 app.get('/api/ota/reviews',async(_req,res,next)=>{try{res.json(await rpc('review_tracker_ota_reviews'));}catch(e){next(e);}});
 app.get('/api/ota/summary',async(_req,res,next)=>{try{res.json(await rpc('review_tracker_ota_summary_read'));}catch(e){next(e);}});
 app.get('/api/ota/status',async(_req,res,next)=>{try{res.json(await rpc('review_tracker_ota_targets_read'));}catch(e){next(e);}});
 app.get('/api/places',async(_req,res,next)=>{try{res.json(Object.values((await state()).places));}catch(e){next(e);}});
 app.get('/api/places/dashboard-matrix',async(_req,res,next)=>{try{res.json(matrix(await state()));}catch(e){next(e);}});
 app.post('/api/places/track',async(req,res,next)=>{try{
  const {account,location,name,existingPlaceId}=req.body || {};
  if(name!==undefined && (typeof name!=='string' || name.length>200))return res.status(400).json({error:'Tên không hợp lệ.'});
  if(existingPlaceId!==undefined && (!Number.isSafeInteger(existingPlaceId)||existingPlaceId<1))return res.status(400).json({error:'Địa điểm cũ không hợp lệ.'});
  res.json(await track(account,location,name?.trim(),existingPlaceId));
 }catch(e){next(e);}});
 app.post('/api/places/sync',async(req,res,next)=>{try{res.json(await sync(req.body?.jobId));}catch(e){next(e);}});
 app.patch('/api/places/:id',async(req,res,next)=>{try{const name=req.body?.name;if(typeof name!=='string' || !name.trim() || name.length>200)return res.status(400).json({error:'Tên phải dài 1–200 ký tự.'});res.json(await mutate({op:'rename',id:Number(req.params.id),name:name.trim()}));}catch(e){next(e);}});
 app.delete('/api/places/:id',async(req,res,next)=>{try{res.json(await mutate({op:'delete',id:Number(req.params.id)}));}catch(e){next(e);}});
 app.get('/api/places/:id/history',async(req,res,next)=>{try{const s=await state();if(!s.places[req.params.id])return res.status(404).json({error:'Không tìm thấy địa điểm.'});res.json(Object.values(s.snapshots).filter(v=>v.place_id===Number(req.params.id)).sort((a,b)=>a.captured_at.localeCompare(b.captured_at)).map(v=>({capturedAt:v.captured_at,userRatingCount:v.user_rating_count,rating:v.rating})));}catch(e){next(e);}});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Không tìm thấy API.'}));
 app.use((err,_req,res,_next)=>{res.status(err.status || 500).json({error:err.status?err.message:'Không xử lý được yêu cầu. Kiểm tra cấu hình dịch vụ hoặc thử lại sau.'});});
 return app;
}
