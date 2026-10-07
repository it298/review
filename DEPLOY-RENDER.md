# Render 2.3 — Static Site + Web Service

Frontend và backend nằm trong thư mục riêng, chạy trên hai dịch vụ và hai domain. Supabase vẫn giữ dữ liệu; schema đã chạy không cần chạy lại. Không cần Browserless.

## Cách 1: Blueprint

Push mã nguồn mới lên https://github.com/it298/review. Render Dashboard → New → Blueprint → chọn repository, file render.yaml.

Blueprint tạo:

- hotel-review-tracker-ui: Static Site, rootDir frontend, npm ci && npm run build, publish dist.
- hotel-review-tracker-api: Docker Web Service, rootDir backend, Dockerfile ./Dockerfile, context ., health /api/health.

Nhập SUPABASE_SECRET_KEY trực tiếp khi được yêu cầu. APP_PASSWORD và CRON_SECRET được tạo tự động, xem ở Environment của backend.

VITE_API_URL của frontend tham chiếu RENDER_EXTERNAL_URL của backend. CORS_ORIGIN của backend tham chiếu RENDER_EXTERNAL_URL của frontend. Dùng URL công khai https://...onrender.com, không dùng hostname private network. Sau khi Blueprint sync xong, kiểm tra hai biến này trong Environment; nếu chưa được điền, sync lại hoặc nhập URL thực tế và redeploy. Với custom domain, cập nhật các giá trị theo domain sử dụng.

Template chọn Free cho backend; kiểm tra plan trước khi xác nhận. Nếu đã tạo dịch vụ gộp hotel-review-tracker từ bản 2.2, Blueprint này tạo hai dịch vụ mới với tên khác, không tự xóa dịch vụ cũ.

## Cách 2: Tạo thủ công

### Backend — Web Service

New → Web Service → chọn it298/review, branch main:

| Trường | Giá trị |
| --- | --- |
| Runtime / Language | Docker |
| Root Directory | backend |
| Dockerfile Path | ./Dockerfile |
| Docker Build Context | . |
| Health Check Path | /api/health |

Environment của backend:

| Tên | Giá trị |
| --- | --- |
| SUPABASE_URL | https://atbumgsilrmrlmbwbowp.supabase.co |
| SUPABASE_SECRET_KEY | Secret key sb_secret_... trong Supabase Settings → API Keys |
| APP_PASSWORD | Mật khẩu ứng dụng ít nhất 16 ký tự |
| CRON_SECRET | Chuỗi ngẫu nhiên dài, khác APP_PASSWORD |
| TIMEZONE | Asia/Ho_Chi_Minh |
| CORS_ORIGIN | URL Static Site công khai, không có dấu / cuối |

Có thể dùng SUPABASE_SERVICE_ROLE_KEY thay secret mới. Không dùng publishable/anon key. Nếu tạo backend trước khi biết URL frontend, tạm dùng http://localhost:5173 cho CORS_ORIGIN rồi cập nhật URL Static Site sau.

### Frontend — Static Site

New → Static Site → chọn cùng repository:

| Trường | Giá trị |
| --- | --- |
| Root Directory | frontend |
| Build Command | npm ci && npm run build |
| Publish Directory | dist |
| NODE_VERSION | 24 |
| VITE_API_URL | URL Web Service backend, dạng https://...onrender.com |

Redirects/Rewrites: source /* → destination /index.html → action Rewrite.

Frontend chỉ có URL API, không có khóa Supabase, APP_PASSWORD hoặc CRON_SECRET. VITE_API_URL được nhúng lúc build; đổi biến này cần build/redeploy Static Site. Đổi CORS_ORIGIN cần redeploy backend.

## Kiểm tra

Đợi hai dịch vụ Live. Mở URL frontend → đăng nhập APP_PASSWORD → thêm URL Google Maps → kiểm tra số review/sao, cập nhật và xuất CSV. URL backend chỉ trả JSON API. /api/health không kiểm tra Supabase hoặc Google Maps.

Nếu browser báo lỗi CORS hoặc Failed to fetch, kiểm tra VITE_API_URL, CORS_ORIGIN và trạng thái Web Service. Free backend có thể ngủ và cần thời gian khởi động; Chromium cần RAM, xem logs khi thiếu bộ nhớ. Template không tự nâng plan trả phí.

## Lịch đồng bộ

GitHub Settings → Secrets and variables → Actions:

- Variable DEPLOYMENT_URL: URL Web Service backend, không phải Static Site.
- Secret CRON_SECRET: cùng giá trị ở backend.

Workflow Sync Google Maps reviews xử lý các đợt API đến khi hoàn tất; lịch thứ Hai khoảng 02:00 giờ Việt Nam, có thể trễ theo GitHub. Nút cập nhật cũng tự gọi các đợt tiếp theo khi trang còn mở.

## Docker backend local

Trong backend/: docker build -t review-api . rồi docker run --rm --env-file .env -p 10000:10000 review-api. Giao diện được chạy/build riêng trong frontend/.
