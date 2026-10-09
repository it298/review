import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {ycsRoutes,exactYcsResponse,parseYcsJson,configuredYcsTargets,readYcsJson} from '../src/ycs-summary.js';
const target={source:'agoda',property_id:'83491477',hotel_key:'quy-nhon-sea-hotel'};
const routes=ycsRoutes(target.property_id),origin='https://portal.agoda.com';
const options=()=>({scoreUrl:origin+routes.score,metadataUrl:origin+routes.metadata,capturedAt:new Date().toISOString()});
const score={group:{score:9.4,maxScore:10,reviewCount:143}};
const metadata={propertyName:'Vistara Quy Nhon Sea Hotel'};
test('reads only verified YCS group totals and drops all unrelated fields',()=>{
 const result=parseYcsJson({...score,reviews:Array(20).fill({score:10}),reviewsCount:20,token:'discard'}, {...metadata,guestEmail:'discard'},target,options());
 assert.deepEqual(result.payload.summary,{rating:9.4,ratingMax:10,count:143});assert.deepEqual(result.payload.reviews,[]);assert.equal(result.payload.method,'api');assert.equal(JSON.stringify(result).includes('discard'),false);
});
test('does not guess a total from reviews, filtered counts or component ratings',()=>{
 for(const data of [{reviewsCount:143,score:9.4},{group:{score:9.4,maxScore:10},reviewsCount:143},{group:{score:9.4,maxScore:5,reviewCount:143}},{group:{score:9.4,maxScore:10,reviewCount:null}},{group:{score:'9.4',maxScore:10,reviewCount:143}},{group:{score:94,maxScore:10,reviewCount:143}},{group:{score:9.4,maxScore:10,reviewCount:14.3}}])assert.throws(()=>parseYcsJson(data,metadata,target,options()));
 assert.equal(parseYcsJson({group:{score:0,maxScore:10,reviewCount:0}},metadata,target,options()).payload.summary.count,0);
});
test('requires the exact registered property in both response URLs',()=>{
 for(const url of ['https://portal.agoda.com.evil.test'+routes.score,'http://portal.agoda.com'+routes.score,origin+routes.score+'?token=discard',origin+routes.score+'1',origin+routes.score.replace('83491477','31244978')]){assert.equal(exactYcsResponse(url,routes.score),false);assert.throws(()=>parseYcsJson(score,metadata,target,{...options(),scoreUrl:url}));}
 assert.throws(()=>parseYcsJson(score,{},target,options()));assert.throws(()=>parseYcsJson(score,metadata,{...target,source:'trip'},options()));assert.throws(()=>ycsRoutes('../123'));
});
test('only explicitly selected enabled Agoda targets are enrolled',()=>{
 const list=[target,{source:'agoda',property_id:'31244978'},{source:'trip',property_id:'83491477'}];
 assert.deepEqual(configuredYcsTargets(list,' 83491477,83491477 '),[target]);assert.throws(()=>configuredYcsTargets(list,''));assert.throws(()=>configuredYcsTargets(list,'123'));assert.throws(()=>configuredYcsTargets(list,'83491477,abc'));
});
let browser;
before(async()=>{browser=await chromium.launch({channel:'chromium',headless:true});});
after(async()=>{await browser?.close();});
async function fixture({login=false,wrongMetadata=false,invalidScore=false}={}){
 const context=await browser.newContext();
 await context.route(origin+'/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path===new URL(routes.page).pathname){
   if(login)return route.fulfill({status:302,headers:{location:'/mldc/en-us/public/login'}});
   return route.fulfill({contentType:'text/html',body:`<html><body>OWN TEST FIXTURE<script>fetch('${routes.score}');fetch('${wrongMetadata?routes.metadata.replace('83491477','31244978'):routes.metadata}');fetch('/mldc/en-us/api/setting/Review/searchreviews/83491477');</script></body></html>`});
  }
  if(path===routes.score)return route.fulfill({contentType:'application/json',body:JSON.stringify(invalidScore?{group:{score:94,maxScore:10,reviewCount:143}}:score)});
  if(path===routes.metadata||path.endsWith('/31244978'))return route.fulfill({contentType:'application/json',body:JSON.stringify(metadata)});
  if(path.includes('searchreviews'))return route.fulfill({contentType:'application/json',body:JSON.stringify({reviewsCount:999,reviews:[{score:10}]})});
  return route.fulfill({contentType:'text/html',body:'Login required'});
 });
 return {context,page:await context.newPage()};
}
test('worker captures the fresh JSON responses from normal page loading',async()=>{
 const {context,page}=await fixture();try{const data=await readYcsJson(page,target,{timeout:10000});assert.equal(data.payload.summary.count,143);assert.equal(data.payload.summary.rating,9.4);assert.equal(data.payload.propertyId,'83491477');}finally{await context.close();}
});
test('expired session fails before writing any summary',async()=>{
 const {context,page}=await fixture({login:true});try{await assert.rejects(readYcsJson(page,target,{timeout:10000}),error=>error.code==='login_required');}finally{await context.close();}
});
test('rejects mismatched metadata and malformed summary in real browser fixtures',async()=>{
 for(const scenario of [{wrongMetadata:true},{invalidScore:true}]){const {context,page}=await fixture(scenario);try{await assert.rejects(readYcsJson(page,target,{timeout:1000}));}finally{await context.close();}}
});
