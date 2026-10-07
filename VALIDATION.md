# Kết quả kiểm tra bản Google Business Profile 3.0

## Google Business Profile API 3.0 (07/10/2026)

- 10/10 test backend đạt: CORS, xác thực, PostgreSQL, OAuth/PKCE với state dùng một lần, mã hóa AES-GCM, refresh token rotation và đọc tổng review/sao bằng Google API giả lập.
- SQL được chạy trong PostgreSQL WASM: kết nối mã hóa chỉ service_role truy cập, compare-and-swap không phục hồi kết nối đã xóa, state OAuth tiêu thụ một lần, liên kết địa điểm Google giữ ID và snapshot cũ.
- Frontend production build đạt.
- Kiểm tra UI bằng Chromium thật với API giả lập: đăng nhập, chọn business account, chọn khách sạn và liên kết lịch sử cũ đạt, không có lỗi JavaScript.
- Backend không còn dependency Chromium/Playwright/Docker. Render dùng Node Web Service + Static Site.
- Chưa xác minh Google Cloud API access, OAuth với Google thật, Supabase live hoặc deployment Render. Cần cấu hình và được Google duyệt API trước khi sử dụng dữ liệu thật.

## Bản tách frontend/backend 2.3 (07/10/2026)

- 13/13 bài test backend đạt khi RUN_BROWSER_TESTS=1, bao gồm Chromium thật, PostgreSQL WASM, xác thực, URL Maps, ngày Việt Nam và RPC adapter.
- CORS: preflight của frontend hợp lệ trả 204, đăng nhập cross-origin trả 200, origin lạ trả 403. Web Service không phục vụ dashboard React.
- Frontend production build đạt với VITE_API_URL được cấu hình.
- Mã nguồn chạy độc lập từ frontend/ và backend/; Docker chỉ chứa backend. Render Blueprint khai báo một Static Site và một Docker Web Service.
- Chưa kiểm chứng Blueprint trên Render hoặc build Docker Linux; vẫn cần deploy và kiểm tra URL/domain thật, Supabase live và Google Maps thật.

Các kết quả dưới đây là lịch sử kiểm tra các bản trước; bản 2.3 thay thế cách chạy local JSON và dịch vụ gộp.

## Bản Render 2.2 (07/10/2026)

- 7/7 test cloud đạt khi bật RUN_BROWSER_TESTS=1: có Chromium thật chạy trên Windows với HTML fixture, kiểm tra PostgreSQL bằng PGlite, xác thực và phục vụ frontend/API chung domain.
- Production build và kiểm tra cú pháp server đạt.
- Server Render chạy local: frontend đã build, JS asset, health và xác thực session đạt.
- Chưa build Docker Linux do máy không có Docker, chưa triển khai Render hoặc kiểm chứng Google Maps thật/Supabase live. Render cần build image và kiểm tra dữ liệu thật trước khi sử dụng chính thức.

## Bản Supabase 2.1 (07/10/2026)

- 5/5 bài test cloud đạt, bao gồm REST adapter và chạy schema thật bằng PostgreSQL WASM (PGlite).
- SQL khởi tạo chạy lại được; snapshot ghi cùng ngày được upsert, tên tùy chọn được giữ, lỗi snapshot rollback cập nhật địa điểm, xóa cascade lịch sử, khóa phân tán kiểm tra đúng token.
- Kiểm tra quyền: service_role dùng RPC; anon/authenticated không truy cập các bảng và RPC của ứng dụng.
- Root production build đạt.
- Chưa chạy SQL trên project Supabase của người dùng hoặc kiểm chứng key, Browserless và deployment Vercel. Kết quả local không thay thế kiểm tra kết nối thật.

## Bản cloud Vercel (07/10/2026)

- 3/3 bài test đạt: xác thực từ chối khi thiếu secret, bảo vệ API trước truy cập database, ma trận không lấy snapshot mồ côi và giữ điểm thiếu là null.
- Root build (cài frontend bằng lockfile và Vite production build): đạt.
- 7/7 test dữ liệu local vẫn đạt sau khi tách bộ trích xuất dùng chung.
- Chưa kiểm chứng script Lua trên Redis thật, Browserless, URL Google Maps thật hoặc deployment Vercel. Cần tài khoản và Environment Variables trước khi kiểm tra các kết nối đó.

## Bản local 1.2

Ngày kiểm tra: 07/10/2026. Runtime: Node.js 24.21.0.

- Backend: 7/7 test pass (điểm sao thiếu, ngày Việt Nam, URL chính thức, giới hạn worker, nhận diện CID, số đếm chính xác, ghi đè snapshot và xóa dữ liệu).
- Kiểm tra cú pháp tất cả file JavaScript backend: pass.
- Frontend: Vite production build pass, với configLoader native.
- Kiểm tra API trên backend thật với dữ liệu thử riêng: health, ngày ma trận theo giờ Việt Nam, từ chối URL giả, 404 cho địa điểm không tồn tại, đổi tên, xóa lịch sử, đồng bộ danh sách rỗng: pass.

Chưa kiểm chứng scrape một địa điểm Google Maps thật hoặc kiểm tra giao diện bằng trình duyệt. Browser Chromium cần được cài bằng npm run install-browser trước khi thêm địa điểm. Chưa có đăng nhập; backend mặc định chỉ truy cập trên máy chạy ứng dụng.
## Giao diện dashboard mới (07/10/2026)

- Vite production build: đạt.
- Kiểm tra trình duyệt với API giả lập: thống kê, tìm kiếm, đồng bộ, tải CSV, chọn khách sạn Google và liên kết lịch sử cũ: đạt.
- Kiểm tra màn hình 390px, trạng thái trống, lỗi và thử lại: đạt; không có lỗi JavaScript hoặc tràn ngang toàn trang.
- Đã xem ảnh dashboard và quản lý khách sạn. Ảnh xem trước dùng dữ liệu giả lập, không xác nhận kết nối Google/Supabase thật.
