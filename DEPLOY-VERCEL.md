# Triển khai bản cloud 2.0 trên Vercel

Giao diện và API đều chạy trong một Vercel project. Không cần VPS. Lưu dữ liệu bằng Upstash Redis và mở Chromium qua Browserless CDP. Đây là hai dịch vụ riêng, cần kiểm tra hạn mức và chi phí của tài khoản.

## 1. Tạo dịch vụ

Upstash: https://console.upstash.com/ → tạo Redis database → lấy REST URL và REST TOKEN có quyền ghi (không dùng token read-only).

Browserless: https://www.browserless.io/ → lấy API token và CDP endpoint cho Chromium. Endpoint mặc định: wss://production-sfo.browserless.io/chromium. Không dùng endpoint /playwright với connectOverCDP.

## 2. Import GitHub vào Vercel

Mở https://vercel.com/new → import it298/review.

- Root Directory: giữ thư mục gốc (không chọn frontend).
- Framework Preset: Other.
- Node.js: 24.x.
- Build Command: npm run build.
- Output Directory: frontend/dist.
- Fluid Compute: bật, để API có thời gian tối đa 300 giây như vercel.json.
- Không đặt VITE_API_URL: giao diện và API dùng cùng domain.

Thêm Environment Variables cho Production (và Preview nếu cần thử):

| Biến | Giá trị |
| --- | --- |
| UPSTASH_REDIS_REST_URL | REST URL từ Upstash |
| UPSTASH_REDIS_REST_TOKEN | REST token có quyền ghi |
| BROWSERLESS_TOKEN | API token Browserless |
| BROWSERLESS_URL | CDP endpoint Chromium của tài khoản |
| APP_PASSWORD | Mật khẩu ngẫu nhiên dài ít nhất 16 ký tự |
| CRON_SECRET | Chuỗi ngẫu nhiên dài, khác mật khẩu ứng dụng |
| TIMEZONE | Asia/Ho_Chi_Minh |
| REDIS_PREFIX | review-tracker-production |

Không đưa token vào Git/chat. Không thêm tiền tố VITE_ cho secret. Dùng Redis riêng hoặc REDIS_PREFIX khác cho Preview để không ảnh hưởng dữ liệu Production.

Deploy, mở URL, đăng nhập bằng APP_PASSWORD, thêm một URL Google Maps thật và kiểm tra snapshot. /api/health chỉ xác nhận API chạy; chưa chứng minh các dịch vụ đã kết nối.

## 3. Lịch cập nhật đầy đủ

Mỗi lần gọi API xử lý tối đa 3 địa điểm, từng địa điểm một. Nút cập nhật trên dashboard tự gọi các đợt tiếp theo khi trang còn mở. Không tự retry scrape lỗi; các lỗi được hiển thị theo địa điểm.

Workflow .github/workflows/review-sync.yml gọi các đợt API đến khi hoàn tất, mặc định thứ Hai khoảng 02:00 giờ Việt Nam (19:00 UTC Chủ Nhật; GitHub có thể chạy trễ). Toàn bộ API và scraper điều phối vẫn chạy trên Vercel; GitHub Actions chỉ gửi request theo lịch.

Sau khi deploy, vào GitHub repository Settings → Secrets and variables → Actions:

- Variable DEPLOYMENT_URL: URL Production Vercel, dạng https://your-app.vercel.app.
- Secret CRON_SECRET: cùng giá trị đã nhập trong Vercel.

Nếu Vercel Deployment Protection chặn Production, workflow cần cấu hình quyền bypass phù hợp hoặc tắt bảo vệ deployment cho Production để API có thể nhận request; dữ liệu vẫn được bảo vệ bằng APP_PASSWORD và CRON_SECRET. Preview có thể giữ bảo vệ.

Vào Actions → Sync Google Maps reviews → Run workflow để thử. Workflow giới hạn 100 đợt và 50 phút, báo lỗi khi có địa điểm scrape thất bại. Chạy lại để tiếp tục phiên chưa hoàn tất (phiên được lưu 24 giờ).

## Giới hạn và dữ liệu

Không tự chuyển file JSON local lên cloud. Dữ liệu cloud bắt đầu rỗng; giữ file JSON cũ làm bản sao lưu. Không đổi TIMEZONE sau khi dùng.

Redis dùng một document JSON và script Lua cập nhật nguyên tử để tránh ghi đè giữa các instance. Phù hợp công cụ nhỏ; dữ liệu lớn cần chuyển sang cơ sở dữ liệu có truy vấn và phân trang. Khóa phân tán giới hạn một phiên Chromium; khi có thao tác khác đang dùng, đồng bộ chờ đợt sau.

Google Maps vẫn có thể yêu cầu xác minh hoặc thay DOM; Browserless không bảo đảm scrape thành công. Kiểm tra thêm/xóa/đổi tên, xuất CSV và cập nhật bằng URL thật trước khi sử dụng chính thức.

## Kiểm tra local

Ở thư mục gốc: npm ci, npm test, npm run build. Backend local 1.2 vẫn nằm trong backend/ và có thể chạy riêng như README cũ. Bản Vercel dùng api/index.js và cloud/.
