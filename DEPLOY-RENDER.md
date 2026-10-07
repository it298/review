# Render 3.0 — Frontend Static + Backend Node

## Chuẩn bị

Push bản mới lên it298/review. Chạy lại supabase/schema.sql mới. Thiết lập Google Cloud và API access theo [GOOGLE-SETUP.md](GOOGLE-SETUP.md). Quyền quản lý khách sạn riêng lẻ chưa đủ để API hoạt động.

## Backend — Web Service

Render Dashboard → New → Web Service → chọn it298/review, branch main.

| Trường | Giá trị |
| --- | --- |
| Runtime / Language | Node |
| Root Directory | backend |
| Build Command | npm ci |
| Start Command | npm start |
| Health Check Path | /api/health |

Nếu backend cũ là Docker, tạo Web Service Node mới; không dùng Dockerfile đã xóa. Giữ dịch vụ cũ cho đến khi bản mới kiểm tra xong nếu cần; mã nguồn không tự xóa dịch vụ trên Render.

Environment backend:

| Tên | Giá trị |
| --- | --- |
| NODE_VERSION | 24 |
| SUPABASE_URL | https://atbumgsilrmrlmbwbowp.supabase.co |
| SUPABASE_SECRET_KEY | Secret key Supabase (chỉ server) |
| APP_PASSWORD | Mật khẩu ứng dụng ít nhất 16 ký tự |
| CRON_SECRET | Chuỗi ngẫu nhiên dài, khác APP_PASSWORD |
| TOKEN_ENCRYPTION_KEY | Base64 của 32 byte ngẫu nhiên |
| GOOGLE_CLIENT_ID | OAuth Web Client ID |
| GOOGLE_CLIENT_SECRET | OAuth Web Client secret |
| GOOGLE_REDIRECT_URI | https://URL-BACKEND/api/google/callback |
| CORS_ORIGIN | URL frontend, không có dấu / cuối |
| FRONTEND_URL | URL frontend để quay về sau OAuth |
| TIMEZONE | Asia/Ho_Chi_Minh |

GOOGLE_REDIRECT_URI có thể bỏ trống trên Render: backend tự dùng RENDER_EXTERNAL_URL + /api/google/callback. FRONTEND_URL có thể bỏ trống nếu CORS_ORIGIN chỉ chứa một URL frontend. Nếu chưa có OAuth client, service vẫn khởi động với cấu hình Supabase/APP_PASSWORD/CRON_SECRET/CORS_ORIGIN; màn hình kết nối Google sẽ báo chưa cấu hình.

Nếu chưa có frontend URL, tạm đặt CORS_ORIGIN=http://localhost:5173, rồi cập nhật khi tạo Static Site.

## Frontend — Static Site

New → Static Site → chọn cùng repository.

| Trường | Giá trị |
| --- | --- |
| Root Directory | frontend |
| Build Command | npm ci && npm run build |
| Publish Directory | dist |
| NODE_VERSION | 24 |
| VITE_API_URL | URL Web Service Node mới |

Redirects/Rewrites: /* → /index.html → Rewrite. Đổi VITE_API_URL cần build/redeploy Static Site. Frontend không chứa Client secret, token Google hoặc secret Supabase.

## Blueprint thay cho tạo thủ công

render.yaml tạo hotel-review-tracker-api-gbp (Node) và hotel-review-tracker-ui (Static). Các URL API/CORS được tham chiếu bằng RENDER_EXTERNAL_URL. Kiểm tra Environment sau khi sync; nếu URL chưa được điền, sync lại hoặc nhập URL thực tế rồi redeploy. Khi dùng custom domain, cập nhật URL tương ứng và OAuth redirect URI trong Google Cloud.

## Kiểm tra và lịch

Hai dịch vụ Live → mở frontend → Địa điểm → Kết nối Google → chọn khách sạn → Thêm và lấy dữ liệu → Dashboard cập nhật/xuất CSV. Health chỉ kiểm tra server, không chứng minh Google API đã được duyệt hay Supabase kết nối thành công.

GitHub repository Settings → Secrets and variables → Actions: Variable DEPLOYMENT_URL là URL backend Node mới; Secret CRON_SECRET cùng giá trị ở backend. Workflow Sync Google Maps reviews gọi API từng đợt tối đa 10 địa điểm, lịch thứ Hai khoảng 02:00 giờ Việt Nam (GitHub có thể chạy trễ). Chạy Run workflow để thử sau khi kết nối Google.

Free Web Service có thể ngủ khi không hoạt động và cần thời gian khởi động. API bị từ chối/thu hồi quyền hoặc token hết hạn sẽ báo lỗi từng khách sạn; snapshot trước đó được giữ. Địa điểm cũ cần được liên kết qua giao diện trước khi đồng bộ bằng Business Profile API.
