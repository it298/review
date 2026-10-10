# Nhập thủ công điểm, đánh giá và thứ hạng TripAdvisor

Trên bảng địa điểm, chọn **Nhập số liệu** ở ô TripAdvisor hoặc **Nhập thủ công** ở đầu bảng. Chọn địa điểm, nguồn, điểm và/hoặc tổng chính xác, thời điểm ghi nhận và ghi chú tuỳ chọn. Khi chọn TripAdvisor, có thể nhập thêm vị trí, tổng số khách sạn/nhà hàng/điểm tham quan và khu vực, ví dụ hạng 82 trong 84 khách sạn tại Quy Nhơn. Có thể chỉ lưu thứ hạng khi không lấy được từ trang công khai. Ô bỏ trống giữ nguyên số liệu đang có; số 0 được lưu là số 0. Điểm dùng thang gốc 5 hoặc 10; Grab/Shopee dùng tổng lượt chấm điểm. Mốc 10+/50+ không nhập vào ô tổng chính xác.

Mỗi lần nhập lưu một mốc `manual` trong lịch sử, dùng được cho biểu đồ, so sánh và báo cáo. Lịch sử hiển thị ghi chú và thời điểm nhập riêng với thời điểm ghi nhận. Số liệu nhập ngày cũ không ghi đè số mới hơn. Quét tự động thành công với mốc mới hơn vẫn cập nhật bình thường. Báo cáo tuần đã chốt giữ nguyên; số bổ sung ngày cũ được dùng trong lịch sử và các báo cáo chưa chốt.

Chạy `supabase/manual-summary.sql` sau `source-history.sql` và `tripadvisor-ranking.sql`. Sau khi thêm nhập thứ hạng TripAdvisor thủ công, chạy lại file `supabase/manual-summary.sql` trong Supabase SQL Editor để cập nhật hàm nhập; lệnh `add column if not exists` và `create or replace function` cho phép chạy lại an toàn. API `POST /api/manual-summary` yêu cầu mật khẩu ứng dụng; worker secret không truy cập được. Hàm SQL chỉ cho service_role, không cấp quyền nhập trực tiếp cho anon/authenticated. Mã lần nhập chống lưu trùng khi gửi lại cùng yêu cầu. Không thay đổi tài khoản, token hay cấu hình worker.

Dữ liệu mới nằm trong `review_tracker_directory_sources` và `review_tracker_source_history`; đọc bảng nguồn ưu tiên giá trị mới nhất theo từng trường khi kết hợp Google/OTA. Lần quét lỗi không làm mất nhãn thủ công của số liệu vẫn đang sử dụng. Chức năng này nhập số liệu tổng, chưa bao gồm nhập nội dung từng review hoặc tải ảnh đính kèm.

Kiểm tra: validation, API auth, PostgreSQL/PGlite migration lặp lại, retry, backdate/partial, nguồn tự động tiếp tục, và giao diện desktop/mobile với dữ liệu kiểm thử riêng.
