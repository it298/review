import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectReviewBatch} from '../src/review-reader.js';
const target={hotel_key:'hotel-one',source:'agoda',property_id:'123',source_url:'https://www.agoda.com/hotel-one/hotel/city.html'};
const now=new Date('2026-10-12T07:00:00Z');
test('verified public reviews use explicit entity, native scale and date-only precision without credentials',async()=>{
 const batch=await collectReviewBatch(target,async()=>({reviews:[{reviewId:'12345',rating:2,reviewedAt:'2026-10-11',content:'Poor stay',cookie:'secret',bookingId:'private'}]}),now);
 assert.equal(batch.entityKey,'hotel-one');assert.equal(batch.method,'dom');assert.equal(batch.reviews[0].ratingMax,10);assert.equal(batch.reviews[0].dateOnly,true);assert.equal(batch.reviews[0].cookie,undefined);assert.equal(batch.reviews[0].bookingId,undefined);
});
test('missing review panel, bad IDs or dates never establish an empty baseline',async()=>{
 await assert.rejects(()=>collectReviewBatch(target,async()=>({reviews:[]}),now),{code:'unavailable'});
 await assert.rejects(()=>collectReviewBatch(target,async()=>({reviews:[{reviewId:'',rating:2,reviewedAt:'2026-10-11',content:''}]}),now));
 await assert.rejects(()=>collectReviewBatch(target,async()=>({reviews:[{reviewId:'123',rating:2,reviewedAt:'',content:''}]}),now));
 await assert.rejects(()=>collectReviewBatch({...target,source:'traveloka'},async()=>({reviews:[]}),now),{code:'unconfigured'});
});
