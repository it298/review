import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { extractReviewCount,extractRating } from '../src/services/mapsExtract.js';

test('local Chromium extracts exact review count and keeps missing rating null', {skip:process.env.RUN_BROWSER_TESTS!=='1'}, async()=>{
  const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(1000);
    await page.setContent('<main role="main"><h1 class="DUwDvf">Hotel</h1><div class="F7nice"><span aria-hidden="true">4,7</span><span>(1.234)</span></div></main>');
    assert.equal((await extractReviewCount(page)).count,1234);assert.equal(await extractRating(page),4.7);
    await page.setContent('<main role="main"><h1 class="DUwDvf">Hotel</h1><div class="F7nice"><span aria-hidden="true"></span><span>(123)</span></div></main>');
    assert.equal((await extractReviewCount(page)).count,123);assert.equal(await extractRating(page),null);
  }finally{await browser.close();}
});
