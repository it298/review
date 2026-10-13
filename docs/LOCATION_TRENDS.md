# Xu hướng đánh giá nhiều địa điểm

Biểu đồ nằm trong Tổng quan review và Phân tích → Xu hướng địa điểm. Chọn nền tảng và nhóm địa điểm công ty quản lý; các địa điểm chưa có lịch sử trong kỳ không có đường biểu đồ.

- Đường liền là tổng đánh giá; đường nét đứt là điểm số, trên hai trục riêng. Thang điểm theo nền tảng (5 hoặc 10), không chuẩn hóa hay cộng số lượng giữa các nền tảng.
- Khoảng thời gian: 7, 30, 90, 180, 365 ngày hoặc tự chọn trong 365 ngày gần nhất; tính cả ngày đầu và cuối, theo giờ Việt Nam.
- Mỗi trường sử dụng mốc ghi nhận cuối cùng trong ngày. Ngày thiếu dữ liệu, lần đọc thất bại và tổng hiển thị xấp xỉ không trở thành điểm tổng chính xác. Đường không nối qua ngày bị thiếu.
- Tooltip so sánh với mốc có dữ liệu trước đó trong kỳ, có thể không phải ngày liền trước. Chú giải so sánh mốc đầu–cuối của mỗi trường; chưa đủ hai mốc thì hiện “—”. Mốc cuối của các địa điểm có thể khác ngày.
- Bấm địa điểm trong chú giải để ẩn/hiện; có chế độ chỉ xem tổng hoặc chỉ xem điểm. Lịch sử đọc tối đa ba yêu cầu đồng thời và được giữ trong bộ nhớ của biểu đồ; nút tải lại đọc bản mới.

Sử dụng API lịch sử đã có và dữ liệu Supabase. Không tạo dữ liệu mẫu trên backend, không đổi schema database, không khởi chạy worker hay thay đổi lịch quét. Biểu đồ là dữ liệu đã ghi nhận, không phải số liệu thời gian thực từ nền tảng.

Kiểm tra: production build; kiểm thử gộp mốc cuối theo trường, khoảng ngày, ngày thiếu, lần quét lỗi và tổng xấp xỉ; giao diện nhiều địa điểm, tooltip, ẩn/hiện, đổi nền tảng, ngày tùy chọn, trạng thái trống và điện thoại. Ảnh xem trước dùng fixture tách riêng dữ liệu thật.
