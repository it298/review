import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {publicSourceIdentity} from '../../backend/src/public-summary-validation.js';
import {validateBookingSummary} from '../../backend/src/booking-summary-validation.js';
const homePath='/hotel/hoteladmin/extranet_ng/manage/home.html';
const reviewPath='/hotel/hoteladmin/extranet_ng/manage/reviews.html';
const fail=(code='invalid_data')=>Object.assign(new Error('Booking Extranet refresh could not be verified; keeping previous values.'),{code});
export const bookingProfile=()=>fileURLToPath(new URL('../extranet-profiles/booking/',import.meta.url));
export function bookingPageMatches(value,path,id){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='admin.booking.com'&&!u.port&&!u.username&&!u.password&&!u.hash&&u.pathname===path&&u.searchParams.getAll('hotel_id').length===1&&u.searchParams.get('hotel_id')===id&&[...u.searchParams.keys()].every(k=>['hotel_id','lang','ses','mobile_extranet','t'].includes(k));}catch{return false;}
}
export function bookingPublicToken(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.booking.com'||u.port||u.username||u.password)return null;return u.pathname.match(/^\/hotel\/([a-z]{2})\/([a-z0-9-]+)(?:\.[a-z-]+)?\.html$/)?.slice(1).join('/')||null;}catch{return null;}
}
export function parseBookingCard(text){
 // Only the verified overall card, never individual reviews or category scores.
 const m=String(text).trim().match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s*\n\s*(?:Điểm đánh giá của Quý vị|Your review score)\s*\n\s*(?:dựa trên|based on)\s+(\d+|\d{1,3}(?:[., ]\d{3})+)\s+(?:đánh giá|reviews?)$/i);
 if(!m)throw fail();const rating=Number(m[1].replace(',','.')),reviewCount=Number(m[2].replace(/[., ]/g,''));
 if(!Number.isFinite(rating)||rating<0||rating>10||!Number.isSafeInteger(reviewCount)||reviewCount<0)throw fail();
 return {rating,reviewCount};
}
export function configuredBookingTargets(targets,ids){
 const selected=String(ids||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!selected.length||selected.some(id=>!/^\d{1,30}$/.test(id)))throw fail('unconfigured');
 const unique=[...new Set(selected)],chosen=targets.filter(t=>t.source==='booking'&&unique.includes(t.extranet_property_id));
 if(chosen.length!==unique.length)throw fail('unconfigured');return chosen;
}
export async function readBookingSummary(page,target,{timeout=30000}={}){
 if(target?.source!=='booking'||!/^\d{1,30}$/.test(target.extranet_property_id))throw fail();
 const expected=publicSourceIdentity('booking',target.source_url);if(!expected)throw fail();
 // Let the portal issue normal signed-in requests. Never export/replay auth headers.
 await page.route('https://admin.booking.com/**',route=>route.fallback());
 const initial=await page.goto('https://admin.booking.com/',{waitUntil:'domcontentloaded',timeout});
 const u=new URL(page.url());
 if(u.hostname==='account.booking.com'||/login|signin/i.test(u.pathname)||initial?.status()===401||initial?.status()===403)throw fail('login_required');
 const current=u.searchParams.get('hotel_id');
 if(!/^\d{1,30}$/.test(current||'')||!bookingPageMatches(u.href,homePath,current))throw fail();
 if(current!==target.extranet_property_id){
  u.searchParams.set('hotel_id',target.extranet_property_id);
  await page.goto(u.href,{waitUntil:'domcontentloaded',timeout});
 }
 if(!bookingPageMatches(page.url(),homePath,target.extranet_property_id))throw fail();
 const property=page.getByRole('button',{name:new RegExp('\\b'+target.extranet_property_id+'\\s*$')});
 await property.waitFor({state:'visible',timeout});
 const links=page.locator('a[href*="www.booking.com/hotel/"]');await links.first().waitFor({state:'attached',timeout});
 const publicUrls=await links.evaluateAll(ns=>ns.map(n=>n.href));
 const tokens=[...new Set(publicUrls.map(bookingPublicToken).filter(Boolean))];
 if(tokens.length!==1||tokens[0]!==expected)throw fail();
 const reviews=page.locator('a[href*="/hotel/hoteladmin/extranet_ng/manage/reviews.html"]').first();
 await reviews.waitFor({state:'attached',timeout});
 const reviewsUrl=new URL(await reviews.getAttribute('href'),page.url()).href;
 if(!bookingPageMatches(reviewsUrl,reviewPath,target.extranet_property_id))throw fail();
 await page.goto(reviewsUrl,{waitUntil:'domcontentloaded',timeout});
 if(!bookingPageMatches(page.url(),reviewPath,target.extranet_property_id))throw fail('login_required');
 const card=page.locator('.overall-review-score');await card.waitFor({state:'visible',timeout});
 if(await card.count()!==1)throw fail();
 const summary=parseBookingCard(await card.innerText());
 const capturedAt=new Date().toISOString();
 const payload=validateBookingSummary({entityKey:target.entity_key,source:'booking',method:'dom',extranetPropertyId:target.extranet_property_id,status:'success',sourceUrl:target.source_url,...summary,capturedAt});
 // Photograph only the summary card, excluding guests, bookings and portal URLs.
 const evidenceBytes=await card.screenshot();
 return {payload,evidenceBytes};
}
export async function runBookingSummaries({request,targets,dryRun=false}){
 if(!targets.length)return [];
 await mkdir(bookingProfile(),{recursive:true});
 const context=await chromium.launchPersistentContext(bookingProfile(),{channel:'chromium',headless:false,locale:'vi-VN',serviceWorkers:'block',viewport:{width:1440,height:1000}});
 const results=[];
 try{for(const target of targets){
  const page=await context.newPage();
  try{
   const {payload,evidenceBytes}=await readBookingSummary(page,target);
   const dir=resolve(process.env.OTA_EVIDENCE_DIR||fileURLToPath(new URL('../evidence/',import.meta.url)),'booking');await mkdir(dir,{recursive:true});
   const stem=resolve(dir,'booking-extranet-'+target.extranet_property_id+'-'+Date.now());
   await writeFile(stem+'.json',JSON.stringify({...payload,dryRun},null,2));await writeFile(stem+'.png',evidenceBytes);
   const outcome=dryRun?{status:'dry-run'}:await request('/api/booking/worker/results',payload);
   if(!['success','stale','dry-run'].includes(outcome?.status))throw fail('network');
   results.push({...payload,status:outcome.status});
   console.log(JSON.stringify({source:'booking-extranet',entityKey:target.entity_key,extranetPropertyId:target.extranet_property_id,rating:payload.rating,reviewCount:payload.reviewCount,capturedAt:payload.capturedAt,status:outcome.status,saved:outcome.status==='success'}));
  }catch(error){
   console.error('Booking Extranet refresh failed; previous values are preserved.');
   const payload=validateBookingSummary({entityKey:target.entity_key,source:'booking',method:'dom',extranetPropertyId:target.extranet_property_id,status:'failed',error:error.code||'network'});
   if(!dryRun)await request('/api/booking/worker/results',payload);
   results.push({...payload,dryRun});
  }finally{await page.close();}
 }}finally{await context.close();}
 return results;
}
