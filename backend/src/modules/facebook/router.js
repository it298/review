import express from 'express';
import {rpc} from '../../store.js';
import {FACEBOOK_HOTELS} from './hotels.js';
import {fail,readRange} from './dates.js';
import {syncAllFacebookHotels} from './sync.js';
import {validateFacebookReport} from '../../../../shared/facebook-report.js';
export function createFacebookRouter(){
 const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/status',(_req,res)=>res.json({configured:Boolean(process.env.META_USER_ACCESS_TOKEN),version:process.env.META_API_VERSION||'v26.0',hotels:FACEBOOK_HOTELS,autoSync:process.env.FACEBOOK_AUTO_SYNC==='true',schedule:'08:30 Asia/Ho_Chi_Minh'}));
 router.post('/sync',wrap(async(req,res)=>{
  if(!['admin','manager'].includes(req.user?.role))throw fail('Chỉ quản lý hoặc quản trị viên được đồng bộ Facebook.',403);
  res.json(await syncAllFacebookHotels({since:req.query.since??req.body?.since,until:req.query.until??req.body?.until}));
 }));
 router.get('/report',wrap(async(req,res)=>{
  const range=readRange(req.query.from,req.query.to),hotel=FACEBOOK_HOTELS.find(h=>h.page_id===req.query.pageId);
  if(!hotel)throw fail('Chọn Page trong danh mục.');
  res.json(await rpc('review_tracker_facebook_report',{p:{action:'read',...range,page_id:hotel.page_id}}));
 }));
 router.post('/report',wrap(async(req,res)=>{
  if(!['admin','manager'].includes(req.user?.role))throw fail('Chỉ quản lý hoặc quản trị viên được nhập báo cáo Facebook.',403);
  const range=readRange(req.body?.from,req.body?.to),hotel=FACEBOOK_HOTELS.find(h=>h.page_id===req.body?.pageId);
  if(!hotel)throw fail('Chọn Page trong danh mục.');
  const input=validateFacebookReport(req.body);
  res.json(await rpc('review_tracker_facebook_report',{p:{action:'save',...range,page_id:hotel.page_id,...input,actor:req.user.id}}));
 }));
 for(const type of ['insights','followers'])router.get('/'+type,wrap(async(req,res)=>{
  const {pageId,hotelKey}=req.query,range=readRange(req.query.from,req.query.to);
  if(pageId!==undefined&&(typeof pageId!=='string'||!FACEBOOK_HOTELS.some(h=>h.page_id===pageId)))throw fail('Page ID chưa được cấu hình.');
  if(hotelKey!==undefined&&(typeof hotelKey!=='string'||!FACEBOOK_HOTELS.some(h=>h.hotel_key===hotelKey)))throw fail('Khách sạn chưa được cấu hình.');
  const hotels=FACEBOOK_HOTELS.filter(h=>(!pageId||h.page_id===pageId)&&(!hotelKey||h.hotel_key===hotelKey));
  if(!hotels.length)throw fail('Page ID và khách sạn không khớp nhau.');
  const data=await rpc('review_tracker_facebook_read',{p:{...range,page_ids:hotels.map(h=>h.page_id),type}});
  res.json({...range,hotels,...data});
 }));
 return router;
}
