import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseTravelokaReviews} from '../src/traveloka-reviews.js';
const target={source:'traveloka',entity_key:'hotel-one',extranet_property_id:'123',source_url:'https://www.traveloka.com/hotel/123'};
const request={data:{hotelId:'123',skip:0,top:10,filterSortSpec:{filterType:null,dateRangeStart:null,dateRangeEnd:null,sortType:'NEWEST_TIMESTAMP'}}};
const body={data:{numReviewEntries:'1',reviewList:[{reviewId:'1878546664194580669',overallScore:'2.0',timestamp:'1791521705813',reviewText:'Poor stay',bookingId:'private',reviewerName:'private'}]}};
test('Traveloka parses only verified property/all-review JSON and retains exact native score/date without guest fields',()=>{
 const batch=parseTravelokaReviews(body,request,target);assert.equal(batch.reviews[0].rating,2);assert.equal(batch.reviews[0].ratingMax,10);assert.equal(batch.reviews[0].reviewedAt,new Date(1791521705813).toISOString());assert.equal(batch.reviews[0].bookingId,undefined);assert.equal(batch.reviews[0].author,'');
});
test('filtered/wrong property/empty-with-positive-count/malformed timestamps cannot initialize monitoring',()=>{
 assert.throws(()=>parseTravelokaReviews(body,{data:{...request.data,hotelId:'456'}},target));
 assert.throws(()=>parseTravelokaReviews(body,{data:{...request.data,filterSortSpec:{...request.data.filterSortSpec,filterType:'REVIEWS_WITH_NO_REPLY'}}},target));
 assert.throws(()=>parseTravelokaReviews({data:{numReviewEntries:'1',reviewList:[]}},request,target));
 assert.throws(()=>parseTravelokaReviews({data:{numReviewEntries:'1',reviewList:[{...body.data.reviewList[0],timestamp:'bad'}]}},request,target));
});
