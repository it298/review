# Deploy Render + Supabase (2.2)

Một Docker Web Service phục vụ giao diện React, API Express và Chromium. Không cần Browserless hoặc Vercel. Supabase giữ nguyên dữ liệu và schema đã chạy; không chạy lại hay xóa project khi đổi hosting.

## Tạo dịch vụ

Push mã nguồn mới lên https://github.com/it298/review.

Mở https://dashboard.render.com → New → Blueprint → kết nối GitHub → chọn it298/review. Render đọc render.yaml ở thư mục gốc. Template chọn Free; kiểm tra plan trước khi xác nhận. Nhập SUPABASE_SECRET_KEY trực tiếp khi được yêu cầu, không gửi vào chat/GitHub. APP_PASSWORD và CRON_SECRET được Render tạo tự động; xem trong Environment sau khi tạo service.

Nếu tạo bằng New → Web Service: chọn repository, branch main, language/runtime Docker, Dockerfile ./Dockerfile, Docker context thư mục gốc, health check /api/health. Không nhập build/start command của Vercel.

Environment Variables:

| Tên | Giá trị |
| --- | --- |
| SUPABASE_URL | https://atbumgsilrmrlmbwbowp.supabase.co |
| SUPABASE_SECRET_KEY | Secret key sb_secret_... từ Supabase Settings → API Keys |
| APP_PASSWORD | Mật khẩu truy cập ít nhất 16 ký tự |
| CRON_SECRET | Chuỗi ngẫu nhiên dài, khác APP_PASSWORD |
| TIMEZONE | Asia/Ho_Chi_Minh |

Có thể dùng SUPABASE_SERVICE_ROLE_KEY thay SUPABASE_SECRET_KEY nếu dùng JWT legacy. Không dùng publishable/anon key. Không đặt BROWSERLESS_TOKEN, BROWSERLESS_URL hoặc VITE_API_URL.

## Kiểm tra sau deploy

Đợi status Live → mở URL .onrender.com → đăng nhập bằng APP_PASSWORD → thêm một địa điểm Google Maps → kiểm tra review/sao → cập nhật và tải CSV. Health check chỉ xác nhận server đang chạy; không xác nhận Supabase hoặc Google Maps kết nối thành công.

Free service có thể ngủ khi không hoạt động; mở lần đầu cần đợi khởi động. Chromium cần bộ nhớ; nếu logs có lỗi hết RAM, giảm tải hoặc cân nhắc plan có RAM cao hơn. Không tự nâng plan trả phí trong template.

## Đồng bộ theo lịch

Giữ workflow .github/workflows/review-sync.yml. API xử lý các đợt tối đa 3 địa điểm, một Chromium tại một thời điểm. Không thêm timer trong web service để tránh bỏ lỡ khi service ngủ.

GitHub repository → Settings → Secrets and variables → Actions:

- Variable DEPLOYMENT_URL: URL Render mới (https://...onrender.com), thay URL Vercel nếu đã cấu hình.
- Secret CRON_SECRET: cùng giá trị trong Render.

Lịch thứ Hai khoảng 02:00 giờ Việt Nam; GitHub có thể chạy trễ. Actions → Sync Google Maps reviews → Run workflow để thử. Nút cập nhật trong app tự chạy các đợt tiếp theo khi trang còn mở. Không retry scrape lỗi tự động.

## Chạy Docker local

Copy .env.example thành .env và nhập secret tại máy.

```sh
docker build -t review-tracker .
docker run --rm --env-file .env -p 10000:10000 review-tracker
```

Mở http://localhost:10000. Không cần ổ đĩa persistent trên Render: toàn bộ dữ liệu nghiệp vụ và trạng thái job lưu ở Supabase. Không đổi TIMEZONE khi đã có dữ liệu trừ khi chủ động đổi cách nhóm ngày.
