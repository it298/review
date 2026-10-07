# Review Tracker 2.3 — Frontend + Backend

Hai dịch vụ độc lập trên Render:

- frontend/: React + Vite, deploy Static Site.
- backend/: Express + Chromium, deploy Docker Web Service.
- supabase/schema.sql: schema PostgreSQL, giữ dữ liệu ở Supabase.

Xem [DEPLOY-RENDER.md](DEPLOY-RENDER.md). render.yaml tạo cả hai dịch vụ, kết nối public API URL và origin frontend. Không cần Vercel hoặc Browserless.

## Chạy local

Backend: vào backend/, chạy npm ci; copy .env.example thành .env và nhập secret Supabase, APP_PASSWORD, CRON_SECRET; chạy npm run install-browser rồi npm run dev.

Frontend: vào frontend/, chạy npm ci; copy .env.example thành .env rồi npm run dev. Frontend tại http://localhost:5173, backend tại http://localhost:10000. CORS_ORIGIN backend mặc định trong file mẫu là http://localhost:5173.

Ở thư mục gốc, npm test chạy test backend; npm run build build frontend. Muốn build frontend production phải cấu hình VITE_API_URL bằng URL backend. Secret không được đặt ở frontend hoặc có tiền tố VITE_.

Ứng dụng theo dõi tổng review và điểm sao, không lấy nội dung từng review. Dữ liệu Google Maps có thể không đọc được khi giao diện thay đổi hoặc yêu cầu xác minh.
