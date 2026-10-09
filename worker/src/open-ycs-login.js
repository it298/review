import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';

// A separate local profile, independent of Google Maps and the user's Chrome.
const profile=process.env.AGODA_YCS_PROFILE_DIR
 ?resolve(process.env.AGODA_YCS_PROFILE_DIR)
 :fileURLToPath(new URL('../ycs-profile/',import.meta.url));
await mkdir(profile,{recursive:true});
let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,locale:'vi-VN',viewport:{width:1440,height:1000}});
 const page=context.pages()[0]||await context.newPage();
 await page.goto('https://portal.agoda.com/',{waitUntil:'domcontentloaded',timeout:60000});
 console.log('Cua so Agoda YCS da mo. Tu dang nhap tai khoan va OTP trong trinh duyet.');
 console.log('Chon khach san > Hieu suat (Performance) > Reviews. Sau do dong cua so trinh duyet nay.');
 console.log('Phien chi luu tren may nay, khong gui cookie, mat khau hay token len StayScope.');
 console.log('Buoc nay chi chuan bi dang nhap; chua bat dong bo JSON tu dong.');
 let stop;
 await new Promise(done=>{
  stop=done;
  context.once('close',done);
  process.once('SIGINT',done);
 });
 process.off('SIGINT',stop);
}catch{
 console.error('Khong mo duoc YCS. Kiem tra mang va Chromium; neu dang co cua so YCS worker, dong cua so do roi thu lai.');
 process.exitCode=1;
}finally{
 await context?.close().catch(()=>{});
 if(!process.exitCode)console.log('Da dong trinh duyet. Profile YCS duoc giu tren may; can kiem tra phien dang nhap o buoc doc JSON.');
}
