// Fixed diagnostics only. Never put raw provider messages, authorization codes or credentials in redirects.
export const GA4_OAUTH_ERRORS={
 configuration:'Cấu hình OAuth của backend chưa hợp lệ. Kiểm tra Client ID, Client Secret, callback, FRONTEND_URL và khóa mã hóa.',
 state:'Phiên cấp quyền đã hết hạn hoặc đã dùng. Đóng trang Google cũ và bấm Kết nối Google Analytics lại từ phần mềm.',
 token_exchange:'Google chưa đổi được mã cấp quyền thành token. Kiểm tra Client ID/Secret và callback trên Render trùng với cùng OAuth Client trong Google Cloud.',
 invalid_client:'Google không chấp nhận Client ID/Client Secret. Kiểm tra cặp thông tin trên Render thuộc cùng một OAuth Client; không dán tên biến, URL hoặc khoảng trắng vào giá trị.',
 invalid_grant:'Google từ chối mã cấp quyền. Bấm Kết nối Google Analytics để bắt đầu phiên mới; callback trong Google Cloud và Render phải trùng nhau.',
 permission:'Google chưa cấp đủ quyền đọc Analytics hoặc refresh token. Kết nối lại và đồng ý quyền xem Analytics.',
 lock:'Đang có thao tác cập nhật kết nối Analytics. Chờ một lúc rồi kết nối lại.',
 storage:'Đã nhận token Google nhưng chưa lưu được kết nối vào Supabase. Kiểm tra hàm review_tracker_marketing_set trong supabase/marketing-module.sql và quyền backend.'
};
