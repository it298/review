export const publicScales={tripadvisor:5,booking:10,expedia:10,grab:5,shopee:5,agoda:10,trip:10,traveloka:10};
export function publicSourceUrl(source,value){
 const u=new URL(value);const hosts={tripadvisor:/^(?:www|en)\.tripadvisor\.(?:com|com\.vn|com\.hk)$/,booking:/^www\.booking\.com$/,expedia:/^www\.expedia\.(?:com|com\.vn)$/,grab:/^(?:food|mart|r|app|www)\.grab\.com$|^grab\.onelink\.me$/,shopee:/^(?:www\.)?shopeefood\.vn$|^spf\.shopee\.vn$/,agoda:/^www\.agoda\.com$/,trip:/^www\.trip\.com$/,traveloka:/^www\.traveloka\.com$/};
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts[source]?.test(u.hostname))throw new Error('Invalid source URL');return u;
}
export function publicSourceIdentity(source,value){
 const u=publicSourceUrl(source,value),path=decodeURIComponent(u.pathname);
 if(source==='tripadvisor')return path.match(/-d(\d+)-/)?.[1]||null;
 if(source==='expedia')return path.match(/\.h(\d+)\./)?.[1]||null;
 if(source==='booking')return path.match(/^\/hotel\/([^/]+)\/([^/.]+)\.[a-z-]+\.html$/)?.slice(1).join('/')||null;
 if(source==='grab')return decodeURIComponent(u.href).match(/5-C[A-Z0-9]+/)?.[0]||null;
 if(source==='shopee')return path.match(/\/shop\/(\d+)/)?.[1]||u.searchParams.get('restaurantId')||(!/^\/u\//.test(path)&&u.hostname.includes('shopeefood')?path:null);
 if(source==='trip')return u.searchParams.get('hotelId')||path.match(/(?:hotel-detail-|hotels\/[^/]+\/)(\d+)/)?.[1]||null;
 if(source==='traveloka')return path.match(/-(\d{10,})$/)?.[1]||u.searchParams.get('spec')?.match(/HOTEL\.(\d+)/)?.[1]||null;
 if(source==='agoda')return /\/hotel\/.+\.html$/.test(path)?path:null;
 return null;
}
export function validatePublicSummary(p){
 const fail=()=>{throw Object.assign(new Error('Dữ liệu nguồn công khai không hợp lệ.'),{status:400});};
 if(!p||!publicScales[p.source]||!/^[-a-z0-9]{1,200}$/.test(p.entityKey)||!['dom','ocr'].includes(p.method))fail();
 if(p.status==='failed')return {entityKey:p.entityKey,source:p.source,method:p.method,status:'failed',error:['blocked','network','invalid_data','login_required','app_required','no_public_summary','no_reviews'].includes(p.error)?p.error:'invalid_data'};
 const date=new Date(p.capturedAt);if(p.status!=='success'||isNaN(date)||date.getTime()<Date.now()-86400000||date.getTime()>Date.now()+300000)fail();
 let identity,expected;try{identity=publicSourceIdentity(p.source,p.resolvedUrl);expected=publicSourceIdentity(p.source,p.sourceUrl);}catch{fail();}
 if(!identity||!expected||identity!==expected)fail();
 const rating=p.rating??null,count=p.reviewCount??null,label=p.countDisplay??null,rankPosition=p.rankPosition??null,rankTotal=p.rankTotal??null,rankCategory=p.rankCategory??null,rankArea=p.rankArea??null,hasRank=[rankPosition,rankTotal,rankCategory,rankArea].some(v=>v!==null);
 if(rating!==null&&(!Number.isFinite(rating)||rating<0||rating>publicScales[p.source]))fail();
 if(count!==null&&(!Number.isSafeInteger(count)||count<0))fail();
 if(label!==null&&(p.source!=='shopee'||!/^\d{1,9}\+$/.test(label)||count!==null))fail();
 if(hasRank&&(p.source!=='tripadvisor'||!Number.isSafeInteger(rankPosition)||rankPosition<1||!Number.isSafeInteger(rankTotal)||rankTotal<rankPosition||!['hotel','restaurant','attraction'].includes(rankCategory)||typeof rankArea!=='string'||!rankArea.trim()||rankArea.trim().length>160||/[\r\n]/.test(rankArea)))fail();
 if(rating===null&&count===null&&label===null||p.method==='ocr'&&!p.corroborated)fail();
 if(p.countKind!=null&&!['ratings','reviews'].includes(p.countKind))fail();
 return {entityKey:p.entityKey,source:p.source,status:'success',method:p.method,sourceUrl:p.sourceUrl,resolvedUrl:p.resolvedUrl,sourceToken:identity,rating,ratingMax:publicScales[p.source],reviewCount:count,countDisplay:label,countKind:p.countKind||'reviews',capturedAt:date.toISOString(),...(hasRank?{rankPosition,rankTotal,rankCategory,rankArea:rankArea.trim(),rankCapturedAt:date.toISOString()}:{}),...(p.method==='ocr'?{corroborated:true}:{})};
}
