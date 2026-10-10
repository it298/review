import {randomUUID} from 'node:crypto';
const scales={google:5,tripadvisor:5,agoda:10,booking:10,expedia:10,trip:10,traveloka:10,grab:5,shopee:5};
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
export function validateManualSummary(body,now=new Date()){
 if(!body||typeof body!=='object'||Array.isArray(body))invalid('Số liệu nhập không hợp lệ.');
 const {entityKey,source,rating,reviewCount,rankPosition,rankTotal,rankCategory,rankArea,note=''}=body;
 if(typeof entityKey!=='string'||!entityKey.trim()||entityKey.length>200||!Object.hasOwn(scales,source))invalid('Chọn địa điểm và nền tảng hợp lệ.');
 const hasRating=rating!=null,hasCount=reviewCount!=null,hasRank=[rankPosition,rankTotal,rankCategory,rankArea].some(v=>v!=null);
 if(!hasRating&&!hasCount&&!hasRank)invalid('Nhập điểm, tổng đánh giá hoặc thứ hạng.');
 if(hasRating&&(typeof rating!=='number'||!Number.isFinite(rating)||rating<0||rating>scales[source]))invalid('Điểm phải từ 0 đến '+scales[source]+'.');
 if(hasCount&&(!Number.isSafeInteger(reviewCount)||reviewCount<0))invalid('Tổng đánh giá phải là số nguyên từ 0 trở lên.');
 if(hasRank&&(source!=='tripadvisor'||!Number.isSafeInteger(rankPosition)||rankPosition<1||!Number.isSafeInteger(rankTotal)||rankTotal<rankPosition||!['hotel','restaurant','attraction'].includes(rankCategory)||typeof rankArea!=='string'||!rankArea.trim()||rankArea.trim().length>160||/[\r\n]/.test(rankArea)))invalid('Nhập đầy đủ hạng, tổng số, loại địa điểm và khu vực TripAdvisor.');
 if(typeof note!=='string'||note.length>500)invalid('Ghi chú tối đa 500 ký tự.');
 const captured=body.capturedAt==null?now:new Date(body.capturedAt);
 if(body.capturedAt!=null&&(typeof body.capturedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(body.capturedAt)))invalid('Thời điểm ghi nhận không hợp lệ.');
 if(!Number.isFinite(captured.getTime())||captured>now||now-captured>365*86400000)invalid('Chọn thời điểm trong 365 ngày vừa qua.');
 const requestId=body.requestId??randomUUID();
 if(typeof requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))invalid('Mã lần nhập không hợp lệ.');
 return {entityKey:entityKey.trim(),source,rating:hasRating?rating:null,reviewCount:hasCount?reviewCount:null,...(hasRank?{rankPosition,rankTotal,rankCategory,rankArea:rankArea.trim()}:{}),ratingMax:scales[source],capturedAt:captured.toISOString(),note:note.trim(),requestId};
}
