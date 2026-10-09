# Booking.com Extranet: điểm tổng và tổng đánh giá

Đã kiểm chứng ngày 09/10/2026 trong phiên đăng nhập do người dùng lưu: **Vistara Gia Lai Sea Hotel**, Extranet ID **17212594**, URL công khai `https://www.booking.com/hotel/vn/vistara-gia-lai-sea.html`. Đối chiếu đúng dòng `vistara-gia-lai-sea-hotel` trong thư mục StayScope. Lượt đọc thật lúc 14:09:35 (Việt Nam): **10/10, 2 đánh giá**. Chưa xác nhận quyền Booking của các khách sạn còn lại.

Trang Reviews hiện cung cấp thống kê trong HTML; chưa quan sát thấy JSON thống kê riêng. Worker đọc thẻ `.overall-review-score` với nhãn `Điểm đánh giá của Quý vị` và `dựa trên … đánh giá`, không đọc điểm của từng khách hoặc điểm hạng mục, không cần F12/OCR. Không tự tính lại điểm trung bình; giữ điểm nền tảng hiển thị.

## Đăng nhập

Tại thư mục dự án:

```bash
node --env-file=worker/.env worker/src/open-extranet-login.js --source=booking
```

Người dùng tự đăng nhập và nhập OTP nếu có, mở đánh giá, đóng Chromium. Phiên chỉ lưu tại `worker/extranet-profiles/booking/`, bị loại khỏi Git. Không chạy hai tiến trình dùng profile này cùng lúc. Worker không lưu hay gửi mật khẩu, cookie, token phiên, URL có tham số `ses`, thông tin khách hoặc đặt phòng lên backend.

## Triển khai

1. Áp dụng `supabase/booking-extranet.sql` sau các migration thư mục/nguồn công khai/lịch sử. Migration có thể chạy lại; chỉ gắn ID đã kiểm chứng với đúng URL và dòng khách sạn, không tự đăng ký khách sạn theo tên gần giống.
2. Triển khai backend chứa `/api/booking/worker/targets` và `/api/booking/worker/results`. Dùng secret worker hiện có, không đưa secret vào frontend.
3. Khi backend mới đã Live, cấu hình trong **worker/.env trên Windows**:

```dotenv
BOOKING_EXTRANET_ENABLED=true
BOOKING_EXTRANET_PROPERTY_IDS=17212594
```

4. Kiểm tra một lượt trong thư mục `worker/`:

```bash
node --env-file=.env src/booking-run.js --property=17212594
```

Chỉ `status:success,saved:true` xác nhận backend đã nhận. `--dry-run` chỉ đọc và lưu bằng chứng trên máy, không ghi cơ sở dữ liệu. Tùy chọn `--targets-file` chỉ dùng được với dry-run để thử trước khi backend được triển khai.

5. Khởi động lại daemon chính để nhận cấu hình mới:

```bash
node --env-file=.env src/run.js --daemon
```

Daemon chạy Booking rồi các nguồn hiện có; nghỉ 60 phút sau mỗi chu kỳ theo `OTA_INTERVAL_MINUTES` (tối thiểu 15). Máy Windows phải bật, có mạng và giữ tiến trình. Không chạy `booking-run.js` đồng thời với một lượt Booking của daemon.

## Kiểm soát dữ liệu

- Trước khi đọc: kiểm tra host/route Reviews, đúng `hotel_id`, URL công khai trên trang chủ khớp URL đã đăng ký và không có bộ lọc đánh giá.
- Backend và SQL xác nhận lại ID Extranet đã gắn với đúng entity/URL. Không giả danh trang công khai bằng URL Extranet.
- Ghi đúng cột Booking của dòng khách sạn hiện có; giữ lịch sử từng đợt và timestamp quan sát thực tế.
- Lượt đến trễ không ghi đè số mới. Hết phiên đăng nhập, lỗi mạng, đổi giao diện hay thẻ tổng không hợp lệ: giữ số cũ, không thay bằng 0.
- Khi Booking Extranet được bật, daemon mới bỏ quét công khai Booking của các entity đã chọn để tránh hai bộ đọc ghi đè nhau. Các khách sạn chưa có cấu hình vẫn dùng bộ đọc cũ.
- Ảnh chỉ chụp thẻ thống kê, JSON chỉ chứa payload thống kê đã chuẩn hóa; lưu trong thư mục bằng chứng trên máy. Chưa tích hợp ảnh Booking Extranet vào kho ảnh đám mây.

Thay đổi nguồn/phạm vi điểm so với dữ liệu công khai trước đó có thể tạo chênh lệch; chưa có baseline riêng cho hai phạm vi trong biểu đồ. Không diễn giải chênh lệch lúc chuyển nguồn thành đánh giá bị xóa hoặc số review mới.
