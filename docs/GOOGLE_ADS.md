# Google Ads

Tích hợp **Marketing & Tiếp cận → Google Ads**, tài khoản cố định **7836280021 (783-628-0021)** theo ảnh người dùng. Không tự gán chiến dịch cho khách sạn qua tên. Dashboard Tổng quan có thêm nguồn Google Ads, không cộng chéo chuyển đổi Ads/Meta/GA4.

## Kết nối và quyền thật

Theo [thông báo Google](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), developer token đã sunset **09/09/2026**. Bản này không yêu cầu và không gửi header developer-token. Quyền API thuộc Cloud project sở hữu OAuth client; project cần bật Google Ads API và được cấp Explorer/Basic/Standard để truy cập tài khoản production. Test access không đủ. Quản trị viên kiểm tra [Google Ads API Overview](https://console.cloud.google.com/apis/api/googleads.googleapis.com/overview?project=vjh-review-tracker). Không cần tạo MCC chỉ để xin developer token.

Dùng lại `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_URL`, `TOKEN_ENCRYPTION_KEY` đang có. OAuth consent cần cho phép scope `https://www.googleapis.com/auth/adwords`. Google không có scope chỉ đọc riêng cho Ads; dù màn hình cấp quyền rộng, mã tích hợp chỉ gọi truy vấn báo cáo `googleAds:search`, không có mutate/đổi ngân sách/tạo hay tắt chiến dịch. Cấp quyền bằng người dùng có quyền xem tài khoản 783-628-0021, ví dụ `it@vjh.vn` nếu đã được cấp quyền. Scope GA4 hay Google Business hiện có không thay thế Ads.

Bấm Kết nối Google Ads: PKCE, state `gads_`, callback Google sẵn có phân luồng bằng prefix. State dùng một lần/hết hạn 10 phút; token mã hóa AES-GCM qua hàm hiện tại, khóa lưu hash riêng `marketing:report:*`, refresh tự động theo luồng hiện có. Không đổi connection Google Maps hoặc GA4. Admin mới được connect/disconnect; admin/manager sync; viewer đọc báo cáo đã lưu. UI chưa có nút ngắt nhưng API hỗ trợ. Chỉ bật OAuth flow khi cấu hình hợp lệ; không gửi secret về browser/log. Nếu app Google đang Testing, thời hạn refresh token phụ thuộc chính sách Google và có thể cần cấp lại; không bảo đảm vĩnh viễn.

Nếu cần truy cập qua MCC đã có, tùy chọn `GOOGLE_ADS_LOGIN_CUSTOMER_ID` gồm đúng 10 số của manager có quyền quản lý tài khoản con. Không điền customer ID một cách suy đoán. Khi người dùng có quyền trực tiếp, để trống.

## API và số liệu

`GET /api/google-ads/status`, `POST /api/google-ads/connect`, `POST /api/google-ads/disconnect`, `GET /api/google-ads/report?from=...&to=...`, `POST /api/google-ads/sync` `{from,to}`. GET report không gọi Google; sync mới truy vấn API v26. Tối đa 93 ngày/lần, phân trang fixed host, timeout và số trang giới hạn. Lỗi không ghi đè báo cáo tốt.

Truy vấn account metadata, campaign totals và campaign daily có cùng filter loại `REMOVED`. Số chi phí/cpc/budget từ micros chia **1.000.000**, giữ VND hoặc tiền tệ account; không chia nhầm 100. Giá trị chuyển đổi giữ nguyên đơn vị theo cấu hình conversion action, chưa gọi là doanh thu. Chuyển đổi có thể là số thập phân, không đổi thành số booking/khách. Tỷ lệ chuyển đổi theo tương tác: conversions/interactions, không dùng clicks và không giới hạn 100%; CPC/CPA tổng tính từ tổng chi phí/tổng mẫu số, không trung bình rate chiến dịch.

Ngày theo múi giờ tài khoản và ngày tương tác (segments.date), không phải `conversions_by_conversion_date`. Các chuyển đổi đến muộn có thể làm số thay đổi khi đọc lại. Để đối chiếu ảnh Google Ads cần cùng kỳ và filter bỏ chiến dịch đã xóa. Thẻ KPI, biểu đồ ngày: tổng phạm vi; filter tên chỉ đổi bảng/biểu đồ tròn/CSV. Ngân sách trung bình/ngày là cấu hình tại thời điểm đọc, đánh dấu dùng chung và không cộng ngân sách dùng chung. Trạng thái cũng là hiện tại. Avg target CPA và optimization score chưa có trong bản đầu.

Collection trống giữ summary null; không giả số 0 khi không có báo cáo. Trong dòng metrics hợp lệ, các trường protobuf bỏ qua dùng zero theo mặc định Google, còn rate thiếu mẫu số hiện “—”. Bảng theo kỳ giữ campaign có dữ liệu do Google trả. CSV chống công thức từ tên, ghi customer/kỳ/tiền tệ/múi giờ.

Lưu qua RPC `review_tracker_marketing_set` hiện có, không schema/migration mới. Token/báo cáo không có quyền truy cập trực tiếp từ browser vào Supabase. Backend tests fake RPC và provider; UI fixtures biệt lập. Không khẳng định đồng bộ production trước khi Cloud project được duyệt, OAuth và Live được kiểm tra.

Kiểm tra: `node --test backend/test/google-ads.test.js backend/test/ga4.test.js`; `node scripts/check-google-ads.mjs`. Tham chiếu [Google OAuth](https://developers.google.com/google-ads/api/docs/oauth/internals), [GAQL](https://developers.google.com/google-ads/api/docs/query/overview).
