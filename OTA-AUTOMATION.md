# Đồng bộ OTA với phương án dự phòng

Worker mới ở `worker/`, tách khỏi Web Service Node để frontend/backend hiện tại vẫn hoạt động. Worker chưa được triển khai hoặc chạy theo lịch trên máy chủ.

## Những gì đã xây

1. Đọc API/feed được cấu hình riêng từng OTA, chỉ từ HTTPS host cho phép. Chưa có quyền/API review thật của Agoda, Traveloka hoặc Trip.com; không đoán endpoint OTA.
2. Đọc DOM công khai: Agoda lấy thống kê riêng Agoda và một trang review mới; Trip.com lấy thống kê tổng hợp và thử lấy 10 review mới trong modal. Nếu modal không mở được, Trip.com chỉ cập nhật summary và không tuyên bố đã thu đủ nội dung. Traveloka chỉ chấp nhận mẫu có số riêng Traveloka khớp phần “From … reviews”. Mẫu này chưa được kiểm chứng trên trang sống vì trang bị chặn.
3. Ảnh/OCR: chụp vùng review đã biết, lưu bằng chứng trong `worker/evidence/`. OCR chưa được kiểm chứng trên ảnh thực tế; chỉ tự ghi khi điểm và số review khớp một nguồn DOM độc lập và confidence >=95. Kết quả không đủ tin cậy được giữ làm ứng viên, không công bố.
4. Email: có adapter đọc feed email đã chuẩn hóa. Chưa kết nối Gmail/Outlook, chưa có bộ phân tích mẫu email OTA thật. Muốn bật cần hộp thư được cấp quyền và bridge chuyển email sang contract bên dưới. Email thiếu tổng số/điểm tổng hợp chỉ nhập nội dung review, không cập nhật thống kê.

Worker không giải CAPTCHA, không đổi proxy/giả danh trình duyệt để vượt chặn. Nếu nguồn bị chặn, OCR không khắc phục được trang chưa mở. Kết quả lỗi giữ nguyên dữ liệu tốt trước đó và ghi lần thử/trạng thái lỗi.

## Chuẩn bị database

Project đang dùng đã có bảng pilot và summary. Chạy `supabase/ota-automation.sql` sau `ota-summary.sql` và `ota-hotel-key.sql`. Bảng `review_tracker_ota_pilot` cần tồn tại từ lần nhập pilot. Quyền đọc/ghi chỉ cấp `service_role`; secret không đưa vào frontend.

Chạy `supabase/ota-yzistel-targets.sql` để đăng ký ba nguồn YZISTEL. Targets chứa source, property_id, property_name, hotel_key và source_url đã xác minh. Cùng khách sạn dùng cùng hotel_key; không ghép dựa trên tên gần giống. Bản ghi có thể liên kết chính xác google_place_id để ghép Google Maps.

## Cấu hình chạy worker

Backend thêm `OTA_WORKER_SECRET` riêng, tối thiểu 24 ký tự. Không dùng APP_PASSWORD, không đưa secret vào Git hoặc chat.

Trong worker, sao chép `.env.example` thành `.env`, nhập cùng secret và TRACKER_API_URL. Cài dependencies và Chromium:

```bash
cd worker
npm ci
npm run install-browser
npm start
```

`npm start` chạy một lần. `npm run daemon` chạy lần đầu ngay rồi kiểm tra lại mỗi 60 phút, tối thiểu 15 phút, không có hai lượt cùng lúc trong một tiến trình. Chỉ chạy một worker daemon cho workspace. Chưa có dịch vụ worker được bật tự khởi động sau khi máy khởi động lại.

Có thể dùng scheduler trên VPS/Windows gọi `npm start` theo giờ. Máy phải bật và có mạng. Render Background Worker/Cron riêng có thể mất phí; `render.yaml` hiện tại không tạo dịch vụ trả phí tự động.

## API/feed và email contract

Cấu hình `OTA_AGODA_API_URL`, `OTA_TRAVELOKA_API_URL`, `OTA_TRIP_API_URL` (hoặc biến EMAIL_URL), optional TOKEN và danh sách OTA_FEED_ALLOWED_HOSTS. Feed phải trả JSON, không chuyển hướng, giữ source/propertyId chính xác:

```json
{
  "source": "traveloka",
  "propertyId": "9000005722460",
  "capturedAt": "THỜI ĐIỂM QUAN SÁT THẬT THEO ISO 8601",
  "summary": {"rating": 9.7, "ratingMax": 10, "count": 243},
  "reviews": []
}
```

Số trong ví dụ chỉ minh họa contract, không phải số liệu Traveloka đã kiểm chứng. Feed phải dùng quan sát không quá 24 giờ, không dùng bản lưu tìm kiếm như dữ liệu hiện tại. Nội dung review cần reviewId chính thức, rating, reviewedAt (YYYY-MM-DD), content; author/title/response tùy chọn. Tối đa 50 review mỗi payload và 512KB. Lưu theo ID riêng từng nguồn, cập nhật lặp không tạo bản trùng.

Kết quả có summary được lưu thêm một snapshot/ngày theo giờ Việt Nam. Email chỉ có review không ghi đè snapshot tổng hợp. Quan sát đến trễ không thay thế quan sát mới hơn.

## Thử nghiệm Windows ngày 08/10/2026

Đã cài Chromium và chạy worker trực tiếp với `node --env-file=.env src/run.js --dry-run`. Trip.com đọc được 9,5/10 và 372 đánh giá; một lượt lấy 10 review, lượt tiếp theo chỉ lấy được summary (modal chưa ổn định). Agoda chưa đọc được summary riêng nguồn bằng worker mới; bộ lọc chưa truy cập được. OCR ảnh Agoda đã chạy nhưng độ tin cậy thấp nên không nhập. Traveloka chưa đọc được dữ liệu xác minh. API/feed email chưa cấu hình nên adapter báo unconfigured. Đây là lượt thử không ghi Supabase.

Database đã tạo targets cho ba nguồn YZISTEL cùng hotel_key. Kiểm tra kết nối worker/backend hiện trả 401: chưa triển khai mã backend mới và chưa nhập OTA_WORKER_SECRET trên Render. Chưa bật tiến trình theo lịch. Windows có script `Start-Worker.ps1` kiểm tra xác thực trước khi khởi động tiến trình ẩn chạy mỗi giờ.

## Kiểm chứng

15 test backend và 4 test worker đạt. Node tests và PostgreSQL WASM kiểm tra fallback API lỗi sang DOM; OCR chưa đối chiếu bị từ chối; số review nhiều nguồn bị từ chối; lỗi giữ số cũ; nhập lặp giữ một review và một snapshot/ngày; quyền anon bị từ chối; dữ liệu đến trễ bị bỏ qua. Chưa triển khai worker trên Render, chưa tự ghi kết quả worker vào Supabase. Các lần đọc Agoda/Trip.com bằng trình duyệt trước đây là pilot riêng, không chứng minh worker tự động chạy ổn định.
