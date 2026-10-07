import { chromium } from 'playwright-core';
import { validateMapsUrl } from './services/scraperUtils.js';
import { extractReviewCount, extractRating } from './services/mapsExtract.js';
export async function scrape(url) {
  validateMapsUrl(url);
  let browser;
  try {
    browser=await chromium.launch({headless:true,timeout:15000,args:['--disable-dev-shm-usage']});
    const context=await browser.newContext({locale:'vi-VN',viewport:{width:1440,height:1000}});
    const page=await context.newPage();page.setDefaultTimeout(3000);
    await context.route('**/*',async route=>{
      if(route.request().isNavigationRequest() && route.request().frame()===page.mainFrame()) {
        try{validateMapsUrl(route.request().url());}catch{return route.abort();}
      }
      return route.continue();
    });
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForSelector('h1.DUwDvf',{timeout:12000});
    await page.waitForTimeout(1500);
    const name=(await page.locator('h1.DUwDvf').first().innerText()).trim();
    const count=await extractReviewCount(page);
    if(!name || !count) throw new Error('Không đọc được thông tin chính xác từ Google Maps.');
    const rating=await extractRating(page);
    const address=await page.locator('[data-item-id*="address"]').first().getAttribute('aria-label').catch(()=>null);
    return {name,reviewCount:count.count,rating,address:address || '',url:page.url()};
  } catch {
    throw new Error('Không lấy được dữ liệu Google Maps. Kiểm tra URL, bộ nhớ dịch vụ và Chromium hoặc thử lại sau.');
  } finally {await browser?.close().catch(()=>{});}
}
