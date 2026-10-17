import {useEffect,useMemo,useRef,useState} from 'react';
import CircularChart,{CountCircle,RatingCircle} from './CircularChart.jsx';
import {api} from '../lib/api.js';
import {categories,platforms} from '../lib/directory.js';
import {trendSeries} from '../lib/multi-trend.js';
import {reportToday,shiftReportDay} from '../lib/report-dates.js';
import Icon from './Icon.jsx';
import {prepareTrendReport,exportTrendExcel,exportTrendPdf} from '../lib/trend-report.js';
import './multi-trend.css';
import './trend-cards.css';
const num=v=>v==null?'—':Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2});
const signed=v=>v==null?'—':(v>0?'+':'')+num(v);
const date=v=>v?v.slice(8)+'/'+v.slice(5,7)+'/'+v.slice(0,4):'—';
const stamp=v=>v?new Date(v).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa ghi nhận';
function LocationCard({item,rows,metric,scale}){
 const isCount=metric==='count',field=item.id+(isCount?'Count':'Rating'),value=isCount?item.lastCount:item.lastRating,change=isCount?item.countChange:item.ratingChange,at=isCount?item.countAt:item.ratingAt;
 return <article className="trend-location-card"><header><span className="trend-location-mark" style={{background:item.color}}/><h3>{item.name}</h3></header><div className="trend-location-value"><div><small>{isCount?'Tổng đánh giá':'Điểm gần nhất'}</small><strong>{num(value)}{!isCount&&<span>/{scale}</span>}</strong></div><span className={'trend-location-change '+(change>0?'up':change<0?'down':'neutral')}>{change==null?'Chưa đủ 2 mốc':(change>0?'↑ ':change<0?'↓ ':'')+signed(change)+(isCount?' đánh giá':' điểm')}</span></div><p className="trend-location-other">{isCount?'Điểm: '+num(item.lastRating)+'/'+scale:'Tổng: '+num(item.lastCount)+' đánh giá'} · thay đổi trong kỳ</p>{value==null?<div className="trend-location-missing">Chưa có {isCount?'tổng chính xác':'điểm số'} trong kỳ.</div>:<div className="trend-location-chart">{isCount?<CountCircle color={item.color} first={change==null?null:value-change} last={value} from={date(rows.find(r=>r[field]!=null)?.day)} to={date(rows.filter(r=>r[field]!=null).at(-1)?.day)}/>:<RatingCircle color={item.color} value={value} max={scale} title={item.name+' · điểm'}/>}</div>} <footer>Ghi nhận: {stamp(at)}</footer></article>;
}
export default function MultiLocationTrend(){
 const today=reportToday(),minimum=shiftReportDay(today,-364);
 const [directory,setDirectory]=useState([]),[histories,setHistories]=useState({}),[source,setSource]=useState('google'),[category,setCategory]=useState('all'),[period,setPeriod]=useState(90),[from,setFrom]=useState(shiftReportDay(today,-89)),[to,setTo]=useState(today),[metric,setMetric]=useState('count'),[view,setView]=useState('cards'),[hidden,setHidden]=useState(new Set()),[busy,setBusy]=useState(true),[progress,setProgress]=useState(0),[error,setError]=useState(''),[reload,setReload]=useState(0),[exporting,setExporting]=useState('');
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
  Promise.all(Array.from({length:Math.min(3,locations.length)},worker)).then(()=>{if(!stopped){setHistories(result);setHidden(new Set(trendSeries(locations,result,minimum,today).series.filter(s=>s.hasData).slice(4).map(s=>s.entity_key)));setBusy(false);if(failures.length)setError('Chưa tải được lịch sử của '+failures.length+' địa điểm. Các địa điểm còn lại vẫn hiển thị.');}});
  return()=>{stopped=true;};
 },[locations,source,reload]);
 const start=period==='custom'?from:shiftReportDay(today,-Number(period)+1),end=period==='custom'?to:today,valid=start>=minimum&&start<=end&&end<=today;
 const {series,rows}=useMemo(()=>valid?trendSeries(locations,histories,start,end):{series:[],rows:[]},[locations,histories,start,end,valid]);
 const available=series.filter(s=>s.hasData),visible=available.filter(s=>!hidden.has(s.entity_key)),scale=platforms[source].scale;
 const count=metric==='count',rating=metric==='rating';
 const exportSeries=view==='cards'?available:visible;
 async function exportReport(format){setExporting(format);setError('');try{const report=prepareTrendReport({source,category,metric,view,start,end,series:exportSeries,rows});await (format==='excel'?exportTrendExcel(report):exportTrendPdf(report));}catch(e){setError('Không xuất được báo cáo: '+e.message);}finally{setExporting('');}}
 function changeView(value){setView(value);if(value==='compare')setHidden(new Set(available.slice(4).map(s=>s.entity_key)));}
 function toggle(key){setHidden(current=>{const next=new Set(current);if(next.has(key)){if(available.length-next.size<4)next.delete(key);}else next.add(key);return next;});}
 return <section className="card multi-trend" aria-label="Xu hướng đánh giá các địa điểm">
  <header className="multi-trend-head"><div><span className="eyebrow">SO SÁNH THEO THỜI GIAN</span><h2>Xu hướng đánh giá các địa điểm</h2><p>Theo dõi tổng đánh giá và điểm số trên {platforms[source].name}.</p></div><div className="multi-trend-presets" role="group" aria-label="Khoảng thời gian biểu đồ">{[[7,'7 ngày'],[30,'30 ngày'],[90,'3 tháng'],[180,'6 tháng'],[365,'1 năm'],['custom','Tùy chọn']].map(([value,label])=><button key={value} aria-pressed={period===value} onClick={()=>{if(value==="custom"){setFrom(start);setTo(end);}setPeriod(value);}}>{label}</button>)}</div></header>
  <div className="multi-trend-filters"><label>Nền tảng<select aria-label="Nền tảng biểu đồ nhiều địa điểm" value={source} onChange={e=>setSource(e.target.value)}>{Object.entries(platforms).map(([key,p])=><option key={key} value={key}>{p.name}</option>)}</select></label><label>Nhóm địa điểm<select aria-label="Nhóm địa điểm biểu đồ" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Tất cả địa điểm quản lý</option>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Từ ngày<input aria-label="Biểu đồ từ ngày" type="date" min={minimum} max={end||today} value={start} onChange={e=>{setFrom(e.target.value);setTo(end);setPeriod("custom");}}/></label><label>Đến ngày<input aria-label="Biểu đồ đến ngày" type="date" min={start||minimum} max={today} value={end} onChange={e=>{setTo(e.target.value);setFrom(start);setPeriod("custom");}}/></label>
   <div className="multi-trend-switch" role="group" aria-label="Chỉ số biểu đồ">{[['count','Tổng đánh giá'],['rating','Điểm số']].map(([value,label])=><button key={value} aria-pressed={metric===value} onClick={()=>setMetric(value)}>{label}</button>)}</div><button className="secondary" disabled={busy} onClick={()=>{cache.current.clear();setReload(n=>n+1);}} aria-label="Tải lại biểu đồ"><Icon name="refresh" size={14}/></button>
  </div>
  <div className="trend-view-bar"><div role="group" aria-label="Cách xem biểu đồ"><button aria-pressed={view==='cards'} onClick={()=>changeView('cards')}>Từng địa điểm</button><button aria-pressed={view==='compare'} onClick={()=>changeView('compare')}>So sánh chung</button></div><span>{view==='cards'?'Mỗi ô một địa điểm · so mốc đầu và cuối kỳ':'Chọn tối đa 4 địa điểm để so sánh'}</span></div>
  <div className="trend-export-actions"><span>Xuất đúng bộ lọc và {exportSeries.length} địa điểm đang xem</span><button className="secondary" disabled={busy||!valid||!exportSeries.length||!!exporting} onClick={()=>exportReport('excel')}><Icon name="download" size={15}/>{exporting==='excel'?'Đang xuất…':'Xuất Excel xu hướng'}</button><button className="primary" disabled={busy||!valid||!exportSeries.length||!!exporting} onClick={()=>exportReport('pdf')}><Icon name="download" size={15}/>{exporting==='pdf'?'Đang xuất…':'Xuất PDF xu hướng ngang'}</button></div>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {!valid?<div className="multi-trend-empty">Chọn khoảng ngày hợp lệ trong 365 ngày gần nhất.</div>:busy?<div className="multi-trend-empty" role="status"><Icon name="refresh" className="spin"/>Đang đọc lịch sử · {progress}/{locations.length} địa điểm</div>:!available.length?<div className="multi-trend-empty"><Icon name="trend" size={32}/><strong>Chưa có lịch sử trong khoảng chọn</strong><p>Biểu đồ sẽ hiển thị khi có mốc ghi nhận của {platforms[source].name}.</p></div>:view==='cards'?<><div className="trend-period-note">{available.length} địa điểm · {date(start)} — {date(end)}</div><div className="trend-location-grid">{available.map(s=><LocationCard key={s.entity_key} item={s} rows={rows} metric={metric} scale={scale}/>)}</div></>:<>
   <div className="multi-trend-axis"><span>{count?'Tổng đánh giá':''}</span><span>{rating?'Điểm / '+scale:''}</span></div>
   {!visible.length?<div className="multi-trend-empty">Chọn ít nhất một địa điểm bên dưới để hiển thị.</div>:<div className="multi-trend-canvas">{count?<CircularChart title="Tổng đánh giá gần nhất theo địa điểm" unit="lượt" data={visible.map(s=>({label:s.name,value:s.lastCount,color:s.color}))}/>:<div className="circular-grid">{visible.map(s=><article className="circular-card" key={s.id}><h3>{s.name}</h3><RatingCircle color={s.color} value={s.lastRating} max={scale} title={s.name+' · điểm'}/></article>)}</div>}</div>}

   <div className="multi-trend-legend-head"><span>{visible.length}/{available.length} địa điểm có dữ liệu · {date(start)} — {date(end)}</span><button onClick={()=>setHidden(new Set(available.slice(4).map(s=>s.entity_key)))}>Chọn 4 địa điểm đầu</button></div>
   <div className="multi-trend-legend">{available.map(s=><button key={s.entity_key} disabled={hidden.has(s.entity_key)&&visible.length>=4} className={hidden.has(s.entity_key)?'is-hidden':''} aria-pressed={!hidden.has(s.entity_key)} onClick={()=>toggle(s.entity_key)}><strong><i style={{background:s.color}}/>{s.name}</strong><span>Tổng đánh giá <b>{num(s.lastCount)}</b></span><span>Điểm <b>{num(s.lastRating)}/{scale}</b></span><small title={'Tổng: '+stamp(s.countAt)+' · Điểm: '+stamp(s.ratingAt)}>Trong kỳ: {signed(s.countChange)} đánh giá · {signed(s.ratingChange)} điểm</small></button>)}</div>
  </>}
  <footer>Tổng review: so mốc đầu–cuối trong kỳ, không cộng các mốc tích lũy. Điểm số: vòng tròn theo thang gốc. So sánh chung dùng tổng gần nhất của từng địa điểm trong kỳ; giờ ghi nhận có thể khác nhau. Bảng ngày đầy đủ có trong báo cáo xuất.</footer>
 </section>;
}
