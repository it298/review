# Hotel Review Tracker 1.2

Ứng dụng nội bộ theo dõi tổng review và điểm sao Google Maps bằng React, Express và Playwright. Dữ liệu lưu trong backend/data/places.json.

## Chạy trên Windows

Cần Node.js 24 và kết nối Internet.

Terminal 1:

```powershell
cd backend
Copy-Item .env.example .env
npm ci
npm run install-browser
npm start
```

Terminal 2:

```powershell
cd frontend
npm ci
npm run dev
```

Mở http://localhost:5173. Thêm URL trang chi tiết Google Maps hoặc URL chia sẻ maps.app.goo.gl. Các miền được hỗ trợ: google.com, google.com.vn, maps.google.com, maps.google.com.vn và biến thể www tương ứng.

## Bản nâng cấp

- Ngày snapshot và lịch cron theo TIMEZONE, mặc định Asia/Ho_Chi_Minh. Lịch mặc định thứ Hai 02:00; ứng dụng phải đang chạy. Muốn ghi mỗi ngày: UPDATE_CRON=0 2 * * *.
- Không biến điểm thiếu thành 0, không dùng số review rút gọn như 1.2K làm số chính xác.
- Hàng đợi chung cho thêm địa điểm và đồng bộ; tối đa 5 trang, tối đa 50 yêu cầu chờ. Cấu hình worker sai dùng mặc định 3.
- Giữ tên tùy chọn qua lần đồng bộ; đổi tên, xóa địa điểm kèm lịch sử, hiển thị lần cập nhật thành công và lỗi gần nhất.
- Nhận diện trùng qua CID/place ID khi URL chứa ID; URL thiếu ID vẫn có thể trùng và cần kiểm tra thủ công.
- Dashboard có lỗi theo địa điểm và xuất CSV UTF-8 cho Excel. Ô trống nghĩa là không có snapshot hoặc chưa đọc được điểm.
- Một snapshot/ngày; cập nhật trong ngày ghi đè. Dữ liệu cũ được nhóm theo thời điểm thực tế tại TIMEZONE; không thể khôi phục snapshot đã bị bản cũ ghi đè.

## Kiểm tra

```powershell
cd backend
npm test
cd ../frontend
npm run build
```

Backend mặc định chỉ nghe 127.0.0.1. Chưa có đăng nhập; chỉ dùng nội bộ trên máy. Nếu cần truy cập từ máy khác phải bổ sung xác thực và reverse proxy. Bản build frontend dùng VITE_API_URL (cấu hình trước khi build), hoặc reverse proxy /api đến backend; proxy hiện tại chỉ dành cho dev.

Scraper phụ thuộc giao diện Google Maps, có thể thất bại khi yêu cầu xác minh. Lỗi không ghi snapshot mới; dữ liệu trước đó được giữ. Kiểm thử tự động không chứng minh scrape Google Maps ngoài thực tế luôn thành công.

## Dữ liệu

Sao lưu backend/data/places.json khi backend đã dừng. Chỉ chạy một tiến trình backend trên một file JSON. Không đổi TIMEZONE sau khi đã dùng trừ khi muốn đổi cách nhóm ngày lịch sử.

API: GET /api/places, POST /api/places/track, PATCH /api/places/:id (name), DELETE /api/places/:id, GET /api/places/:id/history, GET /api/places/dashboard-matrix, POST /api/places/sync.

Chỉ số reviewsSinceBaseline là chênh lệch từ snapshot gần nhất cách ít nhất 7 ngày; comparisonCapturedAt chỉ rõ mốc, không khẳng định là số review mới chính xác trong 7 ngày.
