// Only expose allowlisted messages. Provider errors can contain URLs and credentials.
export function bluejayPublicError(error,fallback){
 if(error?.code==='BLUEJAY_WINDOW')return {code:'BLUEJAY_WINDOW',message:'Blue Jay từ chối vì ngoài khung giờ API. Thử lại trong 08:00–08:30, 16:00–16:59 hoặc 00:00–00:59 giờ Việt Nam. Chưa có bản lưu đúng kỳ để hiển thị.'};
 if(error?.code==='BLUEJAY_RANGE')return {code:'BLUEJAY_RANGE',message:'Blue Jay từ chối khoảng ngày báo cáo. Chọn kỳ ngắn hơn rồi thử lại.'};
 if(error?.status===503)return {code:'BLUEJAY_NOT_CONFIGURED',message:'Chưa cấu hình BLUEJAY_API_KEY trên backend Render.'};
 if([401,403].includes(error?.status))return {code:'BLUEJAY_ACCESS_DENIED',message:'Blue Jay từ chối khóa API hoặc quyền truy cập khách sạn. Kiểm tra khóa và quyền trên backend.'};
 if(error?.name==='TimeoutError'||error?.name==='AbortError'||['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code))return {code:'BLUEJAY_TIMEOUT',message:'Kết nối Blue Jay hoặc kho báo cáo quá thời gian chờ. Thử lại sau.'};
 if(error?.code==='BLUEJAY_PROVIDER')return {code:'BLUEJAY_PROVIDER',message:'Blue Jay trả lỗi thay vì dữ liệu đặt phòng. Kiểm tra khung giờ API và quyền truy cập; chưa có bản lưu đúng kỳ.'};
 return {code:'BLUEJAY_REPORT_UNAVAILABLE',message:fallback};
}
