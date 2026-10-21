import express from 'express';
import {tiktokService} from './service.js';
import {frontendUrl} from '../../google.js';
export function tiktokCallback(service=tiktokService){return async(req,res,next)=>{
 res.set({'Referrer-Policy':'no-referrer','Cache-Control':'no-store'});let result='error';
 try{result=await service.finish(req.query);if(result==='connected')try{await service.sync();}catch{result='connected_sync_failed';}}catch{}
 try{const target=frontendUrl();target.searchParams.set('tiktok',result);res.redirect(303,target.href);}catch(e){next(e);}
};}
export function createTikTokRouter(service=tiktokService){
 const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/status',wrap(async(_req,res)=>res.json(await service.status())));
 router.get('/report',wrap(async(_req,res)=>res.json(await service.read())));
 for(const action of ['connect','disconnect','sync'])router.post('/'+action,wrap(async(req,res)=>{
  const allowed=action==='sync'?['admin','manager']:['admin'];if(!allowed.includes(req.user?.role))throw Object.assign(Error('Tài khoản không có quyền thực hiện thao tác TikTok này.'),{status:403});
  res.json(await (action==='connect'?service.connect(req.user.id):service[action]()));
 }));return router;
}
