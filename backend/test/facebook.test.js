import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import express from 'express';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../src/app.js';
import {FACEBOOK_HOTELS} from '../src/modules/facebook/hotels.js';
import {createMetaService} from '../src/modules/facebook/meta-service.js';
import {normalizeInsights,normalizePublishedPosts,syncFacebookHotel,syncAllFacebookHotels} from '../src/modules/facebook/sync.js';
import {EXTRA_METRICS} from '../src/modules/facebook/meta-service.js';
import {validateFacebookReport} from '../../shared/facebook-report.js';
import {parseFacebookWorkbook} from '../../frontend/src/lib/facebook-excel.js';
import {syncRange,readRange} from '../src/modules/facebook/dates.js';
import {facebookCron} from '../src/modules/facebook/auto-sync.js';
import {createFacebookRouter} from '../src/modules/facebook/router.js';
import {hotelFacebookReport} from '../../frontend/src/lib/facebook-report.js';
const hotel=FACEBOOK_HOTELS[0],now=new Date('2026-10-19T02:00:00Z');
const group=(value=340)=>({name:'page_post_engagements',period:'day',values:[{value,end_time:'2026-10-16T07:00:00+0000'}]});
const response=data=>new Response(JSON.stringify(data),{status:200});

test('strict ranges, bucket start date in Vietnam, original instant, missing values and conflicting duplicates',()=>{
 assert.deepEqual(syncRange(undefined,undefined,now),{since:'2026-10-16',until:'2026-10-19'});
 for(const [a,b] of [['2026-02-30','2026-10-19'],['2026-10-19','2026-10-18'],['2026-10-19','2026-10-19'],['2026-10-19','2026-10-22']])assert.throws(()=>syncRange(a,b,now));
 assert.throws(()=>readRange('2026-02-30','2026-10-19',now));
 const days=normalizeInsights([group(),{...group(0),name:'page_media_view'}],hotel,'2026-10-01','2026-10-19');
 assert.equal(days[0].metric_date,'2026-10-15');assert.equal(days[0].bucket_end_time,'2026-10-16T07:00:00.000Z');assert.equal(days[0].media_views,0);assert.equal(days[0].unique_viewers,null);
 assert.throws(()=>normalizeInsights([group(),group(341)],hotel,'2026-10-01','2026-10-19'));
 assert.throws(()=>normalizeInsights([group(-1)],hotel,'2026-10-01','2026-10-19'));
 assert.throws(()=>normalizeInsights([{...group(),period:'week'}],hotel,'2026-10-01','2026-10-19'));
});

test('Graph service uses user token ONLY on accounts; Page token on summary and insights; pagination cannot redirect token',async()=>{
 const calls=[],meta=createMetaService({token:'USER_SECRET',fetcher:async(url,options)=>{calls.push({url,options});if(url.pathname.endsWith('/me/accounts'))return response({data:[{id:hotel.page_id,access_token:'PAGE_SECRET'}]});if(url.pathname.endsWith('/insights'))return response({data:[group()]});return response({id:hotel.page_id,followers_count:8194,fan_count:8000});}});
 const pages=await meta.getManagedPages(),token=meta.getPageAccessToken(hotel.page_id,pages);await meta.getPageSummary(hotel.page_id,token);await meta.getPageInsights(hotel.page_id,token,'2026-10-01','2026-10-19');
 assert.equal(calls[0].options.headers.Authorization,'Bearer USER_SECRET');assert.equal(calls[1].options.headers.Authorization,'Bearer PAGE_SECRET');assert.equal(calls[2].options.headers.Authorization,'Bearer PAGE_SECRET');assert.ok(calls.every(c=>!c.url.searchParams.has('access_token')));assert.ok(calls.every(c=>c.url.pathname.startsWith('/v26.0/')));
 let n=0;const paged=createMetaService({token:'USER',fetcher:async(url)=>{assert.equal(url.hostname,'graph.facebook.com');n++;return response(n===1?{data:[],paging:{next:'https://evil.invalid/?access_token=SECRET',cursors:{after:'cursor'}}}:{data:[{id:hotel.page_id,access_token:'PAGE'}]});}});assert.equal((await paged.getManagedPages()).get(hotel.page_id),'PAGE');assert.equal(n,2);
 const malicious=createMetaService({token:'USER',fetcher:async()=>response({data:[],paging:{next:'https://evil.invalid/SECRET'}})});await assert.rejects(()=>malicious.getManagedPages(),e=>!e.message.includes('SECRET'));
});

