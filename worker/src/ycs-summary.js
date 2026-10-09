import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateOtaResult} from '../../backend/src/ota-validation.js';

const fail=(message,code='invalid_data')=>Object.assign(new Error(message),{code});
export const ycsProfile=()=>process.env.AGODA_YCS_PROFILE_DIR?resolve(process.env.AGODA_YCS_PROFILE_DIR):fileURLToPath(new URL('../ycs-profile/',import.meta.url));

export function ycsRoutes(propertyId){
 if(typeof propertyId!=='string'||!/^\d{1,30}$/.test(propertyId))throw fail('Invalid YCS property ID.');
 const prefix='/mldc/en-us';
 return {page:'https://portal.agoda.com'+prefix+'/app/setting/review/'+propertyId,score:prefix+'/api/setting/Review/score/'+propertyId,metadata:prefix+'/api/setting/Review/'+propertyId};
}

export function exactYcsResponse(value,path){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='portal.agoda.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname===path;}catch{return false;}
}

// Verified 2026-10-09 in the signed-in YCS Reviews page. Never infer total from
// searchreviews/reviews.length, filtered counts, subcategory scores or guest data.
export function parseYcsJson(score,metadata,target,{scoreUrl,metadataUrl,capturedAt}={}){
 const routes=ycsRoutes(target?.property_id);
 if(target.source!=='agoda'||!exactYcsResponse(scoreUrl,routes.score)||!exactYcsResponse(metadataUrl,routes.metadata))throw fail('YCS response property does not match the selected registered target.');
 const group=score?.group;
 if(!group||typeof group.score!=='number'||!Number.isFinite(group.score)||group.maxScore!==10||group.score<0||group.score>10||!Number.isSafeInteger(group.reviewCount)||group.reviewCount<0)throw fail('YCS overall summary schema is missing or invalid. Previous data is preserved.');
 if(typeof metadata?.propertyName!=='string'||!metadata.propertyName.trim()||metadata.propertyName.length>200)throw fail('YCS property metadata is missing.');
 const payload=validateOtaResult({source:'agoda',propertyId:target.property_id,method:'api',status:'success',capturedAt,summary:{rating:group.score,ratingMax:10,count:group.reviewCount},reviews:[]});
 return {payload,propertyName:metadata.propertyName.trim()};
}

export function configuredYcsTargets(targets,ids){
 const values=String(ids||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(!values.length||values.some(id=>!/^\d{1,30}$/.test(id)))throw fail('Set AGODA_YCS_PROPERTY_IDS to the registered Agoda IDs you can manage.','unconfigured');
 const unique=[...new Set(values)],chosen=targets.filter(t=>t.source==='agoda'&&unique.includes(t.property_id));
 if(chosen.length!==unique.length)throw fail('A configured YCS property is not enabled in StayScope.','unconfigured');
 return chosen;
}

export async function readYcsJson(page,target,{timeout=30000}={}){
 const routes=ycsRoutes(target.property_id);
 let resolve,reject,timer,score,metadata,scoreUrl,metadataUrl,capturedAt;
 const completed=new Promise((yes,no)=>{resolve=yes;reject=no;});completed.catch(()=>{});
 const observe=async response=>{
  const kind=exactYcsResponse(response.url(),routes.score)?'score':exactYcsResponse(response.url(),routes.metadata)?'metadata':null;
  if(!kind)return;
  try{
   if(response.status()===401||response.status()===403)throw fail('YCS requires you to sign in again or check property access.','login_required');
   if(!response.ok()||response.fromServiceWorker()||!response.headers()['content-type']?.includes('json'))throw fail('YCS did not return a fresh JSON summary.');
   const body=await response.json();
   if(kind==='score'){score=body;scoreUrl=response.url();capturedAt=new Date().toISOString();}
   else{metadata=body;metadataUrl=response.url();}
   if(score!==undefined&&metadata!==undefined)resolve(parseYcsJson(score,metadata,target,{scoreUrl,metadataUrl,capturedAt}));
  }catch(error){reject(error.code?error:fail('Could not read the YCS JSON response.'));}
 };
 page.on('response',observe);
 timer=setTimeout(()=>reject(fail('YCS summary did not arrive; session or page layout needs checking.','network')),timeout);
 try{
  // Routing disables HTTP cache in Playwright; the normal page still issues its
  // own authenticated requests. Cookies/tokens are never exported or replayed.
  await page.route('**/api/setting/Review/**',route=>route.fallback());
  await page.goto(routes.page,{waitUntil:'domcontentloaded',timeout});
  const current=new URL(page.url());
  if(current.origin!=='https://portal.agoda.com'||/\/public\/login|\/signin/.test(current.pathname))throw fail('YCS session expired. Run the YCS login helper again.','login_required');
  if(current.pathname!==new URL(routes.page).pathname)throw fail('YCS did not open the selected property Reviews page.');
  return await completed;
 }finally{clearTimeout(timer);page.off('response',observe);}
}

export async function runYcsSummaries({request,targets,dryRun=false,headless=false}){
 if(!targets.length)return [];
 await mkdir(ycsProfile(),{recursive:true});
 const context=await chromium.launchPersistentContext(ycsProfile(),{channel:'chromium',headless,locale:'en-US',viewport:{width:1440,height:1000}});
 const results=[];
 try{
  for(const target of targets){
   const page=await context.newPage();let payload,propertyName;
   try{
    ({payload,propertyName}=await readYcsJson(page,target));
    const dir=resolve(process.env.OTA_EVIDENCE_DIR||fileURLToPath(new URL('../evidence/',import.meta.url)),'ycs');await mkdir(dir,{recursive:true});
    await writeFile(resolve(dir,'agoda-ycs-'+target.property_id+'-'+Date.now()+'.json'),JSON.stringify({collectionContext:'agoda-ycs',propertyName,...payload,dryRun},null,2));
    if(!dryRun){
     const outcome=await request('/api/ota/worker/results',payload);
     if(outcome?.status==='stale'){
      results.push({propertyId:target.property_id,status:'stale',capturedAt:payload.capturedAt,dryRun});
      console.log(JSON.stringify({source:'agoda-ycs',propertyId:target.property_id,status:'stale',saved:false}));continue;
     }
     if(outcome?.status!=='success')throw fail('Backend did not confirm that the YCS summary was saved.','network');
    }
    results.push({propertyId:target.property_id,status:'success',summary:payload.summary,capturedAt:payload.capturedAt,dryRun});
    console.log(JSON.stringify({source:'agoda-ycs',propertyId:target.property_id,propertyName,status:'success',...payload.summary,capturedAt:payload.capturedAt,saved:!dryRun}));
   }catch(error){
    if(error.code==='login_required')console.error('YCS: sign in again with src/open-ycs-login.js, then restart the worker.');
    else console.error('YCS refresh failed; previous values are preserved.');
    // A failed refresh records only a generic source status, never auth details.
    const failed={source:'agoda',propertyId:target.property_id,method:'api',status:'failed',error:error.code==='network'?'network':error.code==='login_required'?'unconfigured':'invalid_data'};
    if(!dryRun)await request('/api/ota/worker/results',failed);
    results.push({propertyId:target.property_id,status:'failed',error:error.code||'invalid_data',dryRun});
   }finally{await page.close();}
  }
 }finally{await context.close();}
 return results;
}
