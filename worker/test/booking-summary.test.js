import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {parseBookingCard,bookingPageMatches,bookingPublicToken,configuredBookingTargets,readBookingSummary} from '../src/booking-summary.js';
import {skipBookingPublicTarget} from '../src/public-summary.js';
const target={source:'booking',entity_key:'vistara-gia-lai-sea-hotel',source_url:'https://www.booking.com/hotel/vn/vistara-gia-lai-sea.vi.html',extranet_property_id:'17212594'};
const home='/hotel/hoteladmin/extranet_ng/manage/home.html',reviews='/hotel/hoteladmin/extranet_ng/manage/reviews.html';
test('reads only complete labeled overall score, native scale and exact count',()=>{
 assert.deepEqual(parseBookingCard('10\nĐiểm đánh giá của Quý vị\ndựa trên 2 đánh giá'),{rating:10,reviewCount:2});
 assert.deepEqual(parseBookingCard('9,4\nYour review score\nbased on 1,234 reviews'),{rating:9.4,reviewCount:1234});
 for(const text of ['10\nHữu Quang\n2 đánh giá','9.5\nYour review score\nbased on 2.5 reviews','9.4\nCleanliness\n143 reviews','11\nYour review score\nbased on 2 reviews','—\nYour review score\nbased on 2 reviews'])assert.throws(()=>parseBookingCard(text));
});
test('requires official portal, selected hotel, observed route and unfiltered page',()=>{
 const url='https://admin.booking.com'+reviews+'?hotel_id=17212594&lang=vi&ses=LOCAL_ONLY';
 assert.equal(bookingPageMatches(url,reviews,'17212594'),true);
 for(const invalid of [url.replace('admin.booking.com','admin.booking.com.evil.test'),url.replace('https:','http:'),url+'&score=10',url+'&hotel_id=31244978',url.replace('17212594','123')])assert.equal(bookingPageMatches(invalid,reviews,'17212594'),false);
 assert.equal(bookingPublicToken('https://www.booking.com/hotel/vn/vistara-gia-lai-sea.html'),'vn/vistara-gia-lai-sea');
 assert.equal(bookingPublicToken(target.source_url),'vn/vistara-gia-lai-sea');
 assert.equal(bookingPublicToken(target.source_url.replace('booking.com','booking.com.evil.test')),null);
});
test('only explicitly enrolled Extranet IDs are selected; public slug is not numeric ID',()=>{
 assert.deepEqual(configuredBookingTargets([target],'17212594,17212594'),[target]);
 for(const ids of ['', '123','vn/vistara-gia-lai-sea'])assert.throws(()=>configuredBookingTargets([target],ids));
});
test('public fallback cannot overwrite an explicitly mapped Booking Extranet when endpoint is unavailable',()=>{
 assert.equal(skipBookingPublicTarget(target,true,'17212594'),true);
 for(const t of [{...target,extranet_property_id:null},{...target,extranet_property_id:'1'},{...target,source:'tripadvisor'}])assert.equal(skipBookingPublicTarget(t,true,'17212594'),false);
 assert.equal(skipBookingPublicTarget(target,false,'17212594'),false);
});
let browser;before(async()=>{browser=await chromium.launch({channel:'chromium',headless:true});});after(async()=>{await browser?.close();});
async function fixture({expired=false,wrongSlug=false,wrongId=false,filtered=false,missing=false}={}){
 const context=await browser.newContext();
 await context.route('https://admin.booking.com/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname===home)return route.fulfill({contentType:'text/html',body:`<button>Vistara Gia Lai Sea Hotel <span>17212594</span></button><a href="https://www.booking.com/hotel/vn/${wrongSlug?'different-hotel':'vistara-gia-lai-sea'}.html">Property</a><a href="${reviews}?hotel_id=${wrongId?'123':'17212594'}${filtered?'&score=10':''}&ses=LOCAL_ONLY">Reviews</a>`});
  if(u.pathname===reviews)return route.fulfill({contentType:'text/html; charset=utf-8',body:`<div class="overall-review-score">${missing?'Missing rating':'10<br>Điểm đánh giá của Quý vị<br>dựa trên 2 đánh giá'}</div><div>Individual review score 5, filtered count 1, guest name PRIVATE</div>`});
  return route.abort();
 });
 await context.route('https://account.booking.com/**',route=>route.fulfill({contentType:'text/html',body:'Login'}));
 const page=await context.newPage(),navigate=page.goto.bind(page);
 // Mock only the portal entry redirect. Routed HTTP redirects can escape a
 // fixture interceptor; every rendered page and subsequent link remains real.
 page.goto=(url,options)=>navigate(url==='https://admin.booking.com/'?(expired?'https://account.booking.com/login':'https://admin.booking.com'+home+'?hotel_id=17212594'):url,options);
 return {context,page};
}
test('reads real rendered summary in own browser fixture without leaking sessions or guests',async()=>{
 const {context,page}=await fixture();try{const {payload,evidenceBytes}=await readBookingSummary(page,target,{timeout:10000});assert.equal(payload.rating,10);assert.equal(payload.reviewCount,2);assert.equal(payload.extranetPropertyId,'17212594');assert.equal(payload.collectionContext,'booking-extranet');assert.ok(evidenceBytes.length>0);assert.equal(/LOCAL_ONLY|PRIVATE/.test(JSON.stringify(payload)),false);}finally{await context.close();}
});
test('expired login, wrong identity, filtered pages and malformed overall cards fail',async()=>{
 for(const scenario of [{expired:true},{wrongSlug:true},{wrongId:true},{filtered:true},{missing:true}]){const {context,page}=await fixture(scenario);try{await assert.rejects(readBookingSummary(page,target,{timeout:3000}));}finally{await context.close();}}
});
