import {chromium} from 'playwright';
import {createWorker} from 'tesseract.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {publicSourceUrl,publicSourceIdentity,validatePublicSummary} from '../../backend/src/public-summary-validation.js';
import {parseAgodaCard,parseSummary} from './parse.js';
import {publishEvidence} from './evidence.js';
const number=s=>Number(String(s).replace(',','.')),count=s=>Number(String(s).replace(/[.,\s]/g,''));
export function skipBookingPublicTarget(target,enabled,ids){
 return enabled===true&&target.source==='booking'&&/^\d{1,30}$/.test(target.extranet_property_id||'')&&String(ids||'').split(',').map(s=>s.trim()).includes(target.extranet_property_id);
}
export function parsePublicCard(source,text){
 let m;
 if(source==='booking'){
  const rating=text.match(/^\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:\n|$)/),total=text.match(/(?:^|\n)\s*([\d.,]+)\s+(?:reviews|đánh giá)\s*(?:\n|$)/i);
  if(rating&&total)return {rating:number(rating[1]),reviewCount:count(total[1])};
 }
 if(source==='expedia')m=text.match(/([\d.,]+)\s+(?:out of|trên)\s+10[\s\S]{0,120}?(?:See all|Xem tất cả)\s+([\d.,]+)\s+(?:reviews|nhận xét)/i);
 if(source==='tripadvisor')m=text.match(/([\d.,]+)\s+(?:of|out of|trên)\s+5\s+(?:bubbles|bong bóng)[\s\S]{0,100}?\(?([\d.,]+)\s+(?:reviews|đánh giá)/i);
 if(m)return {rating:number(m[1]),reviewCount:count(m[2])};
 if(source==='shopee'){
  const total=text.match(/^\s*(\d[\d.,]*\+?)\s*(?:\n|\s)*đánh giá trên ShopeeFood/i);
  if(total)return {rating:null,reviewCount:total[1].endsWith('+')?null:count(total[1]),countDisplay:total[1].endsWith('+')?total[1].replace(/[.,]/g,''):null};
 }
 if(source==='agoda'){const s=/Điểm số qua Agoda/.test(text)?parseSummary('agoda',text):parseAgodaCard(text);return {rating:s.rating,reviewCount:s.count};}
 if(source==='trip'||source==='traveloka'){const s=parseSummary(source,text);return {rating:s.rating,reviewCount:s.count};}
 throw Object.assign(new Error('No verified public summary'),{code:'no_public_summary'});
}
function objects(raw){const result=[];function walk(o){if(!o||typeof o!=='object')return;if(Array.isArray(o)){o.forEach(walk);return;}result.push(o);if(o['@graph'])walk(o['@graph']);}for(const text of raw){try{walk(JSON.parse(text));}catch{}}return result;}
export function aggregateFor(source,raw,url){const token=publicSourceIdentity(source,url);const matches=objects(raw).filter(o=>o.aggregateRating&&(o.url?publicSourceIdentity(source,o.url)===token:source==='grab'&&o['@id']===token));if(matches.length!==1)return null;const r=matches[0].aggregateRating;return {name:matches[0].name,rating:number(r.ratingValue),reviewCount:r.reviewCount==null?r.ratingCount==null?null:count(r.ratingCount):count(r.reviewCount),countKind:r.reviewCount==null&&r.ratingCount!=null?'ratings':'reviews'};}
async function cardFor(page,source){
 if(source==='booking')return page.locator('[data-testid="review-score-right-component"], [data-testid="review-score-component"]').first();
 if(source==='expedia')return page.locator('[data-stid="content-hotel-reviewsummary"]').first();
 if(source==='shopee')return page.locator('.rating').first();
 if(source==='grab')return page.getByRole('heading',{level:1}).first().locator('xpath=../..');
 if(source==='agoda'){await page.getByRole('heading',{name:/Bài đánh giá.*từ khách thật/}).scrollIntoViewIfNeeded();return page.locator('.Review-reviewBranding').filter({hasText:/Dựa trên.*bài đánh giá/}).first();}
 if(source==='trip')return page.locator('#outerReviewList');
 if(source==='tripadvisor'){
  let el=page.getByText(/^[\d.,]+ (?:of|out of|trên) 5 (?:bubbles|bong bóng)$/i).first();
  for(let i=0;i<5;i++){if(!await el.count())break;const text=await el.innerText();if(text.length<900&&/\(?[\d.,]+\s+(?:reviews|đánh giá)\)?/i.test(text))return el;el=el.locator('xpath=..');}
 }
 if(source==='traveloka')return page.getByRole('heading',{level:1}).first().locator('xpath=../..');
 throw Object.assign(new Error('No verified image region'),{code:'no_public_summary'});
}
export async function runPublicSummaries({request,dryRun=false,sourceFilter,entityKey,excludeTargets=[]}){
 let targets=dryRun?JSON.parse(await readFile(new URL('../../data/company-directory.json',import.meta.url),'utf8')).flatMap(e=>e.sources.filter(s=>s.source!=='google'&&!s.warning&&(!['agoda','trip','traveloka'].includes(s.source)||e.relationship==='comparison')).map(s=>({...s,entity_key:e.key,name:e.name,source_url:s.url}))):await request('/api/public/worker/targets');
 if(sourceFilter)targets=targets.filter(t=>t.source===sourceFilter);if(entityKey)targets=targets.filter(t=>t.entity_key===entityKey);
 targets=targets.filter(t=>!excludeTargets.some(excluded=>excluded.source===t.source&&excluded.hotel_key===t.entity_key));
 // This guard also works while the Extranet endpoint is temporarily unavailable:
 // the existing target feed includes the verified mapping from the database.
 targets=targets.filter(t=>!skipBookingPublicTarget(t,process.env.BOOKING_EXTRANET_ENABLED==='true',process.env.BOOKING_EXTRANET_PROPERTY_IDS));
 if(!targets.length)return;
 const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence','public-summary');await mkdir(dir,{recursive:true});
 const browser=await chromium.launch({headless:false,channel:'chromium'});let engine;
 try{for(const target of targets){const page=await browser.newPage({locale:'vi-VN',viewport:{width:1440,height:1000},deviceScaleFactor:2});page.setDefaultTimeout(15000);const base=target.source+'-'+target.entity_key+'-'+Date.now();let payload,detail,evidenceBytes;
  try{
   publicSourceUrl(target.source,target.source_url);const response=await page.goto(target.source_url,{waitUntil:'domcontentloaded',timeout:40000});
   await page.locator('body').waitFor();
   if(response?.status()===403||response?.status()===429||page.frames().some(f=>/captcha-delivery|recaptcha|hcaptcha/i.test(f.url()))||/Access is temporarily restricted|verify you are human|you have been blocked|access denied/i.test(await page.locator('body').innerText()))throw Object.assign(new Error('Source blocked'),{code:'blocked'});
   await page.getByRole('heading',{level:1}).first().waitFor({timeout:12000}).catch(()=>{});
   const text=await page.locator('body').innerText();
   if(/\/(?:account\/signin|auth\/login)/.test(new URL(page.url()).pathname))throw Object.assign(new Error('Source requires login'),{code:'login_required'});
   if(target.source==='grab'&&/Scan to open in Grab App|Tải ứng dụng Grab để đặt xe/i.test(text))throw Object.assign(new Error('App required'),{code:'app_required'});
   if(!await page.getByRole('heading',{level:1}).count()&&target.source!=='trip')throw Object.assign(new Error('Selected property not visible'),{code:/Login to search location/.test(text)?'login_required':'no_public_summary'});
   const identity=publicSourceIdentity(target.source,page.url()),expected=publicSourceIdentity(target.source,target.source_url);
   if(!identity||!expected||identity!==expected||target.resolved_source_token&&target.resolved_source_token!==identity)throw Object.assign(new Error('Source identity mismatch'),{code:'invalid_data'});
   const region=await cardFor(page,target.source);await region.waitFor({state:'visible',timeout:12000});await region.scrollIntoViewIfNeeded();
   if(target.source==='agoda')await region.getByText(/^\d{1,2}(?:[.,]\d{1,2})?$/).first().waitFor({state:'visible',timeout:12000});
   const visible=await region.innerText(),raw=await page.locator('script[type="application/ld+json"]').allTextContents(),aggregate=['booking','tripadvisor','grab'].includes(target.source)?aggregateFor(target.source,raw,page.url()):null;
   let summary;
   if(target.source==='grab'){
    if(!aggregate||!visible.includes(aggregate.name)||!new RegExp('(?:^|\\n)'+String(aggregate.rating).replace('.','[.,]')+'(?:\\s|$)').test(visible))throw Object.assign(new Error('Grab summary mismatch'),{code:'no_public_summary'});
    summary=aggregate;
   }else{summary=parsePublicCard(target.source,visible);if(aggregate&&(summary.rating!==aggregate.rating||summary.reviewCount!==aggregate.reviewCount))throw Object.assign(new Error('Aggregate disagrees with visible card'),{code:'invalid_data'});}
   const bytes=await region.screenshot();await writeFile(resolve(dir,base+'.png'),bytes);
   let ocr=null,agreed=false;
   if(!engine){engine=await createWorker('vie+eng');await engine.setParameters({tessedit_pageseg_mode:'6'});}
   ocr=(await engine.recognize(bytes)).data;
   try{const image=parsePublicCard(target.source,ocr.text);agreed=ocr.confidence>=90&&image.rating===summary.rating&&image.reviewCount===summary.reviewCount&&(image.countDisplay||null)===(summary.countDisplay||null);}catch{}
   payload=validatePublicSummary({entityKey:target.entity_key,source:target.source,status:'success',method:agreed?'ocr':'dom',sourceUrl:target.source_url,resolvedUrl:page.url(),...summary,capturedAt:new Date().toISOString(),corroborated:agreed});
   evidenceBytes=bytes;
   detail={name:await page.getByRole('heading',{level:1}).first().innerText({timeout:1000}).catch(()=>page.title()),visible,aggregate,ocr:{text:ocr.text,confidence:ocr.confidence},payload};
  }catch(e){payload={entityKey:target.entity_key,source:target.source,status:'failed',method:'dom',error:e.code||(/Timeout|net::/.test(e.message)?'network':'invalid_data')};detail={error:e.message,payload,resolvedUrl:page.url(),cardText:await page.locator(target.source==='agoda'?'.Review-reviewBranding':target.source==='trip'?'#outerReviewList':'h1').first().innerText({timeout:1000}).catch(()=>null)};await page.screenshot({path:resolve(dir,base+'-failed.png')}).catch(()=>{});}
  finally{await page.close();}
  await writeFile(resolve(dir,base+'.json'),JSON.stringify(detail,null,2));
  if(!dryRun){await request('/api/public/worker/results',payload);await publishEvidence(request,payload,evidenceBytes);}
  console.log(JSON.stringify({source:target.source,entityKey:target.entity_key,status:payload.status,rating:payload.rating,reviewCount:payload.reviewCount,countDisplay:payload.countDisplay,method:payload.method,error:payload.error,dryRun}));
 }}finally{await engine?.terminate();await browser.close();}
}