test('Graph error sanitization covers expiry, permissions, malformed responses and network failures',async()=>{
 for(const code of [190,10,100,2]){const meta=createMetaService({token:'TOP_SECRET',fetcher:async()=>new Response(JSON.stringify({error:{code,message:'access_token=TOP_SECRET',error_data:{token:'TOP_SECRET'}}}),{status:400})});await assert.rejects(()=>meta.getManagedPages(),e=>e.status===502&&!e.message.includes('TOP_SECRET'));}
 const network=createMetaService({token:'TOP_SECRET',fetcher:async()=>{throw Error('https://graph.facebook.com/?access_token=TOP_SECRET');}});await assert.rejects(()=>network.getManagedPages(),e=>!e.message.includes('TOP_SECRET'));
 await assert.rejects(()=>createMetaService({token:''}).getManagedPages(),e=>e.status===503);
});

test('one accounts listing across all configured Pages, per-page failure isolation and database failure sanitized',async()=>{
 let accounts=0,released=0;const saved=[];
 const meta={getManagedPages:async()=>{accounts++;return new Map(FACEBOOK_HOTELS.slice(0,3).map(h=>[h.page_id,'PAGE_'+h.page_id]));},getPageAccessToken:(_id,map)=>{if(!map.has(_id))throw Object.assign(Error('Page chưa được cấp quyền.'),{status:502});return map.get(_id);},getPageSummary:async id=>({id,followers_count:8194,fan_count:8000}),getPageInsights:async()=>[group()]};
 const run=()=>syncAllFacebookHotels({since:'2026-10-01',until:'2026-10-19',now,meta,acquire:async()=>async()=>{released++;},save:async p=>{if(p.hotel.page_id===FACEBOOK_HOTELS[1].page_id)throw Error('DATABASE TOP_SECRET');saved.push(p);}});
 const result=await run();assert.equal(accounts,1);assert.equal(released,1);assert.equal(result.results.filter(r=>r.ok).length,2);assert.equal(saved[0].snapshot.snapshot_date,'2026-10-19');assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!JSON.stringify(result).includes('access_token'));assert.equal(result.results.length,5);
 const busy=await syncAllFacebookHotels({now,meta,acquire:async()=>null});assert.equal(busy.skipped,true);assert.equal(accounts,1);
});

test('daily cron refreshes three completed days at 08:30 Vietnam, tracks success and remains retryable on partial errors',async()=>{
 const store=new Map(),runs=[],deps={enabled:true,get:async k=>store.get(k),set:async(k,v)=>store.set(k,v),run:async p=>{runs.push(p);return {ok:true};}};
 assert.equal((await facebookCron({...deps,now:new Date('2026-10-19T01:29:00Z')})).reason,'before_schedule');
 await facebookCron({...deps,now:new Date('2026-10-19T01:30:00Z')});assert.equal(runs[0].since,'2026-10-16');assert.equal(runs[0].until,'2026-10-19');assert.equal((await facebookCron({...deps,now})).reason,'already_synced');
 store.clear();await facebookCron({...deps,now,run:async()=>({ok:false})});assert.equal(store.size,0);
});

