export function blocked(text){return /access is temporarily restricted|you have been blocked|verify you are human|captcha|unusual activity/i.test(text);}
// Only use this parser on the verified Agoda review branding card, never the page header.
export function parseAgodaCard(text){
 if(blocked(text))throw Object.assign(new Error('blocked'),{code:'blocked'});
 const rating=text.trim().match(/^(\d{1,2}(?:[.,]\d{1,2})?)\s/);
 const count=text.match(/Dựa trên\s+([\d.,]+)\s+bài đánh giá/i);
 if(!rating||!count)throw Object.assign(new Error('Incomplete Agoda review card'),{code:'invalid_data'});
 const summary={rating:Number(rating[1].replace(',','.')),ratingMax:10,count:Number(count[1].replace(/[.,]/g,''))};
 if(!Number.isFinite(summary.rating)||summary.rating<0||summary.rating>10||!Number.isSafeInteger(summary.count)||summary.count<0)throw Object.assign(new Error('Invalid Agoda review card'),{code:'invalid_data'});
 return summary;
}
export function parseSummary(source,text){
 if(blocked(text))throw Object.assign(new Error('blocked'),{code:'blocked'});
 let m;
 if(source==='agoda')m=text.match(/Điểm số qua Agoda\s*([\d.,]+)\s*\/\s*10[\s\S]{0,1200}?Dựa trên\s*([\d.,]+)\s*bài đánh giá/i);
 if(source==='trip')m=text.match(/([\d.]+)\s*(?:out of|\/)\s*10[\s\S]{0,180}?([\d,]+)\s*verified reviews/i);
 if(source==='traveloka')m=text.match(/Traveloka\s*\(([\d,.]+)\)[\s\S]{0,150}?([\d.,]+)\s*(?:\/\s*10)?[\s\S]{0,100}?From\s*([\d,.]+)\s*reviews/i);
 if(!m)throw Object.assign(new Error('No source-specific summary'),{code:'invalid_data'});
 const rating=Number((source==='traveloka'?m[2]:m[1]).replace(',','.'));
 const count=Number((source==='traveloka'?m[1]:m[2]).replace(/[,.]/g,''));
 if(source==='traveloka'&&Number(m[3].replace(/[,.]/g,''))!==count)throw Object.assign(new Error('Mixed source count'),{code:'invalid_data'});
 if(!Number.isFinite(rating)||rating<0||rating>10||!Number.isSafeInteger(count)||count<0)throw Object.assign(new Error('Invalid summary'),{code:'invalid_data'});
 return {rating,ratingMax:10,count};
}
export function targetURL(target){
 const u=new URL(target.source_url);const hosts={agoda:'www.agoda.com',trip:'www.trip.com',traveloka:'www.traveloka.com'};
 if(u.protocol!=='https:'||u.hostname!==hosts[target.source]||u.username||u.password||u.port)throw new Error('Invalid OTA URL');
 if(target.source!=='agoda'&&!u.href.includes(target.property_id))throw new Error('Property ID does not match URL');return u.href;
}
