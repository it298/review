import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePilot,vietnameseDate} from './agoda-pilot.js';
const row={reviewId:'123',rating:'9,6',reviewedAt:'Đã nhận xét vào 25 tháng 9 2026',content:'Guest text',response:'Hotel response'};
const input={source:'agoda',propertyId:'64821141',sourceCount:471,rating:9.4,ratingMax:10,pages:[[row],[row]]};
test('Repeated page is partial and cannot masquerade as successful full sync',()=>{const r=validatePilot(input);assert.equal(r.collectedCount,1);assert.equal(r.duplicates,1);assert.equal(r.status,'pagination_stalled');assert.equal(r.complete,false);assert.equal(r.reviews[0].content,'Guest text');assert.equal(r.reviews[0].response,'Hotel response');assert.equal(r.reviews[0].reviewedAt,'2026-09-25');});
test('Reject bad dates, IDs, source and wrong sort',()=>{assert.throws(()=>vietnameseDate('31 tháng 2 2026'));assert.throws(()=>validatePilot({...input,source:'mixed'}));assert.throws(()=>validatePilot({...input,pages:[[{...row,reviewId:''}]]}));assert.throws(()=>validatePilot({...input,pages:[[row,{...row,reviewId:'456',reviewedAt:'26 tháng 9 2026'}]]}));});