test('Supabase migration is repeatable, page/day upsert is atomic, preserves created_at/null metrics and blocks browser roles',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql=await readFile(new URL('../../supabase/facebook-module.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);const extension=await readFile(new URL('../../supabase/facebook-report-extension.sql',import.meta.url),'utf8');await db.exec(extension);await db.exec(extension);await db.exec('set role service_role');
  const p={hotel,days:normalizeInsights([group()],hotel,'2026-10-01','2026-10-19'),snapshot:{...hotel,snapshot_date:'2026-10-18',followers_count:8194,fan_count:8000}},write=p=>db.query('select public.review_tracker_facebook_upsert($1::jsonb)',[JSON.stringify(p)]);
  await write(p);const created=(await db.query('select created_at from public.review_tracker_facebook_daily')).rows[0].created_at;await write({...p,days:[{...p.days[0],post_engagements:350}]});await write({...p,days:[{...p.days[0],post_engagements:null,media_views:80}]});
  const rows=(await db.query('select * from public.review_tracker_facebook_daily')).rows;assert.equal(rows.length,1);assert.equal(rows[0].post_engagements,350);assert.equal(rows[0].media_views,80);assert.deepEqual(rows[0].created_at,created);
  await write({...p,days:[],snapshot:{...p.snapshot,snapshot_date:'2026-10-19',followers_count:8210}});
  const read=async type=>(await db.query('select public.review_tracker_facebook_read($1::jsonb) as value',[JSON.stringify({from:'2026-10-19',to:'2026-10-19',page_ids:[hotel.page_id],type})])).rows[0].value;
  const f=await read('followers');assert.equal(f.snapshots.length,1);assert.equal(f.latest[0].followers_count,8210);assert.equal(f.previous[0].followers_count,8194);assert.equal(f.baseline.length,1);assert.equal((await read('insights')).days.length,0);
  await assert.rejects(()=>write({...p,days:[{...p.days[0],post_engagements:999}],snapshot:{...p.snapshot,snapshot_date:'invalid'}}));assert.equal((await db.query('select post_engagements from public.review_tracker_facebook_daily')).rows[0].post_engagements,350);
  await assert.rejects(()=>write({...p,hotel:{...hotel,page_id:'unknown'}}));
  for(const role of ['anon','authenticated']){await db.exec('reset role; set role '+role);await assert.rejects(()=>db.query('select * from public.review_tracker_facebook_daily'));await assert.rejects(()=>read('followers'));await assert.rejects(()=>write(p));}
 }finally{await db.close();}
});

test('dashboard follower delta +16, no invented history or period unique user count, null metrics stay null',()=>{
 const followers={latest:[{page_id:hotel.page_id,snapshot_date:'2026-10-19',followers_count:8210}],previous:[{page_id:hotel.page_id,snapshot_date:'2026-10-18',followers_count:8194}],snapshots:[{page_id:hotel.page_id,snapshot_date:'2026-10-18',followers_count:8194},{page_id:hotel.page_id,snapshot_date:'2026-10-19',followers_count:8210}]};
 const report=hotelFacebookReport(hotel,{days:[]},followers,'2026-10-01','2026-10-19');assert.equal(report.dailyGrowth,16);assert.equal(report.growth.value,16);assert.equal(report.growth.from,'2026-10-18');assert.equal(report.totals.unique_viewers.value,null);
 assert.doesNotThrow(()=>hotelFacebookReport(hotel,{}, {...followers,baseline:followers.snapshots},'',''));
 followers.previous[0].snapshot_date='2026-10-17';followers.snapshots=followers.snapshots.slice(1);const missing=hotelFacebookReport(hotel,{},followers,'2026-10-01','2026-10-19');assert.equal(missing.dailyGrowth,null);assert.equal(missing.growth,null);
});

