import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';

// Only official partner portals. Each OTA has an independent local session.
const portals={
 traveloka:{name:'Traveloka TERA',url:'https://tera.traveloka.com/v2/login/'},
 booking:{name:'Booking.com Extranet',url:'https://admin.booking.com/'},
 trip:{name:'Trip.com eBooking',url:'https://ebooking.trip.com/'},
 ctrip:{name:'Ctrip eBooking',url:'https://ebooking.ctrip.com/'},
 expedia:{name:'Expedia Partner Central',url:'https://www.expediapartnercentral.com/'},
};
const source=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9);
const portal=portals[source];
if(!portal)throw new Error('Choose --source=traveloka, booking, trip, ctrip or expedia.');
const profile=fileURLToPath(new URL('../extranet-profiles/'+source+'/',import.meta.url));
await mkdir(profile,{recursive:true});
let context;
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,locale:'vi-VN',viewport:{width:1440,height:1000}});
 const page=context.pages()[0]||await context.newPage();
 await page.goto(portal.url,{waitUntil:'domcontentloaded',timeout:60000});
 console.log(portal.name+': tu dang nhap tai khoan va OTP trong cua so trinh duyet.');
 console.log('Chon khach san can thu, mo trang danh gia / Reviews, sau do dong cua so nay.');
 console.log('Profile rieng chi luu tren may, khong sao chep cookie, mat khau hay token len StayScope.');
 console.log(source==='booking'?'Buoc nay chi luu phien. Bo doc Booking can backend moi va cau hinh BOOKING_EXTRANET_ENABLED de chay tu dong.':'Buoc nay chi chuan bi dang nhap. Bo doc JSON cua nen tang nay chua duoc bat.');
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
