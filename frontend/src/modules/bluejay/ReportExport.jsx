import {useState} from 'react';
import './report-export.css';
export default function ReportExport({getReport,label,disabled=false}){
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 async function run(format){setBusy(format);setError('');try{const report=getReport(),{exportBluejayReport}=await import('./report-export.js');await exportBluejayReport(report,format);}catch(e){setError('Không xuất được báo cáo: '+e.message);}finally{setBusy('');}}
 return <div className="bj-report-export"><div className="bj-report-buttons" role="group" aria-label={'Xuất báo cáo '+label}><button className="secondary" disabled={disabled||!!busy} onClick={()=>run('excel')}>{busy==='excel'?'Đang xuất Excel…':'Xuất Excel '+label}</button><button className="primary" disabled={disabled||!!busy} onClick={()=>run('pdf')}>{busy==='pdf'?'Đang xuất PDF…':'Xuất PDF ngang '+label}</button></div><small>Xuất dữ liệu đã tải và bộ lọc đang xem · PDF có biểu đồ & bảng chi tiết.</small>{error&&<p role="alert" className="error">{error}</p>}</div>;
}