test('HTTP routes use existing app auth; invalid filters fail before DB; cron requires secret; status never leaks secrets',async()=>{
 const saved={...process.env};process.env.AUTH_MODE='password';process.env.APP_PASSWORD='long-app-password-123';process.env.CRON_SECRET='cron-secret';process.env.META_USER_ACCESS_TOKEN='TOP_SECRET';process.env.FACEBOOK_AUTO_SYNC='false';
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await fetch(base+'/api/facebook/insights')).status,401);assert.equal((await fetch(base+'/api/facebook/cron')).status,401);const auth={Authorization:'Bearer '+process.env.APP_PASSWORD};const status=await (await fetch(base+'/api/facebook/status',{headers:auth})).json();assert.equal(status.hotels.length,5);assert.equal(status.configured,true);assert.ok(!JSON.stringify(status).includes('TOP_SECRET'));
  assert.equal((await fetch(base+'/api/facebook/insights?from=2026-02-30&to=2026-10-19',{headers:auth})).status,400);assert.equal((await fetch(base+'/api/facebook/followers?pageId=unknown',{headers:auth})).status,400);assert.equal((await fetch(base+'/api/facebook/sync?since=2026-10-19&until=2026-10-01',{method:'POST',headers:auth})).status,400);assert.equal((await fetch(base+'/api/facebook/cron',{headers:{Authorization:'Bearer cron-secret'}})).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});

