import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
const profile=resolve(process.env.GOOGLE_MAPS_PROFILE_DIR||'google-profile');await mkdir(profile,{recursive:true});
const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,locale:'vi-VN'});
const page=context.pages()[0]||await context.newPage();await page.goto('https://maps.app.goo.gl/ELYMKKMUVUt72Uun9');
console.log('Sign in to Google in this separate browser, then close its window. Login details are not printed or copied.');
await Promise.race([new Promise(resolve=>context.once('close',resolve)),new Promise(resolve=>page.once('close',resolve)),new Promise(resolve=>process.once('SIGINT',resolve))]);
await context.close().catch(()=>{});
