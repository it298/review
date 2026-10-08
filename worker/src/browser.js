import {chromium} from 'playwright';
import {createWorker} from 'tesseract.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {blocked,parseSummary,parseAgodaCard,targetURL} from './parse.js';
import {darkDigitsOnWhite,ratingGlyphs} from './ocr-image.js';
export function browserAdapters(){
 let browser;const opened=new Map();const failures=new Map();const evidence=new Map();
 async function capture(target,region,summary,method='dom',bytes){
  try{bytes=bytes||await region.screenshot();const capturedAt=new Date().toISOString(),dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence'),base=target.source+'-'+target.property_id+'-'+Date.now();await mkdir(dir,{recursive:true});await writeFile(resolve(dir,base+'.png'),bytes);await writeFile(resolve(dir,base+'.json'),JSON.stringify({source:target.source,propertyId:target.property_id,capturedAt,status:'success',summary,method,verified:true}));evidence.set(target.source+':'+target.property_id,{bytes,capturedAt,method});return capturedAt;}catch{console.error('Evidence capture unavailable; verified summary remains usable.');return new Date().toISOString();}
 }
 async function pageFor(target){
  const key=target.source+':'+target.property_id;if(failures.has(key))throw failures.get(key);if(opened.has(key))return opened.get(key);
  if(!browser){try{browser=await chromium.launch({headless:process.env.OTA_BROWSER_HEADLESS==='true',channel:'chromium'});}catch{throw Object.assign(new Error('Browser missing'),{code:'browser_missing'});}}
  const page=await browser.newPage({locale:target.source==='agoda'?'vi-VN':'en-US',viewport:{width:1440,height:1000},deviceScaleFactor:2});page.setDefaultTimeout(15000);
  await page.goto(targetURL(target),{waitUntil:'domcontentloaded',timeout:45000});
  if(new URL(page.url()).hostname!==new URL(target.source_url).hostname)throw new Error('Unexpected redirect');
  await page.locator('body').waitFor();
  await page.waitForFunction(()=>/Điểm số qua Agoda|verified reviews|Traveloka\s*\(\d|Access is temporarily restricted|You have been blocked/i.test(document.body?.innerText||'')||Array.from(document.querySelectorAll('iframe')).some(f=>/captcha-delivery|recaptcha|hcaptcha/i.test(f.src)),undefined,{timeout:20000}).catch(()=>{});
  // Detect challenge iframes as well as visible text; never attempt to solve one.
  if(blocked(await page.locator('body').innerText())||page.frames().some(f=>/captcha-delivery|recaptcha|hcaptcha/i.test(f.url()))){const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence');await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,target.source+'-'+target.property_id+'-blocked.png')}).catch(()=>{});const error=Object.assign(new Error('blocked'),{code:'blocked'});failures.set(key,error);throw error;}
  opened.set(key,page);return page;
 }
 async function agodaRegion(page,target){
  if(!await page.locator(`a[href*="selectedproperty=${target.property_id}"]`).count())throw Object.assign(new Error('Agoda property identity not confirmed'),{code:'invalid_data'});
  const calendar=page.getByRole('dialog',{name:'Bộ chọn ngày nhận phòng',exact:true});if(await calendar.isVisible().catch(()=>false))await page.locator('#check-in-box').click();
  const heading=page.getByRole('heading',{name:/Bài đánh giá.*từ khách thật/});await heading.scrollIntoViewIfNeeded();
  const region=page.locator('.Review-reviewBranding').filter({hasText:/Dựa trên.*bài đánh giá/}).first();
  await region.waitFor({state:'visible',timeout:20000});
  // Keep the card next to Agoda's verification label; mixed-source overview counts are excluded.
  await page.getByText('Đánh giá từ khách hàng đã xác thực trên',{exact:true}).waitFor({state:'visible'});
  return region;
 }
 async function domImpl(target){
  const page=await pageFor(target);let reviews=[];
  if(target.source==='agoda'){
   const calendar=page.getByRole('dialog',{name:'Bộ chọn ngày nhận phòng',exact:true});if(await calendar.isVisible().catch(()=>false))await page.locator('#check-in-box').click();
   await page.getByRole('heading',{name:/Bài đánh giá.*từ khách thật/}).scrollIntoViewIfNeeded();
   await page.getByRole('heading',{name:/Bài đánh giá.*từ khách thật/}).waitFor();
   if(!await page.locator(`a[href*="selectedproperty=${target.property_id}"]`).count())throw Object.assign(new Error('Agoda property identity not confirmed'),{code:'invalid_data'});
   const summary=parseAgodaCard(await (await agodaRegion(page,target)).innerText());
   const capturedAt=await capture(target,await agodaRegion(page,target),summary);
   try{
   const source=page.getByRole('combobox',{name:'Nguồn',exact:true});await source.locator('option').first().waitFor({state:'attached'});const option=await source.locator('option').allTextContents();const label=option.find(t=>/Agoda/i.test(t)&&! /Booking/i.test(t));if(!label)throw new Error('Agoda source missing');await source.selectOption({label});
   await page.getByRole('combobox',{name:'Sắp xếp theo',exact:true}).selectOption({label:'Gần đây nhất'});
   await page.locator('[data-review-comment-type="comment"]').first().waitFor();
   reviews=await page.locator('[data-review-comment-type="comment"]').evaluateAll(els=>els.slice(0,10).map(el=>{const date=el.querySelector('.Review-comment-bubble .Review-statusBar-left')?.textContent.match(/(\d+) tháng (\d+) (\d{4})/);return {reviewId:el.getAttribute('data-review-id'),rating:Number(el.querySelector('.Review-comment-left p span')?.textContent.replace(',','.')),author:el.querySelector('[data-info-type="reviewer-name"] strong')?.textContent,title:el.querySelector('[data-testid="review-title"]')?.textContent,content:el.querySelector('[data-testid="review-comment"]')?.textContent||'',reviewedAt:date?`${date[3]}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`:'',response:el.querySelector('.Review-response-text')?.textContent};}));
   }catch{reviews=[];}
   return {summary,reviews,capturedAt};
  }
  if(target.source==='trip'){
   await page.locator('#outerReviewList').waitFor();
   const summary=parseSummary('trip',await page.locator('#outerReviewList').innerText());
   const capturedAt=await capture(target,page.locator('#outerReviewList'),summary);
   try{
    // Click the visible section heading to dismiss the date picker before opening reviews.
    await page.getByRole('heading',{name:'Guest Reviews',exact:true}).click();
    await page.locator('#review-swiper-show-more-button').click();
    await page.getByText('Sort by: Most relevant',{exact:true}).click();
    await page.getByText('Most Recent',{exact:true}).click();
    await page.locator('.yRvZgc0SICPUbmdb2L2a').first().waitFor();
    reviews=await page.locator('.yRvZgc0SICPUbmdb2L2a').evaluateAll(els=>els.slice(0,10).map(el=>{const meta=JSON.parse(el.getAttribute('data-exposure')||'{}').data||{};const text=el.querySelector('.LPPTO8g2RH0Fk19jYMOQ')?.textContent;const d=new Date(text?.replace(/^Posted /,''));return {reviewId:String(meta.writingid||''),author:meta.nickname,rating:Number(el.querySelector('strong.xt_R_A70sdDRsOgExJWw')?.textContent),reviewedAt:isNaN(d)?'':d.toISOString().slice(0,10),content:el.querySelector('.UXjSnokalMIS5CzMtLSM')?.textContent||'',response:el.querySelector('.U_MFvurgi0vTUfXouQJj span:last-child')?.textContent,translation:el.querySelector('._gVdvg3_po_vN5u4WCvV')?.textContent};}));
   }catch{reviews=[];} // Modal failures don't invalidate an independently read summary.
   return {summary,reviews,capturedAt};
  }
  const text=target.source==='trip'?await page.locator('#outerReviewList').innerText():await page.locator('body').innerText();
  return {summary:parseSummary(target.source,text),reviews};
 }
 async function dom(target){try{return await domImpl(target);}catch(error){const page=opened.get(target.source+':'+target.property_id);if(page){const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence');await mkdir(dir,{recursive:true});await writeFile(resolve(dir,target.source+'-diagnostic.json'),JSON.stringify({reason:String(error.message).slice(0,1500),title:await page.title(),text:(await page.locator('body').innerText()).slice(0,6000)}));await page.screenshot({path:resolve(dir,target.source+'-diagnostic.png')}).catch(()=>{});}throw error;}}
 async function ocr(target){
  const page=await pageFor(target);if(blocked(await page.locator('body').innerText()))throw Object.assign(new Error('blocked'),{code:'blocked'});
  const region=target.source==='trip'?page.locator('#outerReviewList'):target.source==='agoda'?await agodaRegion(page,target):null;
  // No verified Traveloka image region yet: do not OCR a booking-price panel.
  if(!region||!await region.count())throw Object.assign(new Error('No verified OCR region'),{code:'unconfigured'});
  const bytes=await region.screenshot();const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence');await mkdir(dir,{recursive:true});
  const base=target.source+'-'+target.property_id+'-'+Date.now();await writeFile(resolve(dir,base+'.png'),bytes);
  const engine=await createWorker(target.source==='agoda'?'vie+eng':'eng');let data;
  try{
   if(target.source==='agoda'){
    const score=await region.getByText(/^\d{1,2}(?:[.,]\d{1,2})?$/).first().screenshot();
    const count=await region.getByText(/Dựa trên.*bài đánh giá/).first().screenshot();
    await writeFile(resolve(dir,base+'-rating.png'),score);await writeFile(resolve(dir,base+'-count.png'),count);
    await engine.setParameters({tessedit_pageseg_mode:'10',tessedit_char_whitelist:'0123456789'});
    const prepared=darkDigitsOnWhite(score);await writeFile(resolve(dir,base+'-rating-ocr.png'),prepared);
    const pieces=[],confidences=[];
    for(const glyph of ratingGlyphs(score)){if(glyph.decimal){pieces.push('.');continue;}const digit=(await engine.recognize(glyph.bytes)).data;if(!/^\d$/.test(digit.text.trim()))throw Object.assign(new Error('Ambiguous rating digit'),{code:'invalid_data'});pieces.push(digit.text.trim());confidences.push(digit.confidence);}
    const scoreData={text:pieces.join(''),confidence:Math.min(...confidences)};
    await engine.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
    const countData=(await engine.recognize(count)).data;
    data={text:scoreData.text.trim()+'\n'+countData.text.trim(),confidence:Math.min(scoreData.confidence,countData.confidence)};
   }else{await engine.setParameters({tessedit_pageseg_mode:'6'});({data}=await engine.recognize(bytes));}
  }finally{await engine.terminate();}
  // Save candidates, never publish OCR values without independent corroboration.
  await writeFile(resolve(dir,base+'.json'),JSON.stringify({confidence:data.confidence,text:data.text}));
  const parse=target.source==='agoda'?parseAgodaCard:text=>parseSummary(target.source,text);
  let candidate;try{candidate=parse(data.text);}catch{throw Object.assign(new Error('OCR requires review'),{code:'invalid_data'});}
  const text=await region.innerText();let confirmed;try{confirmed=parse(text);}catch{throw Object.assign(new Error('OCR is uncorroborated'),{code:'invalid_data'});}
  if(data.confidence<90||candidate.rating!==confirmed.rating||candidate.count!==confirmed.count)throw Object.assign(new Error('OCR disagrees'),{code:'invalid_data'});
  await writeFile(resolve(dir,base+'.json'),JSON.stringify({confidence:data.confidence,text:data.text,summary:candidate,confirmed,propertyId:target.property_id,source:target.source,corroborated:true,capturedAt:new Date().toISOString()},null,2));
  const capturedAt=await capture(target,region,candidate,'ocr',bytes);
  return {summary:candidate,reviews:[],corroborated:true,capturedAt};
 }
 return {dom,ocr,evidence:target=>evidence.get(target.source+':'+target.property_id),close:async()=>{await browser?.close();opened.clear();evidence.clear();}};
}
