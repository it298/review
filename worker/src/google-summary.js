import {chromium} from 'playwright';
import {createWorker} from 'tesseract.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateGoogleSummary} from '../../backend/src/google-summary-validation.js';
export function googleTargetUrl(value){const u=new URL(value);if(u.protocol!=='https:'||!['www.google.com','maps.google.com','maps.app.goo.gl'].includes(u.hostname)||u.username||u.password||u.port)throw new Error('Invalid Google Maps URL');if(u.hostname==='www.google.com'&&!u.pathname.startsWith('/maps'))throw new Error('Not a Maps URL');return u.href;}
export function googlePlaceToken(value){return [...decodeURIComponent(value).matchAll(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/gi)].at(-1)?.[1]||null;}
export function googleHeaderNumbers(header){
 const star=[...new Set(header.starLabels)].map(s=>s.match(/^([0-5](?:[.,]\d+)?)\s*(?:stars|sao)\s*$/i)).filter(Boolean);
 const count=[...new Set(header.countLabels)].map(s=>s.match(/^\s*([\d.,]+)\s*(?:reviews|bài đánh giá|đánh giá)\s*$/i)).filter(Boolean);
 if(star.length>1||count.length>1)throw new Error('Ambiguous Google summary');
 return {rating:star[0]?Number(star[0][1].replace(',','.')):null,reviewCount:count[0]?Number(count[0][1].replace(/[.,]/g,'')):null};
}
export async function runGoogleSummaries({request,dryRun=false,entityKey}){
 let targets=dryRun?(await import('../../data/company-directory.json',{with:{type:'json'}})).default.flatMap(e=>e.sources.filter(s=>s.source==='google'&&!s.warning).map(s=>({entity_key:e.key,name:e.name,source_url:s.url}))):await request('/api/google/worker/targets');
 if(entityKey)targets=targets.filter(t=>t.entity_key===entityKey);if(!targets.length)throw new Error('No Google targets');
 const profile=process.env.GOOGLE_MAPS_PROFILE_DIR;
 const headless=process.env.GOOGLE_MAPS_HEADLESS==='true';
 const context=profile?await chromium.launchPersistentContext(resolve(profile),{headless,channel:'chromium',locale:'vi-VN',viewport:{width:1440,height:1000},deviceScaleFactor:2}):null;
 const browser=context?null:await chromium.launch({headless,channel:'chromium'});let engine;
 try{for(const target of targets){
  const page=context?await context.newPage():await browser.newPage({locale:'en-US',viewport:{width:1440,height:1000},deviceScaleFactor:2});let payload;
  try{
   const sourceUrl=googleTargetUrl(target.source_url);await page.goto(sourceUrl,{waitUntil:'domcontentloaded',timeout:45000});
   googleTargetUrl(page.url());
   const heading=page.getByRole('heading',{level:1}).first();await heading.waitFor({timeout:20000});
   const token=googlePlaceToken(page.url()),expected=target.resolved_place_token||googlePlaceToken(sourceUrl);
   if(!token||(expected&&expected!==token))throw new Error('Google place identity changed');
   const region=heading.locator('xpath=../..');
   await region.getByRole('img',{name:/stars|sao/i}).first().waitFor({timeout:12000}).catch(()=>{});
   const header=await region.evaluate(el=>({name:el.querySelector('h1')?.textContent,starLabels:[...el.querySelectorAll('[role="img"][aria-label]')].map(e=>e.getAttribute('aria-label').trim()),countLabels:[...el.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label').trim()),text:el.innerText}));
   const summary=googleHeaderNumbers(header);if(summary.rating===null&&summary.reviewCount===null)throw new Error('No verified Google summary');
   const dir=resolve(process.env.OTA_EVIDENCE_DIR||'evidence');await mkdir(dir,{recursive:true});const base='google-'+target.entity_key+'-'+Date.now();const bytes=await region.screenshot();await writeFile(resolve(dir,base+'.png'),bytes);
   if(!engine){engine=await createWorker('eng');await engine.setParameters({tessedit_pageseg_mode:'6'});}
   const ocr=(await engine.recognize(bytes)).data;
   const ratingText=ocr.text.match(/(?:^|\n)\s*([0-5][.,]\d{1,2})\s*(?:\n|$)/),countText=ocr.text.match(/([\d.,]+)\s+reviews\b/i);
   const imageRating=ratingText?Number(ratingText[1].replace(',','.')):null,imageCount=countText?Number(countText[1].replace(/[.,]/g,'')):null;
   const agreed=ocr.confidence>=90&&(summary.rating===null||imageRating===summary.rating)&&(summary.reviewCount===null||imageCount===summary.reviewCount);
   payload=validateGoogleSummary({entityKey:target.entity_key,status:'success',method:agreed?'ocr':'dom',rating:summary.rating,reviewCount:summary.reviewCount,capturedAt:new Date().toISOString(),placeToken:token,corroborated:agreed});
   await writeFile(resolve(dir,base+'.json'),JSON.stringify({name:header.name,...payload,ocr:{confidence:ocr.confidence,text:ocr.text},limitedView:summary.reviewCount===null},null,2));
  }catch(e){payload={entityKey:target.entity_key,method:'dom',status:'failed',error:/captcha|blocked|restricted/i.test(e.message)?'blocked':'invalid_data'};}
  finally{await page.close();}
  if(!dryRun)await request('/api/google/worker/results',payload);
  console.log(JSON.stringify({source:'google',...payload,dryRun}));
 }}finally{await engine?.terminate();await context?.close();await browser?.close();}
}