test('Facebook router forbids member/viewer sync and mismatched hotel/Page filters before any external calls',async()=>{
 const app=express();app.use((req,_res,next)=>{req.user={role:req.headers['x-test-role']||'member'};next();});app.use('/api/facebook',createFacebookRouter());app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:err.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const role of ['viewer','member'])for(const path of ['sync','report'])assert.equal((await fetch(base+'/api/facebook/'+path,{method:'POST',headers:{'x-test-role':role}})).status,403);
  assert.equal((await fetch(base+'/api/facebook/insights?'+new URLSearchParams({hotelKey:hotel.hotel_key,pageId:FACEBOOK_HOTELS[1].page_id}))).status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('extra metrics preserve base fields; optional failures do not prevent saving; posts count Vietnam dates and deduplicate',async()=>{
 const extra=normalizeInsights([{...group(12),name:'page_views_total'}],hotel,'2026-10-01','2026-10-19',EXTRA_METRICS);assert.equal(extra[0].page_visits,12);
 const posts=normalizePublishedPosts([{id:'one',created_time:'2026-10-15T18:00:00Z'},{id:'one',created_time:'2026-10-15T18:00:00Z'}],'2026-10-15','2026-10-17');assert.deepEqual(posts,[{post_date:'2026-10-15',published_posts:0},{post_date:'2026-10-16',published_posts:1}]);
 let saved;const meta={getPageAccessToken:()=> 'PAGE',getPageSummary:async()=>({id:hotel.page_id,followers_count:10}),getPageInsights:async()=>[group()],getAdditionalInsight:async(_id,_token,_a,_b,metric)=>{if(metric==='page_daily_follows')throw Error('SECRET');return [{...group(12),name:metric}];},getPublishedPosts:async()=>{throw Error('SECRET');}};
 const result=await syncFacebookHotel(hotel,{meta,pages:new Map(),since:'2026-10-15',until:'2026-10-17',now,save:async p=>{saved=p;}});assert.equal(result.ok,true);assert.equal(result.additionalComplete,false);assert.equal(result.warnings.length,2);assert.equal(saved.days[0].post_engagements,340);assert.equal(saved.days[0].page_visits,12);assert.equal(saved.days[0].new_follows,undefined);assert.equal(saved.posts,null);assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('period supplement validation and Excel parser keep overlapping periods separate and flag invalid percentage cells',()=>{
 assert.deepEqual(validateFacebookReport({values:{link_clicks:0,response_rate:96.8},source_note:' Source '}),{values:{link_clicks:0,response_rate:96.8},source_note:'Source'});
 for(const values of [{link_clicks:-1},{response_rate:101},{link_clicks:1.5},{unknown:2},{}, {media_views:'3'}])assert.throws(()=>validateFacebookReport({values,source_note:'Source'}));
 const rows=[['ID','Date Bắt Đầu','Date Kết Thúc','Channel','Metric','Value'],[hotel.hotel_name,'2026-10-01','2026-10-10','Facebook','Lượt Xem',100],[hotel.hotel_name,'2026-10-01','2026-10-19','Facebook','Lượt Xem',150],[hotel.hotel_name,'2026-10-01','2026-10-10','Facebook','Tỷ Lệ Phản Hồi',0.968],[hotel.hotel_name,'2026-10-01','2026-10-19','Facebook','Tỷ Lệ Phản Hồi',new Date()],[hotel.hotel_name,'2026-10-01','2026-10-19','TikTok','Lượt Xem',500]];
 const result=parseFacebookWorkbook([{name:'Report',rows,formats:[[],[],[],[null,null,null,null,null,'0.0%']]}],FACEBOOK_HOTELS,'report.xlsx');assert.equal(result.reports.length,2);assert.equal(result.reports[0].values.response_rate,96.8);assert.equal(result.reports[1].values.media_views,150);assert.equal(result.issues.length,1);assert.equal(result.ignored,1);const brand=parseFacebookWorkbook([{name:'Brand report',rows:rows.map((r,i)=>i===0?['Brand',...r.slice(1)]:r)}],FACEBOOK_HOTELS,'report.xlsx');assert.equal(brand.reports.length,2);
 const duplicate=parseFacebookWorkbook([{name:'Report',rows:[...rows, [...rows[1].slice(0,5),999]]}],FACEBOOK_HOTELS,'report.xlsx');assert.equal(duplicate.reports[0].conflicts.length,1);
});

test('extension stores exact period supplements and published posts, preserves API history and denies browser access',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');for(const file of ['facebook-module.sql','facebook-report-extension.sql'])await db.exec(await readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'));await db.exec('set role service_role');
  const rpc=async(name,p)=>(await db.query(`select public.${name}($1::jsonb) as value`,[JSON.stringify(p)])).rows[0].value;
  const write={hotel:FACEBOOK_HOTELS.at(-1),days:[{metric_date:'2026-10-15',bucket_end_time:'2026-10-16T07:00:00Z',page_visits:20}],posts:[{post_date:'2026-10-15',published_posts:0}],snapshot:{snapshot_date:'2026-10-19',followers_count:5}};
  await rpc('review_tracker_facebook_upsert',write);await rpc('review_tracker_facebook_upsert',{...write,days:[{...write.days[0],page_visits:null}],posts:null});assert.equal((await db.query('select page_visits from public.review_tracker_facebook_daily')).rows[0].page_visits,20);
  const p={action:'save',page_id:write.hotel.page_id,from:'2026-10-01',to:'2026-10-19',values:{link_clicks:0,response_rate:96.8},source_note:'Excel',actor:'test'};
  const saved=await rpc('review_tracker_facebook_report',p);assert.equal(saved.report.metric_values.link_clicks,0);assert.ok(!('actor' in saved.report));assert.equal(saved.posts[0].published_posts,0);
  await rpc('review_tracker_facebook_report',{...p,values:{link_clicks:12}});assert.equal((await db.query('select count(*)::int n from public.review_tracker_facebook_period_reports')).rows[0].n,1);
  const other=await rpc('review_tracker_facebook_report',{...p,action:'read',to:'2026-10-18'});assert.equal(other.report,null);assert.equal(other.history.length,1);assert.equal((await db.query('select page_visits from public.review_tracker_facebook_daily')).rows[0].page_visits,20);
  await assert.rejects(()=>rpc('review_tracker_facebook_report',{...p,values:{response_rate:101}}));
  for(const role of ['anon','authenticated']){await db.exec('reset role; set role '+role);await assert.rejects(()=>rpc('review_tracker_facebook_report',{...p,action:'read'}));await assert.rejects(()=>db.query('select * from public.review_tracker_facebook_period_reports'));await assert.rejects(()=>db.query('select * from public.review_tracker_facebook_posts_daily'));}
 }finally{await db.close();}
});
