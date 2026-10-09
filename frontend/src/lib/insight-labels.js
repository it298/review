export const number=value=>value==null?'—':Number(value).toLocaleString('vi-VN');
export const signed=value=>value==null?'—':(value>0?'+':'')+number(value);
export const time=value=>value?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'—';
export const errorNames={blocked:'Nguồn chặn truy cập',network:'Lỗi kết nối',invalid_data:'Chưa xác minh được số liệu',login_required:'Yêu cầu đăng nhập',app_required:'Yêu cầu mở ứng dụng',no_public_summary:'Chưa đọc được số liệu',browser_missing:'Thiếu trình duyệt',unconfigured:'Chưa cấu hình'};
export function alertText(a){if(a.type==='rating_drop')return 'Điểm giảm '+number(-a.delta)+' · '+number(a.previous)+' → '+number(a.value)+' / '+a.rating_max;if(a.type==='count_drop')return 'Tổng '+(a.count_kind==='ratings'?'lượt chấm điểm':'đánh giá')+' giảm '+number(-a.delta)+' · '+number(a.previous)+' → '+number(a.value);if(a.type==='stale')return (a.field==='rating_at'?'Điểm':'Tổng chính xác')+' chưa cập nhật hơn 48 giờ';return (errorNames[a.error]||'Quét thất bại')+' · '+number(a.consecutive_failures)+' lần liên tiếp';}
export const insightTitles={attention:'Cần chú ý hôm nay',compare:'So sánh tốc độ tăng',evidence:'Ảnh kiểm chứng',reports:'Báo cáo'};
// Source diagnostics stay in the stored scan history, outside user notifications.
export const visibleAlerts=alerts=>(alerts||[]).filter(a=>a.type==='rating_drop'||a.type==='count_drop');
export const visibleReport=report=>report?{...report,alerts:visibleAlerts(report.alerts)}:report;
