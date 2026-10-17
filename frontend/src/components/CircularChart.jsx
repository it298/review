import {useEffect,useId,useRef,useState} from 'react';
import {chartNumber,compactChartNumber,countComparison,numeric,prepareSlices,ratingParts,layoutCircularLabels} from '../lib/circular-chart.js';
import './circular-chart.css';
export default function CircularChart({data=[],title='Biểu đồ tròn',unit='',center,centerLabel='Tổng',format=chartNumber,maxSlices=6,showTable=true}){
 const ref=useRef(null),[width,setWidth]=useState(500);
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(Math.max(260,Math.min(640,Math.floor(entry.contentRect.width)))));if(ref.current)observer.observe(ref.current);return()=>observer.disconnect();},[]);
 const uid=useId().replace(/[^a-zA-Z0-9]/g,''),{rows,sectors,total,signed,missing}=prepareSlices(data,Math.min(6,maxSlices)),cx=width/2,r=Math.min(86,Math.max(52,width*.18)),inner=r*.56;
 const {labels,height,cy}=layoutCircularLabels(sectors);
 const point=(angle,radius)=>[cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius];
 const arc=s=>{const [x,y]=point(s.start,r),[ex,ey]=point(s.end,r),[ix,iy]=point(s.end,inner),[sx,sy]=point(s.start,inner);return `M ${x} ${y} A ${r} ${r} 0 ${s.end-s.start>Math.PI?1:0} 1 ${ex} ${ey} L ${ix} ${iy} A ${inner} ${inner} 0 ${s.end-s.start>Math.PI?1:0} 0 ${sx} ${sy} Z`;};
 const centerText=center??(total?compactChartNumber(signed?null:total):missing?'—':format(0));
 return <figure ref={ref} className="circular-chart" aria-label={title}>
  <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={uid+'title'}><title id={uid+'title'}>{title}. {rows.map(r=>`${r.label}: ${format(r.value)} ${unit}`).join('; ')}</title><defs><marker id={uid+'arrow'} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="context-stroke"/></marker></defs>
   <circle cx={cx} cy={cy} r={(r+inner)/2} fill="none" stroke="#eee8f1" strokeWidth={r-inner}/>
   {sectors.map((s,i)=>sectors.length===1?<circle key={i} cx={cx} cy={cy} r={(r+inner)/2} fill="none" stroke={s.color} strokeWidth={r-inner}/>:<path key={i} d={arc(s)} fill={s.color} stroke="white" strokeWidth="2"/>)}
   <text x={cx} y={cy-2} textAnchor="middle" className="circular-center" style={{fontSize:Math.min(22,Math.max(11,inner*3/String(centerText).length))}}>{centerText}</text><text x={cx} y={cy+17} textAnchor="middle" className="circular-center-label" style={{fontSize:Math.min(10,inner*2.8/centerLabel.length)}}>{centerLabel}</text>
   {labels.map((s,i)=>{const [sx,sy]=point(s.mid,r+3),[mx,my]=point(s.mid,r+12),x=s.right?cx+r+17:cx-r-17,tx=s.right?x+8:x-8,limit=Math.max(8,Math.floor((cx-r-28)/6.5)),value=compactChartNumber(s.grouped&&signed?s.weight:s.value);return <g key={i} className="circular-arrow-label"><polyline points={`${sx},${sy} ${mx},${my} ${s.right?x-7:x+7},${s.y} ${x},${s.y}`} fill="none" stroke={s.color} strokeWidth="1.6" markerEnd={`url(#${uid}arrow)`}/><text x={tx} y={s.y-5} textAnchor={s.right?'start':'end'}><tspan className="circular-slice-name">{s.label.length>limit?s.label.slice(0,limit-1)+'…':s.label}</tspan><tspan x={tx} dy="17" className="circular-slice-value">{s.grouped&&signed?'| | ':''}{value}</tspan><tspan x={tx} dy="15" className="circular-slice-percent">{chartNumber(s.percent)}%</tspan></text></g>;})}
  </svg>
  {!total&&<p className="circular-empty">{rows.every(r=>r.value==null)?'Chưa có số liệu.':'Không có phát sinh khác 0 để chia tỷ trọng.'}</p>}
  {signed&&<p className="circular-note">Tỷ trọng theo độ lớn tuyệt đối; số âm giữ nguyên dấu. Tổng có dấu: {format(rows.reduce((s,r)=>s+(r.value??0),0))} {unit}.</p>}
  {missing>0&&<p className="circular-note">{missing} mục chưa có số liệu (—), chưa tính vào tỷ trọng.</p>}
  {rows.filter(r=>r.value).length>sectors.length&&<p className="circular-note">Các mục nhỏ gộp vào “Khác” trên hình; danh sách giữ đủ từng mục. Nhãn số lớn dùng tr / tỷ; số đầy đủ ở bên dưới.</p>}
  {showTable&&<figcaption><ul className="circular-values">{rows.map((r,i)=><li key={i}><span><i style={{background:r.color}}/>{r.label}</span><strong>{format(r.value)}{r.value!=null&&unit?' '+unit:''}<small>{r.value!=null&&total?chartNumber(Math.abs(r.value)/total*100)+'%':''}</small></strong></li>)}</ul></figcaption>}
 </figure>;
}
export function RatingCircle({value,max,title='Điểm đánh giá',color}){const parts=ratingParts(value,max);if(color&&parts.length)parts[0].color=color;return <CircularChart title={title} data={parts} center={parts.length?chartNumber(value):'—'} centerLabel={'/ '+max+' điểm'} unit="điểm"/>;}
export function CountCircle({first,last,title='Tổng đánh giá',from,to,color}){const a=numeric(first),b=numeric(last),parts=countComparison(first,last),delta=a==null||b==null?null:Number((b-a).toFixed(2));if(color&&parts.length)parts[0].color=color;return <div><CircularChart title={title} data={parts} center={parts.length?chartNumber(b):'—'} centerLabel="Tổng gần nhất" unit="lượt"/><p className="circular-period">{from||'Mốc đầu'} → {to||'Mốc cuối'} · {delta==null?'Chưa đủ hai mốc':(delta>0?'↑ +':delta<0?'↓ ':'→ ')+chartNumber(delta)+' lượt'}</p></div>;}
