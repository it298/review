import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import {categories,platforms,directoryRows,safeSourceUrl} from '../lib/directory.js';
import Icon from './Icon.jsx';
const statusLabel=code=>({blocked:'Nguồn chặn truy cập',unconfigured:'Chờ cấu hình kết nối',invalid_data:'Chưa xác minh được dữ liệu',network:'Lỗi kết nối',browser_missing:'Worker thiếu trình duyệt'}[code]||'Cập nhật thất bại');
export default function SourceOverview({data,query='',fixedCategory,fixedRelationship,showMetrics=true}){
 const [summaries,setSummaries]=useState([]),[targets,setTargets]=useState([]),[directory,setDirectory]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[search,setSearch]=useState(''),[category,setCategory]=useState('all'),[relationship,setRelationship]=useState('managed');
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
 const columns=activeCategory==='hotel'?['google','tripadvisor','agoda','booking','expedia','trip','traveloka']:activeCategory==='cafe'||activeCategory==='store'?['google','tripadvisor','grab','shopee']:activeCategory==='activity'?['google','tripadvisor']:Object.keys(platforms);
 function cell(row,source){
  const link=row.sources.find(s=>s.source===source),reading=row.readings[source];
  const url=safeSourceUrl(link?.source_url||reading?.source_url);
  if(!link&&!reading)return <div className="source-missing"><span>—</span><small>Chưa có liên kết</small></div>;
  return <div className="source-reading">
   {reading?.review_count!=null?<><div className="source-rating"><Icon name="star" size={15}/><strong>{reading.rating==null?'—':Number(reading.rating).toLocaleString('vi-VN')}</strong><span>/{reading.rating_max}</span></div><div className="source-review-count">{Number(reading.review_count).toLocaleString('vi-VN')} <span>đánh giá</span></div><small>{new Date(reading.captured_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small>{reading.collection_method==='ocr'&&<span className="pilot-tag">Tự động · đọc ảnh</span>}{reading.is_pilot&&<span className="pilot-tag">Dữ liệu đọc thử</span>}{reading.last_error&&<span className="pilot-tag">{statusLabel(reading.last_error)} · giữ số liệu cũ</span>}</>:<div className="source-missing"><span>—</span><small>{link?.warning?'Liên kết cần xác nhận':reading?.last_error?statusLabel(reading.last_error):source==='google'?'Chờ kết nối Google':reading?'Chờ đồng bộ đầu tiên':'Chưa kết nối thu thập'}</small></div>}
   {link?.warning&&<small className="directory-warning">{link.warning}</small>}
   {url&&!link?.warning&&<a className="source-link" href={url} target="_blank" rel="noopener noreferrer">Mở nền tảng ↗</a>}
  </div>;
 }
 return <>
  {showMetrics&&<div className="source-kpis">{[{label:'Địa điểm quản lý',value:rows.filter(r=>r.relationship==='managed').length,icon:'hotel',note:'Khách sạn, café, cửa hàng, hoạt động'},{label:'Địa điểm so sánh',value:rows.filter(r=>r.relationship==='comparison').length,icon:'link',note:'Theo dõi riêng nhóm đối thủ'},{label:'Nguồn có số liệu',value:rows.reduce((n,r)=>n+Object.values(r.readings).filter(s=>s.review_count!=null).length,0),icon:'shield',note:'Số liệu có thời điểm ghi nhận'}].map(m=><div className="source-kpi" key={m.label}><span className="icon-box blue"><Icon name={m.icon}/></span><div><small>{m.label}</small><strong>{m.value}</strong><span>{m.note}</span></div></div>)}</div>}
  <section className="card source-overview"><div className="source-heading"><div><h2>Bảng theo dõi địa điểm</h2><p>Mỗi địa điểm một dòng. Điểm và tổng đánh giá riêng của từng nền tảng.</p></div><button onClick={load} disabled={busy}>{busy?'Đang tải...':'Tải lại dữ liệu'}</button></div>
   {error&&<p className="notice error" role="alert">Không tải được đầy đủ dữ liệu: {error}</p>}
   <div className="source-toolbar"><label className="search-field"><Icon name="search"/><input aria-label="Tìm trong bảng nguồn" placeholder="Tìm địa điểm..." value={search} onChange={e=>setSearch(e.target.value)}/></label>{!fixedCategory&&<select aria-label="Loại địa điểm" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Tất cả loại địa điểm</option>{Object.entries(categories).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}{!fixedRelationship&&<select aria-label="Nhóm theo dõi" value={relationship} onChange={e=>setRelationship(e.target.value)}><option value="managed">Công ty quản lý</option><option value="comparison">Đối thủ / so sánh</option><option value="all">Tất cả nhóm</option></select>}<span>{visible.length} địa điểm</span></div>
   <div className="source-scroll"><table><thead><tr><th>Địa điểm</th>{columns.map(s=><th key={s}>{platforms[s].name}<small>Điểm gốc nền tảng</small></th>)}</tr></thead><tbody>{visible.map(p=><tr key={p.key}><th><span className="hotel-initial">{p.name.slice(0,2).toUpperCase()}</span>{p.name}<small>{categories[p.category]}{p.relationship==='comparison'?' · So sánh':''}</small></th>{columns.map(source=><td key={source}>{cell(p,source)}</td>)}</tr>)}</tbody></table></div>
   {!busy&&!visible.length&&<p>Chưa có địa điểm phù hợp bộ lọc.</p>}<p className="source-footnote">Liên kết đã đăng ký chưa đồng nghĩa với đã tự động thu thập. Ô chưa có số liệu hiển thị trạng thái kết nối; tổng review không cộng chung giữa các nguồn.</p>
  </section>
 </>;
}
