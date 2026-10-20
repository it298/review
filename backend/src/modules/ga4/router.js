import express from 'express';
import {ga4Status,readGa4,syncGa4} from './service.js';
import {startGa4OAuth,disconnectGa4} from './oauth.js';
export function createGa4Router(){const router=express.Router(),wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
 router.get('/status',wrap(async(_req,res)=>res.json(await ga4Status())));
 for(const action of ['connect','disconnect'])router.post('/'+action,wrap(async(req,res)=>{if(req.user?.role!=='admin')throw Object.assign(Error('Chỉ quản trị viên được kết nối hoặc ngắt GA4.'),{status:403});res.json(action==='connect'?{url:await startGa4OAuth()}:await disconnectGa4());}));
 router.get('/report',wrap(async(req,res)=>res.json(await readGa4(req.query.siteKey,req.query.from,req.query.to))));
 router.post('/sync',wrap(async(req,res)=>{if(!['admin','manager'].includes(req.user?.role))throw Object.assign(Error('Chỉ quản lý hoặc quản trị viên được đồng bộ GA4.'),{status:403});res.json(await syncGa4(req.body?.from,req.body?.to));}));return router;}
