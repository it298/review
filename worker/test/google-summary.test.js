import test from 'node:test';import assert from 'node:assert/strict';
import {googleHeaderNumbers,googlePlaceToken,googleTargetUrl} from '../src/google-summary.js';
test('Google selected header preserves missing totals and never uses nearby place counts',()=>{
 assert.deepEqual(googleHeaderNumbers({starLabels:['4.9 stars'],countLabels:[]}),{rating:4.9,reviewCount:null});
 assert.deepEqual(googleHeaderNumbers({starLabels:['4.8 stars'],countLabels:['1,234 reviews']}),{rating:4.8,reviewCount:1234});
 assert.deepEqual(googleHeaderNumbers({starLabels:['4,9 sao','434 bài đánh giá','1.000 ₫'],countLabels:['4,9 sao','434 bài đánh giá','434 bài đánh giá','1.000 ₫']}),{rating:4.9,reviewCount:434});
 assert.throws(()=>googleHeaderNumbers({starLabels:['4.9 stars','4.3 stars'],countLabels:[]}));
 assert.equal(googlePlaceToken('https://www.google.com/maps/data=!1s0xab:0xcd!1s0xef:0x12'),'0xef:0x12');
 assert.throws(()=>googleTargetUrl('https://www.google.com.evil.test/maps'));assert.throws(()=>googleTargetUrl('https://www.google.com/accounts'));
});
