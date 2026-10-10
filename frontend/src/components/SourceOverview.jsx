import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {categories,platforms,directoryRows,safeSourceUrl} from '../lib/directory.js';
import Icon from './Icon.jsx';
import ManualSummary from './ManualSummary.jsx';
export default function SourceOverview({data,query='',fixedCategory,fixedRelationship,showMetrics=true}){
 const [summaries,setSummaries]=useState([]),[targets,setTargets]=useState([]),[directory,setDirectory]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[search,setSearch]=useState(''),[category,setCategory]=useState('all'),[relationship,setRelationship]=useState('managed');
 const [manual,setManual]=useState(null),[saved,setSaved]=useState(false);
 async function load(){
  setBusy(true);setError('');
  const results=await Promise.allSettled(['/api/ota/summary','/api/ota/status','/api/directory'].map(url=>api(url)));
  [setSummaries,setTargets,setDirectory].forEach((setter,i)=>{if(results[i].status==='fulfilled')setter(results[i].value);});
  setError(results.flatMap((r,i)=>r.status==='rejected'?[['Điểm OTA','Trạng thái đồng bộ','Danh mục địa điểm'][i]+': '+r.reason.message]:[]).join(' · '));setBusy(false);
 }
 useEffect(()=>{load();},[]);
 const rows=directoryRows(directory,data,summaries,targets);
 const activeCategory=fixedCategory||category,activeRelationship=fixedRelationship||relationship;
 const visible=rows.filter(p=>(activeCategory==='all'||p.category===activeCategory)&&(activeRelationship==='all'||p.relationship===activeRelationship)&&p.name.toLocaleLowerCase().includes((search||query).toLocaleLowerCase()));
 const manualLocations=directory.filter(e=>visible.some(r=>r.key===e.entity_key)&&e.sources.length);
 const columns=activeCategory==='hotel'?['google','tripadvisor','agoda','booking','expedia','trip','traveloka']:activeCategory==='cafe'||activeCategory==='store'?['google','tripadvisor','grab','shopee']:activeCategory==='activity'?['google','tripadvisor']:Object.keys(platforms);
 const rankKinds={hotel:'khách sạn',restaurant:'nhà hàng',attraction:'điểm tham quan'};
 function cell(row,source){
  const link=row.sources.find(s=>s.source===source),reading=row.readings[source];
  const url=safeSourceUrl(link?.source_url||reading?.source_url);
  const hasData=reading&&(reading.rating!=null||reading.review_count!=null||reading.count_display||reading.rank_position!=null);
  const ratingAt=reading?.rating_captured_at||reading?.captured_at;
  const countAt=(reading?.count_display?reading?.count_display_captured_at:reading?.count_captured_at)||reading?.captured_at;
  const at=value=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
  return <div className="source-reading">
   {hasData?<>
    <div className="source-rating">{reading.rating!=null&&<Icon name="star" size={15}/>}<strong>{reading.rating==null?'—':Number(reading.rating).toLocaleString('vi-VN')}</strong>{reading.rating!=null&&<span>/{reading.rating_max||platforms[source].scale}</span>}</div>
    {reading.rating!=null&&ratingAt&&<small>Điểm: {at(ratingAt)}</small>}
    <div className="source-review-count">{reading.count_display||(reading.review_count==null?'—':Number(reading.review_count).toLocaleString('vi-VN'))} {(reading.count_display||reading.review_count!=null)&&<span>{reading.count_kind==='ratings'?'lượt chấm điểm':'đánh giá'}</span>}</div>
    {(reading.count_display||reading.review_count!=null)&&countAt&&<small>{reading.count_kind==='ratings'?'Tổng lượt chấm điểm':'Tổng review'}: {at(countAt)}</small>}
    {source==='tripadvisor'&&reading.rank_position!=null&&<><div className="source-ranking">#{Number(reading.rank_position).toLocaleString('vi-VN')} <span>trong {Number(reading.rank_total).toLocaleString('vi-VN')} {rankKinds[reading.rank_category]||'địa điểm'} tại {reading.rank_area}</span></div>{reading.rank_captured_at&&<small>Thứ hạng ghi nhận: {at(reading.rank_captured_at)}</small>}</>}
    {reading.count_display&&reading.review_count!=null&&<small>Tổng chính xác lần trước: {Number(reading.review_count).toLocaleString('vi-VN')}{reading.count_captured_at&&' · '+at(reading.count_captured_at)}</small>}
    {(reading.rating_method==='manual'||reading.count_method==='manual'||reading.rank_method==='manual'||reading.collection_method==='manual')?<span className="pilot-tag manual-tag">Nhập thủ công</span>:reading.collection_method&&<span className="pilot-tag">{reading.collection_method==='browser'?'Ghi nhận từ trình duyệt':reading.collection_method==='ocr'?'Tự động · đọc ảnh':'Tự động · đọc trang'}</span>}
   </>:<div className="source-missing"><span>—</span></div>}
   {url&&!link?.warning&&<a className="source-link" href={url} target="_blank" rel="noopener noreferrer">Mở {platforms[source].name} ↗</a>}
   {row.entity_key&&link&&<button className="manual-cell-button" aria-label={'Nhập thủ công '+platforms[source].name+' — '+row.name} onClick={()=>{setSaved(false);setManual({entityKey:row.entity_key,source});}}><Icon name="edit" size={12}/>Nhập số liệu</button>}
  </div>;
 }
 return <>
  {showMetrics&&<div className="source-kpis">{[{label:'Địa điểm quản lý',value:rows.filter(r=>r.relationship==='managed').length,icon:'hotel',note:'Khách sạn, café, cửa hàng, hoạt động'},{label:'Địa điểm so sánh',value:rows.filter(r=>r.relationship==='comparison').length,icon:'link',note:'Theo dõi riêng nhóm đối thủ'},{label:'Nguồn có số liệu',value:rows.reduce((n,r)=>n+Object.values(r.readings).filter(s=>s.review_count!=null||s.rating!=null||s.rank_position!=null).length,0),icon:'shield',note:'Điểm, đánh giá hoặc thứ hạng đã ghi nhận'}].map(m=><div className="source-kpi" key={m.label}><span className="icon-box blue"><Icon name={m.icon}/></span><div><small>{m.label}</small><strong>{m.value}</strong><span>{m.note}</span></div></div>)}</div>}
  <section className="card source-overview"><div className="source-heading"><div><h2>Bảng theo dõi địa điểm</h2><p>Mỗi địa điểm một dòng. Điểm và tổng đánh giá riêng của từng nền tảng.</p></div><div className="source-heading-actions"><button disabled={busy||!manualLocations.length} onClick={()=>{setSaved(false);setManual({});}}><Icon name="edit" size={14}/>Nhập thủ công</button><button onClick={load} disabled={busy}>{busy?'Đang tải...':'Tải lại dữ liệu'}</button></div></div>
   {saved&&<p className="notice success" role="status">Đã lưu số liệu nhập thủ công.</p>}
   {error&&<p className="notice error" role="alert">Không tải được đầy đủ dữ liệu: {error}</p>}
   <div className="source-toolbar"><label className="search-field"><Icon name="search"/><input aria-label="Tìm trong bảng nguồn" placeholder="Tìm địa điểm..." value={search} onChange={e=>setSearch(e.target.value)}/></label>{!fixedCategory&&<select aria-label="Loại địa điểm" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Tất cả loại địa điểm</option>{Object.entries(categories).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}{!fixedRelationship&&<select aria-label="Nhóm theo dõi" value={relationship} onChange={e=>setRelationship(e.target.value)}><option value="managed">Công ty quản lý</option><option value="comparison">Đối thủ / so sánh</option><option value="all">Tất cả nhóm</option></select>}<span>{visible.length} địa điểm</span></div>
   <div className="source-scroll"><table><thead><tr><th>Địa điểm</th>{columns.map(s=><th key={s}>{platforms[s].name}<small>Điểm gốc nền tảng</small></th>)}</tr></thead><tbody>{visible.map(p=><tr key={p.key}><th><span className="hotel-initial">{p.name.slice(0,2).toUpperCase()}</span>{p.name}<small>{categories[p.category]}{p.relationship==='comparison'?' · So sánh':''}</small></th>{columns.map(source=><td key={source}>{cell(p,source)}</td>)}</tr>)}</tbody></table></div>
   {!busy&&!visible.length&&<p>Chưa có địa điểm phù hợp bộ lọc.</p>}<p className="source-footnote">Điểm và tổng đánh giá theo từng nguồn, kèm thời gian ghi nhận. Tổng review không cộng chung giữa các nguồn.</p>
  </section>
  {manual&&<ManualSummary locations={manualLocations} initial={manual} onClose={()=>setManual(null)} onSaved={async()=>{await load();setSaved(true);}}/>}
 </>;
}
