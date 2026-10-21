# Doanh thu theo ngày trả phòng

Mở **Blue Jay Analytics → Doanh thu**. Chọn một hoặc tất cả bốn khách sạn, khoảng ngày rồi Xem doanh thu. Backend dùng API đặt phòng hiện có với `dateType=1` (ngày trả), báo cáo đầy đủ các trang và cache đúng kỳ. Cập nhật từ Blue Jay gửi `refresh=1`; backend có thể trả bản cũ kèm cảnh báo nếu API lỗi/ngoài khung giờ. Không cần migration hoặc biến môi trường mới.

Cách ghi nhận được người dùng chọn: cộng `roomPrice + servicePrice` của các dòng phòng có trạng thái **Đã trả phòng / Check Out**, ngày trả thuộc kỳ (hai đầu bao gồm). Toàn bộ tiền của kỳ lưu trú được ghi nhận vào ngày trả, không chia đều theo đêm. Hủy, no-show, trạng thái khác, sai ngày và ngày ngoài kỳ bị loại và có bảng giải thích. Quy tắc loại M-Standard, giữ dòng phòng khác nhau và loại bản sao giống hệt của backend được giữ nguyên.

Không cộng báo cáo dịch vụ riêng vào tiền dịch vụ booking. Không cộng payment/deposit/balance vào doanh thu. Tổng booking PMS giữ riêng: khi khác phòng + dịch vụ có cảnh báo đối chiếu. Không tự suy ra VAT, chiết khấu/hoa hồng OTA, doanh thu thuần, ADR/RevPAR hoặc lợi nhuận. Số tiền thiếu giữ null, không giả định bằng 0; số âm được giữ. Khách sạn lỗi không có số liệu; tổng chỉ thuộc phần khách sạn có báo cáo, kèm tỷ lệ bao phủ và thời điểm bản lưu.

Biểu đồ, bảng và Excel/PDF cùng dùng kỳ đã tải. Đổi bộ lọc xóa báo cáo cũ. Booking đếm mã duy nhất trong từng khách sạn; một booking nhiều phòng vẫn giữ tất cả dòng tiền phòng. Bảng trên màn hình giới hạn 500 dòng, file xuất có đầy đủ dòng đủ điều kiện và dòng bị loại. Tên khách không nằm trong màn hình/file doanh thu.

Kiểm tra cục bộ: `node --test frontend/test/bluejay-revenue.test.js frontend/test/bluejay-report.test.js backend/test/bluejay-reservation-summary.test.js`; `node scripts/check-bluejay-revenue.mjs` dùng fixture biệt lập, không ghi dữ liệu production. Cần đối chiếu báo cáo doanh thu Blue Jay thực tế sau triển khai trước khi coi là số đã chốt.
