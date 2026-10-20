# Website GA4 trong Marketing & Tiếp cận

Module dùng backend Express, React, CircularChart và kho dữ liệu Supabase hiện có. Không tạo project/framework/database mới. Không có dữ liệu thử trong production.

## Kết nối bằng Client ID/Secret đang có

Trên backend Render cần các biến đã dùng cho Google OAuth:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=https://hotel-review-tracker-api-gbp.onrender.com/api/google/callback`
- `FRONTEND_URL=https://hotel-review-tracker-ui.onrender.com`
- `TOKEN_ENCRYPTION_KEY`: khóa base64 32 byte của hệ thống hiện tại; giữ nguyên nếu đang có kết nối Google. Không đổi khóa tùy tiện vì token cũ đang mã hóa bằng khóa đó.
- `GA4_AUTO_SYNC=true` để bật job website; mặc định tắt.

Callback `/auth/google/callback` cũng được hỗ trợ để tương thích cấu hình đã có. URI trong Render và Authorized redirect URIs của OAuth Client trên Google Cloud phải giống hệt nhau, không có khoảng trắng cuối dòng.

Bật **Google Analytics Data API** trong Google Cloud project chứa OAuth Client. Người đăng nhập phải có ít nhất quyền Viewer trên thuộc tính GA4. Quyền Business/Maps không thay quyền này.

Sau khi deploy: Marketing & Tiếp cận → Tiếp cận website theo mẫu báo cáo → **Kết nối Google Analytics** → đăng nhập tài khoản có quyền → đồng ý quyền đọc Analytics → trở về phần mềm → chọn website/ngày → **Cập nhật website**. Admin kết nối; admin/manager đồng bộ; tài khoản chỉ xem đọc báo cáo đã lưu và xuất CSV. Kết nối Analytics độc lập với Google Business, không thay refresh token Maps.

Token OAuth được mã hóa AES-256-GCM bằng helper hiện có, lưu riêng trong kho private dưới key băm `marketing:report:<sha256>`. Refresh token được tự dùng để làm mới access token; PKCE, state một lần hạn 10 phút và lock dùng helper sẵn có. Token/Client Secret không trả frontend hoặc ghi log. Ngắt GA4 qua API chỉ xóa kết nối GA4, không xóa báo cáo và không thay quyền Google Business.

Có thể dùng `GA4_SERVICE_ACCOUNT_JSON` như lựa chọn thay thế nếu đã có service account được cấp Viewer. Không bắt buộc tạo service account khi dùng OAuth; nếu biến này có giá trị, service account được ưu tiên. Không dùng biến VITE_ cho thông tin bí mật.

## Nguồn dữ liệu đã xác nhận trong Analytics ngày 19/10/2026

Tài khoản Hotel Marketing `412334498`, thuộc tính `559356291`, có các luồng:

| Website | Stream ID | Measurement ID |
| --- | --- | --- |
| quynhonseahotel.com | 16146265588 | G-5MZVXCHXHK |
| yzistel.com | 16147371718 | G-B40Z4MQ0W3 |
| sontraseahotel.com | 16147401766 | G-JKEP09TCP5 |

Ba luồng trên lúc kiểm tra đều báo chưa nhận dữ liệu trong 48 giờ. Website công khai có mã khác: Quy Nhơn GT-5D9R8845 trỏ G-61M24R2LBL; Yzistel G-V7W18R4DEB; Sơn Trà có GT-KT42HBXV trỏ G-12NFSK033B và G-0480SBS6XS. Đây là tín hiệu mã được nhúng, không khẳng định mọi mã đều đang ghi nhận lượt xem. Chưa sửa website hoặc cấp quyền những thuộc tính khác. Đọc API thành công không tạo lại dữ liệu chưa được website thu thập.

Muốn lấy lịch sử thực tế từ các mã cũ, cần quyền thuộc tính đang nhận dữ liệu và cập nhật mapping property/stream trong danh mục module. Không tự nhận số liệu của thuộc tính khác. Các đoạn thẻ chuẩn bị trong `docs/hotel-analytics/` chỉ là nguồn để bên quản trị web triển khai sau khi đối chiếu mã, chưa được gắn lên website. Không chèn thêm thẻ trùng một cách tự động.

