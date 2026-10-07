# Kết quả kiểm tra bản Render 2.2 / Local 1.2

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
