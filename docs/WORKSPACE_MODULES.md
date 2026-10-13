# VJH Workspace

Hai module ngang hàng: Theo dõi đánh giá (Google/OTA/café/cửa hàng) và Blue Jay
Analytics (công suất, đặt phòng, dịch vụ của bốn khách sạn trong ZIP v5).
Trang Tổng quan hệ thống là cửa vào chung, không giả lập doanh thu hoặc công suất.
Chọn module trên sidebar sẽ mở các menu con riêng. Dùng chung đăng nhập APP_PASSWORD.
Chưa có phân quyền theo người dùng; quyền truy cập hiện theo mật khẩu ứng dụng.

## Ranh giới module

- Backend Blue Jay: `backend/src/modules/bluejay`, mount `/api/bluejay` sau middleware
  xác thực chung. Không mở cổng/API công khai riêng cho dữ liệu đặt phòng.
- Frontend Blue Jay: `frontend/src/modules/bluejay`, tải theo nhu cầu. CSS chỉ áp
  dụng trong `.bluejay-module`. API gọi máy chủ chung qua `VITE_API_URL`.
- Module review giữ các API và dữ liệu hiện có. Bảng công suất không dùng điểm OTA.
- PMS hotelId 5381/6836/6495/6209 liên kết với entityKey tương ứng Sontra/Gia Lai/
  Quy Nhơn/Yzistel trong danh mục review.

## Kết nối và lưu dữ liệu

Thêm `BLUEJAY_API_KEY` vào biến môi trường backend, không vào frontend hay Git.
`BLUEJAY_BASE_URL` mặc định `https://api-pms.bluejaypms.com/api/v2/` và chỉ nhận
địa chỉ chính thức này. Bản ZIP chỉ có mẫu khóa, chưa thể xác nhận dữ liệu API thật.
Các chức năng API/normalizer kế thừa từ v5; cần kiểm tra với khóa và quyền của công ty.

Dữ liệu báo cáo lưu riêng trong KV Supabase hiện có, tiền tố `bluejay:`; thời gian
lưu 366 ngày từ lần đồng bộ. Chạy `supabase/bluejay-module.sql` trước lần đồng bộ
Blue Jay đầu tiên (KV chung chỉ giữ tối đa 7 ngày; RPC riêng giữ cache module 366 ngày).
Không dùng filesystem tạm của Render. Bộ lọc ngày,
khách sạn, loại báo cáo tạo cache riêng; nhật ký giữ 200 lượt.
Chưa khởi chạy scheduler mới: đồng bộ qua nút của module. Các khung giờ hiển thị
kế thừa từ v5, chưa đối chiếu quyền API thực tế. Khóa API và nội dung lỗi thô từ
Blue Jay không trả về trình duyệt. CSV chỉ xuất dữ liệu báo cáo đang mở.

Chưa nhập tài liệu hướng dẫn, setup.cmd hay start.cmd từ ZIP vào luồng thực thi.
Chỉ dùng mã nghiệp vụ/UI của ZIP và chuyển thành module trong ứng dụng hiện tại.

## Công nợ OTA/đại lý

Sidebar Blue Jay có mục Công nợ OTA, đọc dữ liệu riêng từ báo cáo
`https://id.bluejaypms.com/report-payables`. Dữ liệu là **dư nợ theo Bluejay**,
chưa phải số phải thu đã đối soát hoa hồng hay chứng từ OTA chuyển tiền.
Không tự trừ thêm đặt cọc hoặc tính số dư từ giá phòng.

Xuất Excel `.xls`/`.xlsx` từ Bluejay, chọn đúng khách sạn tại mục nhập file,
kiểm tra kỳ báo cáo và xác nhận lưu. File Bluejay không có tên khách sạn nên
không tự suy đoán cơ sở. Parser chỉ nhận báo cáo VND, tối đa 2 MB/1.000 dòng;
server kiểm tra lại các dòng và tổng tiền trước khi lưu. Tên khách không lưu.
Nguồn khác OTA được giữ đúng tên nếu xuất hiện trong báo cáo; dùng bộ lọc nguồn.

`GET /api/bluejay/payables?hotelId=all&from=YYYY-MM-DD&to=YYYY-MM-DD`
chỉ trả bản đúng kỳ đã nhập, khách sạn chưa có bản để `data:null`.
`POST /api/bluejay/payables/import` yêu cầu đăng nhập có quyền ghi;
viewer chỉ xem/xuất. Bản mới nhất theo kỳ dùng dataset `payables`, từng lần
ghi nhận dùng `payables-history`, cùng cache Supabase riêng giữ 366 ngày.
`GET /api/bluejay/payables/history` trả 20 lần gần nhất; mở kỳ báo cáo sẽ
hiển thị bản hiện hành của kỳ đó. Không có scheduler công nợ được bật.
Excel xuất tổng hợp và booking theo bộ lọc hiện tại; PDF ngang xuất bảng tổng hợp.
