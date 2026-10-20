# Cảnh báo đánh giá trong phần mềm

Bổ sung vào nút Cảnh báo và trang Cần chú ý hiện có. Không gửi email hoặc thông báo bên ngoài.

- Review mới có ID/ngày/sao: thông báo đánh giá mới; giữ nội dung và link nguồn.
- 1 sao thang 5 hoặc ≤2/10: ưu tiên mức cao. Review sửa từ điểm tốt xuống thấp cũng báo.
- Nguồn chỉ có tổng: báo tổng đánh giá/lượt chấm điểm tăng, không suy đoán nội dung hoặc số sao.
- Nhập baseline lần đầu không báo review cũ là mới; quét lại không tạo trùng.
- Nếu đã có sự kiện review riêng trong cùng khoảng ghi nhận, không thêm cảnh báo tổng tăng trùng khoảng đó. Cảnh báo 1 sao không đồng thời tạo thêm cảnh báo review mới cho cùng sự kiện.
- Bộ lọc đánh giá mới, điểm thấp, điểm/tổng giảm; đánh dấu đã xem và hiện lại đã xem. Trạng thái đã xem dùng cơ chế chung workspace hiện tại, chưa tách từng nhân viên.
- Badge đếm chưa xem; popup ưu tiên sự kiện nghiêm trọng. Kiểm tra mỗi phút khi phần mềm đang mở, và khi quay lại tab. Việc đọc thông báo không tự chạy worker/scraper. Muốn phát hiện mới, nguồn phải được đồng bộ qua API/worker đang có.

Database: áp dụng `supabase/review-notifications.sql` sau `review-alerts.sql`. Mở rộng hai RPC hiện có, không xóa bảng/lịch sử, không tạo cảnh báo review giả cho dữ liệu cũ. Giữ RLS và quyền service_role. Hàm đọc có giới hạn 500 sự kiện mỗi loại. Cảnh báo tổng dùng lịch sử số chính xác, cùng loại count_kind; loại lượt Agoda YCS api theo quy tắc báo cáo hiện tại. Không cộng nền tảng.

Đã áp dụng và đọc kiểm tra trên Supabase ngày 20/10/2026: 7 nguồn có monitor, 72 biến động tổng tăng trong 7 ngày; chưa có sự kiện review mới/điểm thấp trong khoảng đó. Không có nghĩa mọi nền tảng đã đọc được review riêng.

Kiểm thử: `node --test backend/test/review-notifications.test.js backend/test/review-alerts.test.js`; toàn bộ backend và build frontend. UI fixture kiểm tra nút Cảnh báo, filter và trạng thái đọc với build đặt VITE_API_URL=https://review-qa.local rồi chạy `node scripts/check-review-notifications.mjs`. Dữ liệu thử chỉ chạy local, không ghi production.
