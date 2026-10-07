import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateMapsUrl, parseRating, workerCount, mapsIdentity, parseLocalizedCount, extractCountFromReviewLabel } from '../src/services/scraperUtils.js';
import { calendarDate } from '../src/utils/date.js';
test('missing ratings remain null',()=>{assert.equal(parseRating(''),null);assert.equal(parseRating('4,7'),4.7);assert.equal(parseRating('6'),null);});
test('Vietnam date around midnight',()=>{assert.equal(calendarDate('2026-10-06T19:00:00Z'),'2026-10-07');assert.equal(calendarDate('2026-10-06T16:59:00Z'),'2026-10-06');});
test('official Maps URLs only',()=>{for(const url of ['https://google.com.example.org/maps','http://www.google.com/maps','https://user:pass@www.google.com/maps','https://www.google.com/search','https://goo.gl/other']) assert.throws(()=>validateMapsUrl(url)); assert.ok(validateMapsUrl('https://maps.app.goo.gl/abc'));});
test('worker configuration fallback and cap',()=>{assert.equal(workerCount('abc',20),3);assert.equal(workerCount('100',20),5);assert.equal(workerCount('0',20),3);assert.equal(workerCount('3',1),1);});
test('same Maps CID with different URL forms',()=>{assert.equal(mapsIdentity('https://www.google.com/maps?cid=255'),mapsIdentity('https://www.google.com/maps/place/A/data=!1s0x12:0xff'));});
test('exact localized counts; reject rounded and ratings',()=>{for(const value of ['1,234','1.234','1 234','(1.234)'])assert.equal(parseLocalizedCount(value),1234);assert.equal(parseLocalizedCount('4.9'),null);assert.equal(parseLocalizedCount('1.2K'),null);assert.equal(extractCountFromReviewLabel('1.234 đánh giá'),1234);assert.equal(extractCountFromReviewLabel('1.2K reviews'),null);assert.equal(extractCountFromReviewLabel('reviews: 123'),123);});
test('snapshot upsert and removal persist',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'places-test-'));process.env.DB_FILE=path.join(temp,'db.json');
 try { const {default:db}=await import('../src/db/index.js'); const p=db.insertPlace({place_id:'test',name:'Test',custom_name:'My hotel'}); db.upsertTodaySnapshot(p.id,10,4.5);db.upsertTodaySnapshot(p.id,12,null);assert.equal(db.history(p.id).length,1);assert.equal(db.history(p.id)[0].user_rating_count,12);assert.equal(db.getPlaceById(p.id).custom_name,'My hotel');db.removePlace(p.id);assert.equal(db.history(p.id).length,0);assert.equal(JSON.parse(fs.readFileSync(process.env.DB_FILE)).places.length,0); } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
