import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';

// Only official partner portals. Each OTA has an independent local session.
const portals={
 traveloka:{name:'Traveloka TERA',url:'https://tera.traveloka.com/v2/login/'},
 tripadvisor:{name:'Tripadvisor Management Center',url:'https://www.tripadvisor.com.vn/Owners'},
 booking:{name:'Booking.com Extranet',url:'https://admin.booking.com/'},
 trip:{name:'Trip.com eBooking',url:'https://ebooking.trip.com/'},
 ctrip:{name:'Ctrip eBooking',url:'https://ebooking.ctrip.com/'},
 expedia:{name:'Expedia Partner Central',url:'https://www.expediapartnercentral.com/'},
};
const source=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9);
const portal=portals[source];
if(!portal)throw new Error('Choose --source=traveloka, tripadvisor, booking, trip, ctrip or expedia.');
const channel=process.argv.find(arg=>arg.startsWith('--browser='))?.slice(10)||'chromium';
if(!['chromium','chrome'].includes(channel))throw new Error('Choose --browser=chromium or chrome.');
const profile=fileURLToPath(new URL('../extranet-profiles/'+source+'/',import.meta.url));
await mkdir(profile,{recursive:true});
let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel,headless:false,locale:'vi-VN',viewport:{width:1440,height:1000}});
 const page=context.pages()[0]||await context.newPage();
 // Keep the interactive window open even if this portal loads slowly.
 await page.goto(portal.url,{waitUntil:'commit',timeout:30000}).catch(()=>console.log('Trang dang tai; ban co the mo lai portal trong cua so nay.'));
 console.log(portal.name+': tu dang nhap tai khoan va OTP trong cua so trinh duyet.');
 console.log('Chon khach san can thu, mo trang danh gia / Reviews, sau do dong cua so nay.');
 console.log('Profile rieng chi luu tren may, khong sao chep cookie, mat khau hay token len StayScope.');
 console.log('Buoc nay luu phien rieng. Dong cua so sau khi dang nhap de worker su dung profile.');
 let stop;
 await new Promise(done=>{stop=done;context.once('close',done);process.once('SIGINT',done);});
 process.off('SIGINT',stop);
}catch{
 console.error('Khong mo duoc '+portal.name+'. Kiem tra mang, Chromium va dong cua so worker cung nen tang neu dang mo.');
 process.exitCode=1;
}finally{
 await context?.close().catch(()=>{});
 if(!process.exitCode)console.log('Da dong trinh duyet. Profile duoc giu lai; can kiem tra phien va JSON truoc khi dong bo.');
}
