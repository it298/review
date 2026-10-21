import express from 'express';
import {googleAdsStatus,googleAdsReport} from './service.js';
import {startGoogleAdsOAuth,disconnectGoogleAds} from './oauth.js';
export function createGoogleAdsRouter(){const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/status',wrap(async(req,res)=>res.json(await googleAdsStatus())));
 router.get('/report',wrap(async(req,res)=>res.json(await googleAdsReport(req.query.from,req.query.to))));
 for(const action of ['connect','disconnect'])router.post('/'+action,wrap(async(req,res)=>{if(req.user?.role!=='admin')throw Object.assign(Error('Chỉ quản trị viên được cấu hình kết nối Google Ads.'),{status:403});res.json(action==='connect'?{url:await startGoogleAdsOAuth()}:await disconnectGoogleAds());}));
 router.post('/sync',wrap(async(req,res)=>{if(!['admin','manager'].includes(req.user?.role))throw Object.assign(Error('Chỉ quản lý hoặc quản trị viên được cập nhật Google Ads.'),{status:403});res.json(await googleAdsReport(req.body?.from,req.body?.to,true));}));return router;
}
