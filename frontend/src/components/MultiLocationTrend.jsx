import {useEffect,useMemo,useRef,useState} from 'react';
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts';
import {api} from '../lib/api.js';
import {categories,platforms} from '../lib/directory.js';
import {trendSeries} from '../lib/multi-trend.js';
import {reportToday,shiftReportDay} from '../lib/report-dates.js';
import Icon from './Icon.jsx';
import './multi-trend.css';
const num=v=>v==null?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2});
const signed=v=>v==null?'—':(v>0?'+':'')+num(v);
const date=v=>v?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';
const stamp=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa ghi nhận';
function Hover({active,payload,label,series,scale}){
 const row=payload?.[0]?.payload;if(!active||!row)return null;
 return <div className="multi-trend-tooltip"><strong>{date(label)}</strong><small>Thay đổi so với mốc có số liệu trước đó</small><div>{series.filter(s=>row[s.id+'Count']!=null||row[s.id+'Rating']!=null).map(s=><section key={s.id}><b><i style={{background:s.color}}/>{s.name}</b><p>Tổng: <strong>{num(row[s.id+'Count'])}</strong> <span>{row[s.id+'CountDelta']!=null&&'('+signed(row[s.id+'CountDelta'])+')'}</span></p><p>Điểm: <strong>{num(row[s.id+'Rating'])}/{scale}</strong> <span>{row[s.id+'RatingDelta']!=null&&'('+signed(row[s.id+'RatingDelta'])+')'}</span></p></section>)}</div></div>;
}
export default function MultiLocationTrend(){
 const today=reportToday(),minimum=shiftReportDay(today,-364);
 const [directory,setDirectory]=useState([]),[histories,setHistories]=useState({}),[source,setSource]=useState('google'),[category,setCategory]=useState('all'),[period,setPeriod]=useState(90),[from,setFrom]=useState(shiftReportDay(today,-89)),[to,setTo]=useState(today),[metric,setMetric]=useState('both'),[hidden,setHidden]=useState(new Set()),[busy,setBusy]=useState(true),[progress,setProgress]=useState(0),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const cache=useRef(new Map());
 useEffect(()=>{let stop=false;api('/api/directory').then(d=>{if(!stop)setDirectory(d.filter(p=>p.relationship==='managed'));}).catch(e=>{if(!stop){setError(e.message);setBusy(false);}});return()=>{stop=true;};},[]);
 const locations=useMemo(()=>directory.filter(d=>(category==='all'||d.category===category)&&d.sources?.some(s=>s.source===source)),[directory,category,source]);
 useEffect(()=>{
  let stopped=false,index=0,done=0;setHistories({});setHidden(new Set());setProgress(0);setError('');setBusy(true);
  const result={},failures=[];
  async function worker(){while(index<locations.length&&!stopped){const location=locations[index++],key=source+':'+location.entity_key;
   try{let data=cache.current.get(key);if(!data){data=await api('/api/source-history?'+new URLSearchParams({entity:location.entity_key,source,days:365}));cache.current.set(key,data);}result[location.entity_key]=data;}catch{failures.push(location.name);}
   if(!stopped)setProgress(++done);
  }}
  Promise.all(Array.from({length:Math.min(3,locations.length)},worker)).then(()=>{if(!stopped){setHistories(result);setBusy(false);if(failures.length)setError('Chưa tải được lịch sử của '+failures.length+' địa điểm. Các địa điểm còn lại vẫn hiển thị.');}});
  return()=>{stopped=true;};
 },[locations,source,reload]);
 const start=period==='custom'?from:shiftReportDay(today,-Number(period)+1),end=period==='custom'?to:today,valid=start>=minimum&&start<=end&&end<=today;
 const {series,rows}=useMemo(()=>valid?trendSeries(locations,histories,start,end):{series:[],rows:[]},[locations,histories,start,end,valid]);
 const available=series.filter(s=>s.hasData),visible=available.filter(s=>!hidden.has(s.entity_key)),scale=platforms[source].scale;
 const count=metric!=='rating',rating=metric!=='count';
 function toggle(key){setHidden(current=>{const next=new Set(current);next.has(key)?next.delete(key):next.add(key);return next;});}
 return <section className="card multi-trend" aria-label="Xu hướng đánh giá các địa điểm">
  <header className="multi-trend-head"><div><span className="eyebrow">SO SÁNH THEO THỜI GIAN</span><h2>Xu hướng đánh giá các địa điểm</h2><p>Theo dõi tổng đánh giá và điểm số trên {platforms[source].name}.</p></div><div className="multi-trend-presets" role="group" aria-label="Khoảng thời gian biểu đồ">{[[7,'7 ngày'],[30,'30 ngày'],[90,'3 tháng'],[180,'6 tháng'],[365,'1 năm'],['custom','Tùy chọn']].map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>{if(value==="custom"){setFrom(start);setTo(end);}setPeriod(value);}}>{label}</button>)}</div></header>
  <div className="multi-trend-filters"><label>Nền tảng<select aria-label="Nền tảng biểu đồ nhiều địa điểm" value={source} onChange={e=>setSource(e.target.value)}>{Object.entries(platforms).map(([key,p])=><option key={key} value={key}>{p.name}</option>)}</select></label><label>Nhóm địa điểm<select aria-label="Nhóm địa điểm biểu đồ" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Tất cả địa điểm quản lý</option>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Từ ngày<input aria-label="Biểu đồ từ ngày" type="date" min={minimum} max={end||today} value={start} onChange={e=>{setFrom(e.target.value);setTo(end);setPeriod("custom");}}/></label><label>Đến ngày<input aria-label="Biểu đồ đến ngày" type="date" min={start||minimum} max={today} value={end} onChange={e=>{setTo(e.target.value);setFrom(start);setPeriod("custom");}}/></label>
   <div className="multi-trend-switch" role="group" aria-label="Chỉ số biểu đồ">{[['both','Cả hai'],['count','Tổng đánh giá'],['rating','Điểm số']].map(([value,label])=><button key={value} aria-pressed={metric===value} onClick={()=>setMetric(value)}>{label}</button>)}</div><button className="secondary" disabled={busy} onClick={()=>{cache.current.clear();setReload(n=>n+1);}} aria-label="Tải lại biểu đồ"><Icon name="refresh" size={14}/></button>
  </div>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {!valid?<div className="multi-trend-empty">Chọn khoảng ngày hợp lệ trong 365 ngày gần nhất.</div>:busy?<div className="multi-trend-empty" role="status"><Icon name="refresh" className="spin"/>Đang đọc lịch sử · {progress}/{locations.length} địa điểm</div>:!available.length?<div className="multi-trend-empty"><Icon name="trend" size={32}/><strong>Chưa có lịch sử trong khoảng chọn</strong><p>Biểu đồ sẽ hiển thị khi có mốc ghi nhận của {platforms[source].name}.</p></div>:<>
   <div className="multi-trend-axis"><span>{count?'Tổng đánh giá':''}</span><span>{rating?'Điểm / '+scale:''}</span></div>
   {!visible.length?<div className="multi-trend-empty">Chọn ít nhất một địa điểm bên dưới để hiển thị.</div>:<div className="multi-trend-canvas"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{top:15,right:10,left:5,bottom:10}}><CartesianGrid stroke="#ebe5ef" vertical={false} strokeDasharray="3 3"/><XAxis dataKey="day" tickFormatter={v=>v.slice(8)+'/'+v.slice(5,7)} minTickGap={32} tickLine={false} axisLine={{stroke:'#ded4e7'}} tick={{fontSize:11,fill:'#867893'}}/><YAxis yAxisId="count" hide={!count} allowDecimals={false} domain={[0,'auto']} width={60} tickFormatter={v=>num(v)} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#867893'}}/><YAxis yAxisId="rating" orientation="right" hide={!rating} domain={[0,scale]} width={38} ticks={scale===5?[0,1,2,3,4,5]:[0,2,4,6,8,10]} axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#867893'}}/><Tooltip content={<Hover series={visible} scale={scale}/>} cursor={{stroke:'#bba7cf',strokeDasharray:'4 4'}}/>{visible.flatMap(s=>[count&&<Line key={s.id+'c'} yAxisId="count" dataKey={s.id+'Count'} name={s.name+' · tổng'} stroke={s.color} strokeWidth={2.3} type="linear" connectNulls={false} dot={{r:rows.length<45?3:1,fill:s.color}} activeDot={{r:5}} isAnimationActive={false}/>,rating&&<Line key={s.id+'r'} yAxisId="rating" dataKey={s.id+'Rating'} name={s.name+' · điểm'} stroke={s.color} strokeDasharray="6 5" strokeWidth={1.8} type="linear" connectNulls={false} dot={{r:rows.length<45?2.5:0,fill:s.color}} activeDot={{r:4}} isAnimationActive={false}/>])}</LineChart></ResponsiveContainer></div>}
   <div className="multi-trend-legend-head"><span>{visible.length}/{available.length} địa điểm có dữ liệu · {date(start)} — {date(end)}</span><button onClick={()=>setHidden(new Set())}>Hiện tất cả</button></div>
   <div className="multi-trend-legend">{available.map(s=><button key={s.entity_key} className={hidden.has(s.entity_key)?'is-hidden':''} aria-pressed={!hidden.has(s.entity_key)} onClick={()=>toggle(s.entity_key)}><strong><i style={{background:s.color}}/>{s.name}</strong><span><i className="legend-line" style={{borderColor:s.color}}/>Tổng đánh giá <b>{num(s.lastCount)}</b></span><span><i className="legend-line dashed" style={{borderColor:s.color}}/>Điểm <b>{num(s.lastRating)}/{scale}</b></span><small title={'Tổng: '+stamp(s.countAt)+' · Điểm: '+stamp(s.ratingAt)}>Trong kỳ: {signed(s.countChange)} đánh giá · {signed(s.ratingChange)} điểm</small></button>)}</div>
  </>}
  <footer>Đường liền: tổng đánh giá · Nét đứt: điểm số. Bấm tên địa điểm để ẩn/hiện. Mỗi ngày lấy lần ghi nhận cuối cùng; ngày thiếu để trống. Số liệu cuối cùng của từng địa điểm có thể khác ngày. Không cộng tổng giữa các nền tảng.</footer>
 </section>;
}
