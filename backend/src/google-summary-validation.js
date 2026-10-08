export function validateGoogleSummary(p){
 const fail=()=>{throw Object.assign(new Error('Dữ liệu tổng hợp Google Maps chưa hợp lệ.'),{status:400});};
 if(!p||!/^[-a-z0-9]{1,200}$/.test(p.entityKey)||!['dom','ocr'].includes(p.method))fail();
 if(p.status==='failed')return {entityKey:p.entityKey,method:p.method,status:'failed',error:['blocked','network','invalid_data','browser_missing'].includes(p.error)?p.error:'invalid_data'};
 const at=new Date(p.capturedAt);
 if(p.status!=='success'||isNaN(at)||at.getTime()>Date.now()+300000||at.getTime()<Date.now()-86400000)fail();
 if(!/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(p.placeToken))fail();
 const rating=p.rating??null,count=p.reviewCount??null;
 if(rating===null&&count===null)fail();
 if(rating!==null&&(!Number.isFinite(rating)||rating<0||rating>5))fail();
 if(count!==null&&(!Number.isSafeInteger(count)||count<0))fail();
 if(p.method==='ocr'&&p.corroborated!==true)fail();
 return {entityKey:p.entityKey,method:p.method,status:'success',capturedAt:at.toISOString(),placeToken:p.placeToken,rating,reviewCount:count,...(p.method==='ocr'?{corroborated:true}:{})};
}
