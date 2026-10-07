# Review Tracker 3.0 — Google Business Profile API

- frontend/: React + Vite → Render Static Site.
- backend/: Express → Render Node Web Service.
- Supabase PostgreSQL: lịch sử review, trạng thái job và token Google mã hóa.

Không còn Chromium, Docker hoặc Browserless. Chỉ theo dõi khách sạn mà tài khoản Google đã kết nối có quyền quản lý. Ứng dụng dùng API chỉ đọc thông tin địa điểm, tổng review và điểm sao, không đăng bài hay trả lời review.

Xem [GOOGLE-SETUP.md](GOOGLE-SETUP.md) và [DEPLOY-RENDER.md](DEPLOY-RENDER.md). Quyền quản lý hồ sơ không đồng nghĩa project đã được duyệt Google Business Profile API. Phải cấu hình Google Cloud/OAuth và được Google cấp API access trước khi sử dụng thực tế.

Project đã có dữ liệu: chạy lại toàn bộ supabase/schema.sql mới để bổ sung cột Google, bảng kết nối mã hóa và RPC. Không xóa bảng. Địa điểm cũ có thể liên kết với khách sạn Google trong màn hình Địa điểm để giữ lịch sử.

## Local

Backend: cd backend, npm ci, copy .env.example thành .env, nhập cấu hình theo tài liệu rồi npm run dev. Frontend: cd frontend, npm ci, copy .env.example thành .env rồi npm run dev.

Backend http://localhost:10000; frontend http://localhost:5173. Google OAuth callback local: http://localhost:10000/api/google/callback.

Root: npm test chạy test backend; npm run build build frontend (cần VITE_API_URL trong môi trường build hoặc frontend/.env).

Một kết nối Google dùng chung cho ứng dụng nội bộ. APP_PASSWORD bảo vệ quyền sử dụng và kết nối Google; đây chưa phải ứng dụng nhiều tenant hoặc Supabase Auth. Không lưu nội dung từng review.