## Chỉ số và tính đúng

- `totalUsers`: người truy cập duy nhất trong kỳ.
- `activeUsers`: người dùng hoạt động.
- `newUsers`: người dùng mới.
- `sessions`, `engagedSessions`: phiên và phiên tương tác.
- `screenPageViews`: lượt xem trang.
- `userEngagementDuration`: tổng thời gian tương tác, giây.
- Thời gian tương tác trung bình / người dùng hoạt động = tổng thời gian tương tác / activeUsers cả kỳ; không phải thời lượng phiên trung bình.

Mỗi website lọc `streamId` chính xác trong mọi truy vấn, vì 3 website cùng một property. Báo cáo tổng và báo cáo ngày được truy vấn riêng; không cộng người dùng hằng ngày để tính người dùng duy nhất cả kỳ. Ngày theo múi giờ GA4 trả về và hiển thị trong giao diện. Chưa có dòng dữ liệu thì để thiếu; lỗi cấu trúc, quyền hoặc network không ghi đè báo cáo cũ. Metadata thresholding/dataLoss được hiển thị để nhận biết giới hạn nguồn.

Số bài website cần CMS, không suy ra từ lượt xem. Facebook vẫn ở module Facebook Analytics. Google Maps dùng bộ Performance API sẵn có trong cùng trang Marketing; Instagram/TikTok chưa được kết nối tự động trong thay đổi này.

## API và database

- `GET /api/ga4/status`: trạng thái cấu hình/kết nối và danh mục, không có token.
- `POST /api/ga4/connect`, `POST /api/ga4/disconnect`: admin.
- `GET /api/ga4/report?siteKey=...&from=YYYY-MM-DD&to=YYYY-MM-DD`: đọc báo cáo đã lưu, không gọi Google.
- `POST /api/ga4/sync`: body `{from,to}`, admin/manager, sync 3 website độc lập.
- `GET /api/ga4/cron`: Bearer CRON_SECRET, không yêu cầu phiên người dùng.

Tái sử dụng `review_tracker_marketing_set`, `review_tracker_kv_get/take/set/delete` và lock hiện có. Không thêm bảng hoặc sửa schema. Nếu hệ thống chưa từng chạy migration Marketing, cần áp dụng `supabase/marketing-module.sql` sau schema gốc. Key mỗi báo cáo gồm version/property/stream/kỳ; giữ tối đa 366 ngày theo cơ chế marketing hiện tại. Các kỳ ngày khác nhau không tự cộng/trộn. Refresh thành công mới thay số liệu của đúng kỳ.

Workflow `.github/workflows/ga4-sync.yml` chạy 08:45 Asia/Ho_Chi_Minh (01:45 UTC), tái dùng repository variable `FACEBOOK_DEPLOYMENT_URL` trỏ backend hiện tại và `CRON_SECRET` đã có. Job lấy lại 7 ngày, 30 ngày hoàn tất và từ đầu tháng đến hôm qua; ngày đầu tháng bỏ kỳ tháng rỗng. Kỳ tùy chọn cần bấm cập nhật riêng. Lịch GitHub có thể chạy trễ. Khi còn lỗi sẽ chưa ghi marker hoàn tất.

## Kiểm tra

`node --test backend/test/ga4.test.js backend/test/google.test.js`

`node --test --test-concurrency=2 backend/test/*.test.js`

`npm.cmd --prefix frontend run build`

`node scripts/check-ga4.mjs`

Script kiểm thử dùng dữ liệu fixture tách biệt → Express thật → PGlite marketing RPC; không đọc token thật hoặc ghi production. Kiểm tra tách stream, tổng unique khác tổng ngày, lưu/reload, CSV, lỗi từng website, phân quyền và responsive. OAuth test kiểm tra PKCE, state dùng một lần, mã hóa, tách kết nối Business, refresh rotation và không lộ secret. Chạy thử thật sau cấp quyền bằng nút Cập nhật website; cần đối soát số tổng với Analytics cùng stream/ngày/timezone. Chưa có quyền hoặc chưa có nguồn nhận dữ liệu thì không báo đã lấy dữ liệu thật.

Tài liệu chính thức:
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://developers.google.com/identity/protocols/oauth2/web-server
