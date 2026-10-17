# Biểu đồ tròn trong Vista Journey

Các dashboard dùng `CircularChart` với nhãn nối bằng mũi tên, số lượng và tỷ trọng luôn hiển thị. Danh sách bên dưới giữ số đầy đủ, kể cả mục bằng 0 hoặc chưa có dữ liệu. Màn hình nhỏ tự điều chỉnh kích thước và vị trí nhãn.

| Màn hình | Ý nghĩa miếng tròn |
| --- | --- |
| Bluejay: khách sạn / loại phòng / ngày | Room-night đã dùng, còn trống, block. Công suất ở tâm giữ công thức đã dùng / phòng có thể bán sau khi trừ block. |
| Đặt phòng | Tỷ trọng lượt phòng theo nguồn hoặc trạng thái; booking và tiền phòng vẫn ở danh sách chi tiết. |
| Thu–chi | Phân bổ riêng tiền thu, tiền chi hoặc doanh thu, chi phí theo ngày / tuần / tháng. |
| Tiến độ báo cáo | Số ngày theo từng trạng thái báo cáo. |
| Cơ cấu chi phí | Số tiền theo nhóm chi phí đã ghi nhận. |
| Tổng review | Mốc đầu và phần tăng ròng; nếu giảm thì thể hiện phần còn lại và phần giảm từ mốc đầu. Không cộng các tổng tích lũy. |
| Điểm review | Điểm hiện tại và khoảng còn tới điểm tối đa trên thang gốc 5 / 10. |
| So sánh địa điểm | Tổng gần nhất theo từng địa điểm cùng nền tảng; điểm số dùng vòng tròn riêng từng địa điểm. |
| Lịch sử tăng / giảm | Phần tăng và giảm của các cặp ngày liền nhau có tổng chính xác; bảng giữ đủ ngày. |
| Tiếp cận | Lượt của chỉ số đang chọn theo từng ngày có dữ liệu. |

Không đổi nguồn dữ liệu, bộ lọc, quyền truy cập hoặc nghiệp vụ ghi sổ. Ngày thiếu không được điền thành 0. Số âm giữ dấu; tỷ trọng khi có số âm dựa trên độ lớn tuyệt đối và có chú thích rõ. Mục nhỏ gộp thành “Khác” trên hình khi quá 6 mục, nhưng danh sách giữ đủ mọi mục. Nhãn số lớn dùng `tr` / `tỷ`, số đầy đủ nằm bên dưới.

PDF xu hướng ngang cũng dùng vòng tròn và mũi tên; bảng tổng hợp và lịch sử từng ngày vẫn được giữ. Excel giữ giá trị số và ô trống gốc.

## Kiểm tra

Sau khi build frontend với `VITE_API_URL=https://bluejay-qa.local`, chạy từ thư mục gốc:

```sh
node --test frontend/test/*.test.js
node scripts/check-circular-charts.mjs
node scripts/check-finance-dashboard.mjs
node scripts/check-bluejay-reservations.mjs
```

Các script giao diện dùng dữ liệu giả lập và chặn kết nối tới API thật. Script biểu đồ kiểm tra bộ lọc khách sạn / loại phòng / ngày, điểm và tổng review, số âm, dữ liệu thiếu, mã mũi tên duy nhất, màn hình 390px và sinh PDF ở cả chế độ từng địa điểm và so sánh. File QA nằm trong `frontend/dist/`, không đưa vào Git.
