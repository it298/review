import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/api.js';
import {platforms} from '../lib/directory.js';
import Icon from './Icon.jsx';
const localTime=date=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
export default function ManualSummary({locations,initial,onClose,onSaved}){
 const dialog=useRef(null),request=useRef(null);
 const [entity,setEntity]=useState(initial.entityKey||locations[0]?.entity_key||'');
 const place=locations.find(r=>r.entity_key===entity);
 const [source,setSource]=useState(initial.source||place?.sources[0]?.source||'google');
 const [rating,setRating]=useState(''),[count,setCount]=useState(''),[captured,setCaptured]=useState(()=>localTime(new Date())),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const node=dialog.current;node.showModal();return()=>node.close();},[]);
 function choose(value){setEntity(value);const next=locations.find(r=>r.entity_key===value);if(!next?.sources.some(s=>s.source===source))setSource(next?.sources[0]?.source||'google');setRating('');setCount('');setError('');}
 async function save(e){e.preventDefault();setError('');if(rating===''&&count===''){setError('Nhập điểm hoặc tổng đánh giá.');return;}setBusy(true);
  try{const payload={entityKey:entity,source,rating:rating===''?null:Number(rating.replace(',','.')),reviewCount:count===''?null:Number(count),capturedAt:new Date(captured).toISOString(),note};
   const fingerprint=JSON.stringify(payload);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,id:crypto.randomUUID()};
   await api('/api/manual-summary',{method:'POST',body:JSON.stringify({...payload,requestId:request.current.id})});await onSaved();window.dispatchEvent(new Event('insights-updated'));onClose();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <dialog ref={dialog} className="manual-entry-dialog" aria-labelledby="manual-entry-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <form onSubmit={save}><header><div><h2 id="manual-entry-title">Nhập số liệu thủ công</h2><p>Ghi lại điểm và tổng đang hiển thị trên nền tảng.</p></div><button type="button" className="manual-close" aria-label="Đóng nhập thủ công" disabled={busy} onClick={onClose}>×</button></header>
   <div className="manual-entry-body"><label>Địa điểm<select aria-label="Địa điểm nhập thủ công" value={entity} disabled={busy} onChange={e=>choose(e.target.value)}>{locations.map(r=><option key={r.entity_key} value={r.entity_key}>{r.name}</option>)}</select></label>
    <label>Nền tảng<select aria-label="Nền tảng nhập thủ công" value={source} disabled={busy} onChange={e=>{setSource(e.target.value);setRating('');setCount('');setError('');}}>{place?.sources.map(s=><option key={s.source} value={s.source}>{platforms[s.source]?.name}</option>)}</select></label>
    <div className="manual-entry-values"><label>Điểm / {platforms[source]?.scale}<input aria-label="Điểm nhập thủ công" type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" placeholder={platforms[source]?.scale===10?'Ví dụ: 9,3':'Ví dụ: 4,7'} disabled={busy} value={rating} onChange={e=>{setRating(e.target.value);setError('');}}/></label><label>{['grab','shopee'].includes(source)?'Tổng lượt chấm điểm':'Tổng đánh giá'}<input aria-label="Tổng nhập thủ công" type="number" min="0" max="9007199254740991" step="1" placeholder="Ví dụ: 177" disabled={busy} value={count} onChange={e=>{setCount(e.target.value);setError('');}}/></label></div>
    <small>Bỏ trống ô không nhập. Ô đó sẽ giữ số liệu đã có.</small>
    <label>Thời điểm ghi nhận<input aria-label="Thời điểm ghi nhận thủ công" type="datetime-local" required max={localTime(new Date())} min={localTime(new Date(Date.now()-365*86400000))} disabled={busy} value={captured} onChange={e=>{setCaptured(e.target.value);setError('');}}/></label>
    <label>Ghi chú <span>(tuỳ chọn)</span><textarea aria-label="Ghi chú nhập thủ công" maxLength="500" rows="2" placeholder="Ví dụ: đọc trực tiếp trên trang khách sạn" disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label>
    {error&&<p className="notice error" role="alert">{error}</p>}
   </div><footer><button type="button" className="secondary" disabled={busy} onClick={onClose}>Huỷ</button><button type="submit" className="primary" disabled={busy}><Icon name="check" size={16}/>{busy?'Đang lưu…':'Lưu số liệu'}</button></footer>
  </form>
 </dialog>;
}
