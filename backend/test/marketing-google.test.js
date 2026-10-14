import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePerformance,performanceRange,readPerformance} from '../src/marketing-google.js';
import {encryptTokens} from '../src/google.js';
test('marketing keeps omitted metrics unavailable, zeros valid and rejects overlapping series',()=>{
 const raw={multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:[{dailyMetric:'CALL_CLICKS',timeSeries:{datedValues:[{date:{year:2026,month:9,day:1},value:'3'},{date:{year:2026,month:9,day:2}}]}}]}]};
 const data=normalizePerformance(raw,'2026-09-01','2026-09-02');assert.equal(data.metrics.find(m=>m.key==='CALL_CLICKS').value,3);assert.equal(data.days[1].CALL_CLICKS,0);assert.equal(data.metrics.find(m=>m.key==='WEBSITE_CLICKS').value,null);
 raw.multiDailyMetricTimeSeries.push(raw.multiDailyMetricTimeSeries[0]);assert.throws(()=>normalizePerformance(raw,'2026-09-01','2026-09-02'));
 for(const dates of [['2026-02-30','2026-03-01'],['2026-10-01','2026-09-01'],['2023-01-01','2025-01-01']])assert.throws(()=>performanceRange(...dates));
});
test('Google Business report uses OAuth, validates mapped locations and saves exact-period results privately',async()=>{
 const original=globalThis.fetch;process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');const saved=new Map();let calls=0;
 globalThis.fetch=async(input,options={})=>{const url=new URL(input);let result;
  if(url.hostname==='test.supabase.co'){const args=JSON.parse(options.body);switch(url.pathname.split('/').at(-1)){
   case 'review_tracker_state':result={places:{1:{id:1,name:'Mapped hotel',google_location:'locations/123'}}};break;
   case 'review_tracker_kv_get':result=saved.get(args.p_key)||null;break;
   case 'review_tracker_connection_get':result={payload:encryptTokens({access_token:'private-test-token',expires_at:Date.now()+3600000})};break;
   case 'review_tracker_marketing_set':assert.match(args.p_key,/^marketing:report:[a-f0-9]{64}$/);saved.set(args.p_key,args.p_value);result=null;break;
   default:throw Error('Unexpected RPC');
  }}else{assert.equal(url.hostname,'businessprofileperformance.googleapis.com');assert.equal(url.pathname,'/v1/locations/123:fetchMultiDailyMetricsTimeSeries');assert.equal(options.headers.Authorization,'Bearer private-test-token');assert.equal(url.searchParams.get('dailyRange.start_date.month'),'9');assert.ok(url.searchParams.getAll('dailyMetrics').includes('CALL_CLICKS'));calls++;result={multiDailyMetricTimeSeries:[{dailyMetricTimeSeries:[{dailyMetric:'CALL_CLICKS',timeSeries:{datedValues:[{date:{year:2026,month:9,day:1},value:'12'}]}}]}]};}
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 try{await assert.rejects(()=>readPerformance('999','2026-09-01','2026-09-02',true));assert.equal(calls,0);const data=await readPerformance('1','2026-09-01','2026-09-02',true);assert.equal(data.source,'google_api');assert.equal(JSON.stringify(data).includes('private-test-token'),false);assert.equal((await readPerformance('1','2026-09-01','2026-09-02')).source,'saved');assert.equal((await readPerformance('1','2026-09-02','2026-09-02')).report,null);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
