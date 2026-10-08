# Biểu đồ và lịch sử làm mới

Mở **Biểu đồ & lịch sử** ở sidebar. Chọn địa điểm, nền tảng và 7/30/90/365 ngày gần nhất. Hai biểu đồ chuyển qua lại giữa điểm gốc (5 hoặc 10) và tổng đánh giá; Grab giữ tên “lượt chấm điểm”. Thay đổi so sánh ngày đầu/cuối có số liệu trong khoảng chọn, cần ít nhất hai ngày.

Chạy `supabase/source-history.sql` sau các migration danh mục, Google public, OTA automation và public summary. Migration đã được áp dụng vào project hiện tại ngày 08/10/2026. Sau đó triển khai frontend và backend mới. Worker đang chạy dùng nguyên API cũ, không cần đổi cấu hình hoặc khởi động lại.

Trigger lưu từng lần nhận kết quả Google/public và OTA vào `review_tracker_source_history`. Lần quét lỗi giữ dữ liệu mới nhất ở bảng tổng quan, nhưng không tạo điểm mới trên biểu đồ. Lần đọc một phần chỉ lưu trường vừa xác minh, tránh làm tổng cũ trông như vừa được cập nhật. Trigger OTA chạy cuối transaction để đọc đúng summary của lần quét. Google API snapshot cũng được lưu theo ánh xạ ID đã đăng ký.

Mỗi ngày Việt Nam lấy mốc xác minh cuối của từng chỉ số. Ngày không có dữ liệu là khoảng trống; 10+/50+ chỉ hiện trong lịch sử, không chuyển thành số chính xác. Các trường có thời điểm khác nhau không bị gộp thành một lần đọc đầy đủ. Bảng liệt kê 200 lần gần nhất trong khoảng chọn, gồm thời điểm, kết quả, điểm/tổng, cách đọc và lý do lỗi.

Lịch sử cũ chỉ nhập các baseline đã có, mốc OTA theo ngày, Google snapshot đã lưu và các lần OTA thất bại đã ghi lại. Không thể phục hồi toàn bộ lần quét thành công đã bị ghi đè trước khi bật tính năng. Từ khi bật migration, các lần làm mới mới được giữ lại kể cả trong cùng ngày. RPC chỉ cấp quyền service_role; API đọc lịch sử yêu cầu mật khẩu ứng dụng.

Kiểm tra: test PostgreSQL/PGlite về lần đọc một phần, thất bại, quyền truy cập, migration chạy lại và thời điểm trigger OTA; test chuỗi ngày về giờ Việt Nam, ngày thiếu, giảm điểm và mốc tổng không chính xác; kiểm tra giao diện dùng bản chụp dữ liệu thật từ Supabase, gồm Google /5, Agoda /10 và lịch sử Traveloka thất bại.
