import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=JSON.parse(await readFile(new URL('../../data/company-directory.json',import.meta.url),'utf8'));
const filter=process.argv.find(s=>s.startsWith('--source='))?.slice(9);
const targets=directory.flatMap(e=>e.sources.filter(s=>s.source!=='google'&&(!filter||s.source===filter)).map(s=>({...s,entityKey:e.key,name:e.name})));
const out=resolve(process.env.OTA_EVIDENCE_DIR||'evidence','source-audit');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,channel:'chromium'});const results=[];
try{
 let cursor=0;
 await Promise.all([0,1].map(async()=>{while(cursor<targets.length){const t=targets[cursor++];const page=await browser.newPage({locale:'en-US',viewport:{width:1440,height:1000}});let r={entityKey:t.entityKey,name:t.name,source:t.source,url:t.url,warning:t.warning};
 try{
  if(t.warning){r.status='link_needs_confirmation';continue;}
  const response=await page.goto(t.url,{waitUntil:'domcontentloaded',timeout:35000});
  await page.locator('body').waitFor();await page.waitForTimeout(2500);
  r={...r,httpStatus:response?.status(),finalUrl:page.url(),title:await page.title(),capturedAt:new Date().toISOString(),...await page.evaluate(()=>({text:document.body.innerText.slice(0,36000),jsonld:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>e.textContent),labels:[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label')).filter(s=>/rating|review|bubble|đánh giá|sao/i.test(s)).slice(0,150)}))};
  r.status=/captcha|verify you are human|access denied|you have been blocked|access is temporarily restricted|Checking your browser/i.test(r.text)||page.frames().some(f=>/captcha-delivery|recaptcha|hcaptcha/i.test(f.url()))?'blocked':'opened';
  await page.screenshot({path:resolve(out,t.source+'-'+t.entityKey+'.png')});r.screenshot=true;
 }catch(e){r.status='network';r.error=e.message.slice(0,300);await page.screenshot({path:resolve(out,t.source+'-'+t.entityKey+'.png')}).catch(()=>{});}
 finally{await page.close();results.push(r);await writeFile(resolve(out,t.source+'-'+t.entityKey+'.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({source:r.source,entityKey:r.entityKey,status:r.status,screenshot:r.screenshot,httpStatus:r.httpStatus}));}
 }}));
}finally{await browser.close();await writeFile(resolve(out,'audit.json'),JSON.stringify(results,null,2));}
