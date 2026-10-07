# Thiết lập Google Business Profile API

## 1. Google Cloud và API access

Tạo project tại https://console.cloud.google.com/. Đăng nhập tài khoản được cấp quyền quản lý khách sạn.

Xin quyền truy cập Business Profile API cho project theo https://developers.google.com/my-business/content/prereqs. Quyền quản lý khách sạn không tự cấp API access. Sau khi được duyệt, bật các API theo https://developers.google.com/my-business/content/basic-setup. Ứng dụng dùng:

- My Business Account Management API: danh sách tài khoản/nhóm.
- My Business Business Information API: danh sách và chi tiết địa điểm.
- Google My Business API: v4 accounts.locations.reviews.list để lấy totalReviewCount và averageRating.

Địa điểm cần được xác minh để đọc review. Nếu Google trả 403/quota 0, kiểm tra project đã được duyệt, API đã bật và quyền quản lý thực tế; không thể vượt bước này bằng mã nguồn.

## 2. Google Auth Platform / OAuth

Cấu hình Branding, Audience, Data Access cho ứng dụng. Nếu External ở trạng thái Testing, thêm email tài khoản quản lý khách sạn vào Test users.

Scope cần dùng: https://www.googleapis.com/auth/business.manage. Google yêu cầu scope quản lý này; mã nguồn ứng dụng chỉ gọi các API đọc dữ liệu.

Tạo OAuth client loại Web application. Authorized redirect URI phải khớp tuyệt đối:

https://BACKEND.onrender.com/api/google/callback

Dùng URL Web Service backend, không dùng URL Static Site. Local có thể thêm http://localhost:10000/api/google/callback. Không cần dùng publishable/anon key Supabase để đăng nhập Google.

Lấy Client ID và Client secret rồi nhập vào Environment của backend Render; không gửi secret vào chat hoặc GitHub. Google Auth Platform có thể yêu cầu xác minh ứng dụng khi đưa ra Production tùy audience và scope. Token refresh của ứng dụng External ở Testing có thể hết hạn sau 7 ngày; cần kết nối lại hoặc hoàn tất thiết lập Production phù hợp.

Tài liệu OAuth: https://developers.google.com/identity/protocols/oauth2/web-server

## 3. Mã hóa và Supabase

Chạy lại toàn bộ supabase/schema.sql mới trong SQL Editor. Script bổ sung cấu trúc/RPC, không xóa lịch sử cũ. APP_PASSWORD là mật khẩu truy cập ứng dụng; không phải mật khẩu Google.

TOKEN_ENCRYPTION_KEY là chuỗi base64 của 32 byte ngẫu nhiên. Blueprint Render tự tạo biến này. Nếu tạo thủ công, dùng password generator tương ứng hoặc chạy trên máy:

node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"

Nhập kết quả trực tiếp vào Environment backend và giữ ổn định. Đổi khóa mà không kết nối lại sẽ không giải mã được token cũ. Token lưu bằng AES-256-GCM, RLS và SQL privileges chỉ cho service_role truy cập. Không đặt secret ở frontend hoặc có tiền tố VITE_.

## 4. Sử dụng

Mở frontend → đăng nhập APP_PASSWORD → Địa điểm → Kết nối Google → chọn đúng tài khoản quản lý → xác nhận quyền trên Google → quay về ứng dụng.

Chọn tài khoản/nhóm rồi chọn khách sạn. Nếu có dữ liệu từ scraper cũ, chọn đúng bản ghi trong Giữ lịch sử của địa điểm cũ trước khi thêm; tránh ghép nhầm khách sạn. Sau đó cập nhật Dashboard để ghi snapshot theo ngày Việt Nam.

Ngắt kết nối trong ứng dụng xóa token đã lưu và các phiên OAuth đang chờ, không xóa lịch sử. Muốn thu hồi cả quyền đã cấp trên Google, dùng phần Third-party connections trong Google Account. Khi đổi tài khoản Google, các khách sạn tài khoản mới không quản lý có thể không đồng bộ được.
