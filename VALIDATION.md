# Kết quả kiểm tra bản 1.2

Ngày kiểm tra: 07/10/2026. Runtime: Node.js 24.21.0.

- Backend: 7/7 test pass (điểm sao thiếu, ngày Việt Nam, URL chính thức, giới hạn worker, nhận diện CID, số đếm chính xác, ghi đè snapshot và xóa dữ liệu).
- Kiểm tra cú pháp tất cả file JavaScript backend: pass.
- Frontend: Vite production build pass, với configLoader native.
- Kiểm tra API trên backend thật với dữ liệu thử riêng: health, ngày ma trận theo giờ Việt Nam, từ chối URL giả, 404 cho địa điểm không tồn tại, đổi tên, xóa lịch sử, đồng bộ danh sách rỗng: pass.

Chưa kiểm chứng scrape một địa điểm Google Maps thật hoặc kiểm tra giao diện bằng trình duyệt. Browser Chromium cần được cài bằng npm run install-browser trước khi thêm địa điểm. Chưa có đăng nhập; backend mặc định chỉ truy cập trên máy chạy ứng dụng.
