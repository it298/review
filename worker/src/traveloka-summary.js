import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateExtranetSummary} from '../../backend/src/extranet-summary-validation.js';
import {readTravelokaReviews} from './traveloka-reviews.js';
const fail=code=>Object.assign(new Error('Traveloka summary could not be verified.'),{code:code||'invalid_data'});
export const travelokaProfile=()=>fileURLToPath(new URL('../extranet-profiles/traveloka/',import.meta.url));
const normalize=s=>String(s).normalize('NFC').replace(/\s+/g,' ').trim().toLocaleLowerCase('vi');
export function travelokaReviewPage(value){try{const u=new URL(value);return u.origin==='https://tera.traveloka.com'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/vi-vn/guest-review/';}catch{return false;}}
export function parseTravelokaOverall(text){
 const m=String(text).trim().match(/^Điểm số chung\s*\n\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*\n(?:[^\n\d]+\n)?\s*Dựa trên\s+(\d+|\d{1,3}(?:[., ]\d{3})+)\s+đánh giá\s*$/);
 if(!m)throw fail();const rating=Number(m[1].replace(',','.')),reviewCount=Number(m[2].replace(/[., ]/g,''));
 if(rating<0||rating>10||!Number.isFinite(rating)||!Number.isSafeInteger(reviewCount)||reviewCount<0)throw fail();return {rating,reviewCount};
}
export function configuredTravelokaTargets(targets,ids){
 const chosen=String(ids||'').split(',').map(v=>v.trim()).filter(Boolean),unique=[...new Set(chosen)];
 if(!unique.length||unique.some(id=>!/^\d{1,30}$/.test(id)))throw fail('unconfigured');
 const matched=targets.filter(t=>t.source==='traveloka'&&unique.includes(t.extranet_property_id));
 if(matched.length!==unique.length||matched.some(t=>!t.extranet_name))throw fail('unconfigured');return matched;
}
async function identity(page,target){
 const id=page.getByTestId('hotel-list-dropdown-active-id'),name=page.getByTestId('hotel-list-dropdown-active-name');
 await id.waitFor({state:'visible',timeout:30000});await name.waitFor({state:'visible',timeout:30000});
 const sameId=(await id.innerText()).trim()===target.extranet_property_id;
 if(sameId&&normalize(await name.innerText())!==normalize(target.extranet_name))throw fail();
 return sameId;
}
export async function readTravelokaSummary(page,target,{timeout=45000}={}){
 if(target.source!=='traveloka'||!/^\d{1,30}$/.test(target.extranet_property_id)||!target.extranet_name)throw fail();
 await page.route('https://tera.traveloka.com/**',route=>route.fallback());
 await page.goto('https://tera.traveloka.com/vi-vn/guest-review/',{waitUntil:'domcontentloaded',timeout});
 if(/\/login\/?/.test(new URL(page.url()).pathname))throw fail('login_required');
 if(!travelokaReviewPage(page.url()))throw fail();
 try{await page.getByTestId('hotel-list-dropdown-active-id').waitFor({state:'visible',timeout});}catch(error){if(/\/login\/?/.test(new URL(page.url()).pathname))throw fail('login_required');throw error;}
 if(!await identity(page,target)){
  const dropdown=page.getByTestId('hotel-list-dropdown');await dropdown.getByTestId('hotel-list-dropdown-select').click();
  const option=dropdown.getByText(target.extranet_property_id,{exact:true});await option.waitFor({state:'visible',timeout});
  if(await option.count()!==1)throw fail();
  const optionRow=option.locator('xpath=..');
  if(!normalize(await optionRow.innerText()).includes(normalize(target.extranet_name)))throw fail();
  await option.click();
  const confirmation=page.getByText(new RegExp('thay đổi phiên khách sạn thành '+target.extranet_name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await confirmation.waitFor({state:'visible',timeout});
  await Promise.all([page.waitForEvent('domcontentloaded',{timeout}),page.getByRole('button',{name:'Có',exact:true}).click()]);
  if(!travelokaReviewPage(page.url())||!await identity(page,target))throw fail();
 }
 const label=page.getByText('Điểm số chung',{exact:true});await label.waitFor({state:'visible',timeout});if(await label.count()!==1)throw fail();
 let card=label,summary;
 for(let depth=0;depth<6;depth++){
  const text=await card.innerText();
  if(text.length>1800)break;
  try{summary=parseTravelokaOverall(text);break;}catch{}
  card=card.locator('xpath=..');
 }
 if(!summary||!await identity(page,target)||!travelokaReviewPage(page.url()))throw fail();
 const payload=validateExtranetSummary({entityKey:target.entity_key,source:'traveloka',extranetPropertyId:target.extranet_property_id,method:'extranet-auto',sourceUrl:target.source_url,status:'success',...summary,capturedAt:new Date().toISOString()});
 return {payload,evidenceBytes:await card.screenshot()};
}
export async function runTravelokaSummaries({targets,request,dryRun=false}){
 await mkdir(travelokaProfile(),{recursive:true});
 const context=await chromium.launchPersistentContext(travelokaProfile(),{channel:'chromium',headless:process.env.TRAVELOKA_BROWSER_HEADLESS!=='false',locale:'vi-VN',serviceWorkers:'block',viewport:{width:1440,height:1000}}),results=[];
 try{for(const target of targets){const page=await context.newPage();try{
  const {payload,evidenceBytes}=await readTravelokaSummary(page,target);
  const dir=resolve(process.env.OTA_EVIDENCE_DIR||fileURLToPath(new URL('../evidence/',import.meta.url)),'traveloka-extranet');await mkdir(dir,{recursive:true});
  const stem=resolve(dir,target.extranet_property_id+'-'+Date.now());await writeFile(stem+'.json',JSON.stringify(payload,null,2));await writeFile(stem+'.png',evidenceBytes);
  const outcome=dryRun?{status:'dry-run'}:await request('/api/extranet/worker/results',payload);
  if(!['success','stale','dry-run'].includes(outcome.status))throw fail('network');
  const result={source:'traveloka-extranet',entityKey:target.entity_key,extranetPropertyId:target.extranet_property_id,rating:payload.rating,reviewCount:payload.reviewCount,capturedAt:payload.capturedAt,status:outcome.status,saved:outcome.status==='success'};
  results.push(result);console.log(JSON.stringify(result));
  // Individual review failure never invalidates a successfully saved summary.
  try{const batch=await readTravelokaReviews(page,target);const saved=dryRun?{status:'dry-run'}:await request('/api/reviews/worker/results',batch);console.log(JSON.stringify({worker:'traveloka-individual-reviews',entity:target.entity_key,reviews:batch.reviews.length,...saved}));}
  catch{console.error(JSON.stringify({worker:'traveloka-individual-reviews',entity:target.entity_key,status:'not_read'}));}
 }catch(error){const code=['login_required','invalid_data','network','blocked'].includes(error.code)?error.code:'network';
  console.error('Traveloka '+target.entity_key+': '+code+'; previous values preserved.');
  if(!dryRun)await request('/api/extranet/worker/results',validateExtranetSummary({entityKey:target.entity_key,source:'traveloka',extranetPropertyId:target.extranet_property_id,method:'extranet-auto',status:'failed',error:code}));
  results.push({entityKey:target.entity_key,status:'failed',error:code});
 }finally{await page.close();}}}finally{await context.close();}return results;
}
