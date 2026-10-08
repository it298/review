# Theo dõi chủ động và báo cáo tuần

## Năm chức năng

- **Cảnh báo**: sau khi dữ liệu quét được lưu, phần mềm kiểm tra mỗi phút khi đang mở. Điểm giảm từ 0,1 trên thang 5 hoặc 0,2 trên thang 10; tổng chính xác giảm; nguồn lỗi ít nhất 3 lần liên tiếp; điểm/tổng đã có nhưng chậm hơn 48 giờ. Cảnh báo giảm giữ 7 ngày. Nút “Đã xem” lưu trên Supabase, dùng chung trong workspace. Thông báo mới hiện trong phần mềm khi đang mở; chưa gửi ra email hoặc thông báo hệ điều hành.
- **Cần chú ý hôm nay**: bảng tổng hợp ngay ở Tổng quan và một trang riêng. Lọc công ty/đối thủ, loại địa điểm, cảnh báo đã xem. Mỗi cảnh báo dẫn đến đúng lịch sử/ảnh của địa điểm và nguồn. Các nguồn chưa từng có mốc được đưa vào nhóm chờ dữ liệu, không suy ra điểm/tổng bằng 0.
- **So sánh tốc độ tăng**: chọn một địa điểm công ty và một địa điểm đối chiếu cùng loại. Chỉ cho chọn nguồn chung có liên kết đã xác nhận. Dùng hai ngày đầu/cuối chung có tổng chính xác, cùng loại số đếm; hai đường bắt đầu từ 0 để so mức tăng/giảm trong cùng thời gian. Ngày thiếu không nối đường. Cần ít nhất hai ngày chung; không gộp số liệu giữa nền tảng.
- **Ảnh kiểm chứng**: worker tải PNG vùng số liệu đã xác minh sau khi summary được lưu. Backend chỉ nhận ảnh gắn với đúng thời điểm của lịch sử đã tồn tại; ảnh chặn truy cập/đăng nhập không tải lên. Lưu trong bucket Supabase Storage riêng `review-tracker-evidence` (`public:false`, PNG tối đa 2 MB). Ảnh đầu tiên mỗi ngày và ảnh khi giá trị thay đổi được giữ; số liệu không đổi trong cùng ngày không tạo thêm bản ảnh. Các ảnh trùng byte dùng cùng object SHA-256. API xem ảnh cần mật khẩu ứng dụng; khóa Storage không đi vào frontend. Trang ảnh cho chọn hai mốc trước/sau cùng địa điểm/nguồn; mốc không có ảnh hiển thị rõ. Google API/email có thể không có ảnh trình duyệt.
- **Báo cáo tuần**: thứ Hai–Chủ nhật theo giờ Việt Nam. Tuần đang theo dõi tính từ dữ liệu mới nhất; tuần vừa kết thúc tự chốt sau mỗi vòng worker, hoặc khi mở mục báo cáo, và giữ cố định. Bao gồm từng nguồn, điểm/tổng, chênh lệch trong tuần, ngày thực tế có dữ liệu, nguồn thiếu, tăng tổng nổi bật và điểm giảm. Xuất XLSX gồm 3 sheet và PDF có phông tiếng Việt được đóng gói cùng frontend. Không coi 10+/50+ là tổng chính xác; không cộng số review giữa nền tảng.

## Triển khai

1. Chạy `supabase/insights.sql` sau `source-history.sql`. Migration đã được áp dụng vào project hiện tại ngày 08/10/2026; có thể chạy lại.
2. Push GitHub để Render triển khai backend/frontend. Backend dùng khóa Supabase server đã có để tạo bucket riêng trong lần tải ảnh đầu. Không cần thêm biến môi trường.
3. Dừng worker cũ bằng Ctrl+C, rồi chạy lại `node --env-file=.env src/run.js --daemon` trong `worker/`. Worker cần được khởi động lại để dùng mã tải ảnh và chốt báo cáo mới; máy Windows cần thức và có mạng.
4. Có thể nhập các ảnh cũ đã xác minh bằng `node --env-file=.env src/sync-evidence.js` trong `worker/`. Chỉ cặp PNG/JSON có mốc trùng lịch sử mới được nhận; không phục hồi mốc đã bị ghi đè trước khi có lịch sử.

## Kiểm tra và giới hạn

Kiểm tra PostgreSQL/PGlite về dữ liệu theo ngày, điểm/tổng độc lập, chênh lệch, ảnh khớp mốc, báo cáo chốt không bị ghi đè và quyền service_role; kiểm tra HTTP về mật khẩu ứng dụng/worker, PNG, Storage riêng và file ảnh; kiểm tra worker về ảnh thành công và việc lỗi tải ảnh không làm mất summary. Kiểm tra UI với dữ liệu Supabase thật, dữ liệu mô phỏng riêng cho so sánh nhiều ngày, và tệp XLSX/PDF xuất từ số liệu thật. Lịch sử nhiều ngày đang tích lũy; cảnh báo/so sánh không tự tạo số liệu quá khứ.

Khi worker tắt, số liệu ngừng cập nhật; giao diện vẫn dùng dữ liệu đã lưu và có thể báo chậm hơn 48 giờ. Tính năng ảnh dùng dung lượng Storage của project hiện tại; ảnh giữ riêng, không tự xóa. Báo cáo tuần chốt khi có vòng quét hoặc lượt mở báo cáo, không có lịch gửi độc lập khi worker và ứng dụng đều không hoạt động.

Tham khảo thư viện/API: [ExcelJS](https://github.com/exceljs/exceljs), [jsPDF](https://github.com/parallax/jsPDF), [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control). Noto Sans được đóng gói với giấy phép trong `frontend/public/fonts/OFL.txt`.
