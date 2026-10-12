import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {parseTravelokaOverall,configuredTravelokaTargets,travelokaReviewPage,readTravelokaSummary} from '../src/traveloka-summary.js';
const target={source:'traveloka',entity_key:'sontra-sea-hotel',extranet_property_id:'20057470',extranet_name:'Sontra Sea Hotel',source_url:'https://www.traveloka.com/en-en/hotel/vietnam/sontra-sea-hotel-9000000986772'};
test('reads only the complete overall card, never filtered review count or individual rating',()=>{
 assert.deepEqual(parseTravelokaOverall('Điểm số chung\n9.5\nSuperb\nDựa trên 209 đánh giá'),{rating:9.5,reviewCount:209});
 assert.deepEqual(parseTravelokaOverall('Điểm số chung\n9,7\nSuperb\nDựa trên 1.234 đánh giá'),{rating:9.7,reviewCount:1234});
 for(const text of ['9.5\nGuest\n209 đánh giá','Điểm số chung\n11\nSuperb\nDựa trên 209 đánh giá','Điểm số chung\n9.5\nSuperb\nDựa trên 2.5 đánh giá','Điểm số chung\n9.5\nChưa trả lời (209)'])assert.throws(()=>parseTravelokaOverall(text));
 assert.equal(travelokaReviewPage('https://tera.traveloka.com/vi-vn/guest-review/'),true);assert.equal(travelokaReviewPage('https://tera.traveloka.com.evil.test/vi-vn/guest-review/'),false);
 assert.equal(configuredTravelokaTargets([target],'20057470').length,1);assert.throws(()=>configuredTravelokaTargets([target],'1'));
});
test('rendered portal fixture verifies identity and excludes individual guest data',async()=>{
 const browser=await chromium.launch({channel:'chromium',headless:true});try{for(const wrong of [false,true]){
 const context=await browser.newContext();await context.route('https://tera.traveloka.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<header><span data-testid="hotel-list-dropdown-active-name">Sontra Sea Hotel</span><span data-testid="hotel-list-dropdown-active-id">20057470</span></header><main><div><div>Điểm số chung</div><div>9.5</div><div>Superb</div><div>Dựa trên 209 đánh giá</div></div><div>Guest PRIVATE rating 1; filtered 0</div></main>`}));
 const page=await context.newPage();try{
 if(wrong)await assert.rejects(()=>readTravelokaSummary(page,{...target,extranet_name:'Another property'},{timeout:1000}));
 else {const {payload,evidenceBytes}=await readTravelokaSummary(page,target,{timeout:1000});assert.equal(payload.reviewCount,209);assert.equal(payload.rating,9.5);assert.equal(payload.method,'extranet-auto');assert.ok(evidenceBytes.length>0);assert.equal(JSON.stringify(payload).includes('PRIVATE'),false);}
 }finally{await context.close();}
 }}finally{await browser.close();}
});
