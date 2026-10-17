export const chartColors=['#765493','#c5a45d','#378d81','#bc6377','#577fae','#8b914b','#b97848','#797391'];
export const chartNumber=value=>value==null?'—':Number(value).toLocaleString('vi-VN',{maximumFractionDigits:2});
export function compactChartNumber(value){if(value==null)return '—';const n=Number(value);for(const [size,label] of [[1e12,'nghìn tỷ'],[1e9,'tỷ'],[1e6,'tr']])if(Math.abs(n)>=size)return chartNumber(n/size)+' '+label;return chartNumber(n);}
export const numeric=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
// Never add cumulative observations together. A count pie compares only two endpoints.
export function countComparison(first,last){
 first=numeric(first);last=numeric(last);
 if(last==null||last<0)return [];
 if(first==null||first<0)return [{label:'Tổng ghi nhận',value:last,color:chartColors[0]}];
 return last>=first?[{label:'Mốc đầu',value:first,color:chartColors[0]},{label:'Tăng ròng',value:last-first,color:chartColors[2]}]:[{label:'Còn lại',value:last,color:chartColors[0]},{label:'Giảm ròng',value:first-last,color:chartColors[3]}];
}
export function ratingParts(value,max){
 value=numeric(value);max=numeric(max);
 if(value==null||max==null||max<=0||value<0||value>max)return [];
 return [{label:'Điểm hiện tại',value,color:chartColors[0]},{label:'Còn tới tối đa',value:Number((max-value).toFixed(8)),color:'#e3d9eb'}];
}
export function prepareSlices(data,maxSlices=6){
 const rows=data.map((row,index)=>({...row,value:numeric(row.value),color:row.color||chartColors[index%chartColors.length],index}));
 const known=rows.filter(r=>r.value!=null),total=known.reduce((s,r)=>s+Math.abs(r.value),0),signed=known.some(r=>r.value<0);
 let sectors=known.filter(r=>r.value!==0).map(r=>({...r,weight:Math.abs(r.value)}));
 if(sectors.length>maxSlices){
  const sorted=[...sectors].sort((a,b)=>b.weight-a.weight),keep=sorted.slice(0,maxSlices-1),rest=sorted.slice(maxSlices-1);
  sectors=[...keep,{label:`Gộp (${rest.length})`,value:rest.reduce((s,r)=>s+r.value,0),weight:rest.reduce((s,r)=>s+r.weight,0),color:'#a39aaa',grouped:true,members:rest}];
 }
 let angle=-Math.PI/2;
 sectors=sectors.map(s=>{const start=angle;angle+=s.weight/total*Math.PI*2;return {...s,start,end:angle,mid:(start+angle)/2,percent:s.weight/total*100};});
 return {rows,sectors,total,signed,missing:rows.filter(r=>r.value==null).length};
}
// Reserve three text baselines per leader; skewed distributions may put five
// labels on one side even when the chart has only six sectors.
export function layoutCircularLabels(sectors){
 const labels=sectors.map(s=>({...s,right:Math.cos(s.mid)>=0})),maxSide=Math.max(...[false,true].map(side=>labels.filter(l=>l.right===side).length));
 const height=Math.max(306,(maxSide-1)*52+80),cy=height/2;
 for(const right of [false,true]){
  const side=labels.filter(l=>l.right===right).sort((a,b)=>Math.sin(a.mid)-Math.sin(b.mid));
  side.forEach((s,i)=>{s.y=Math.max(30,cy+Math.sin(s.mid)*110,i?side[i-1].y+52:30);});
  if(side.length&&side.at(-1).y>height-40){const shift=side.at(-1).y-(height-40);side.forEach(s=>s.y-=shift);}
 }
 return {labels,height,cy};
}
