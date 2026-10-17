# Nhập thu–chi nhiều dòng như Excel

## Mở màn hình

- Nhân viên: **Thu–chi & HĐKD → Nhập thu–chi → Nhập bảng (Excel)**.
- Quản lý: **Thu–chi & HĐKD → Điều chỉnh → Nhập bảng (Excel)**.
- Chọn cơ sở, khoảng ngày và bấm **Xem báo cáo** để kiểm tra dữ liệu, trạng thái khóa hiện có trước khi nhập.

## Nhập nhanh

### Tải file Excel và tự ghép cột

Bấm **Tải Excel lên**, chọn file `.xlsx` / `.xls` tối đa 10 MB. File được đọc ngay trong trình duyệt; file gốc không được gửi lên máy chủ. Chọn sheet và cơ sở/kỳ nhận đúng với file. Hệ thống tự tìm hàng tiêu đề, ghép tên cột tiếng Việt/tiếng Anh thông dụng, nhận diện bảng thu/chi đặt cạnh nhau và tiêu đề hai hàng của mẫu khách sạn. Một hàng có tiền mặt, chuyển khoản hoặc thu/chi ở nhiều cột sẽ tách thành các nghiệp vụ riêng. Các bảng số tổng/đối chiếu bên phải và khoản cọc đã thu trước đó được loại khỏi phần nhập tự động để tránh tính trùng.

Mở **Xem / sửa ghép cột tự động** để đổi trường tương ứng hoặc bỏ qua cột. Có thể đổi hàng tiêu đề và chọn ngày, loại, phương thức mặc định cho ô trống. Các hạng mục/phương thức chưa rõ được giữ lại để sửa, không tự áp vào một hạng mục tùy ý. Hệ thống không tự tạo doanh thu hoặc chi phí đã ghi sổ từ tổng tiền thu/chi.

Xem trước tối đa 30 dòng và tổng Thu/Chi của các vùng đang chọn trong sheet. Bấm xem các dòng/ô bỏ qua để kiểm tra dòng tổng, dòng không có thông tin và tiền bằng 0. Công thức Excel không được thực thi: chỉ khi tích **Dùng kết quả công thức đã lưu** mới dùng giá trị đã lưu trong file; cần bảo đảm file đã tính và lưu đúng trước khi tải. Ô lỗi/không có kết quả vẫn bị đánh dấu.

Chọn **Từ nghiệp vụ số**, **Số nghiệp vụ đưa vào bảng** để nhập từng đợt tối đa 500 dòng, tùy số chỗ còn trống trong bảng. Xác nhận đúng cơ sở/vùng/cột, bấm **Đưa N dòng vào bảng**. Dữ liệu lúc này mới có ở bảng nhập; kiểm tra ô đỏ, sửa và bấm **Lưu N dòng chờ duyệt**. Với file lớn, giữ phần nhập file mở, lưu và dọn các dòng thành công rồi nhập tiếp đợt sau. Chọn sheet khác để nhập các phần còn lại.

Các dòng cùng nguồn sheet/dòng/cột, cùng dữ liệu chuẩn bị và cùng cơ sở có mã chống lặp ổn định khi nhập lại. Những dòng đã có trong bảng không được thêm lại; lưu lại đúng mã qua cùng tài khoản không tạo thêm bản ghi. Đây không phải bảo đảm gộp mọi bản sao đã sửa nội dung, đổi vị trí nguồn hoặc nhập bằng các tài khoản khác nhau; vẫn đối chiếu chứng từ như khi nhập trực tiếp.

### Gõ hoặc dán vùng ô

1. Mỗi dòng là một nghiệp vụ. Có sẵn 20 dòng trống; thêm 20 hoặc 100 dòng, tối đa 500 dòng trong một bảng.
2. Nhập trực tiếp hoặc sao chép vùng ô Excel rồi Ctrl+V vào ô bắt đầu. Dán được cả hàng tiêu đề theo mẫu; cột theo tên sẽ được nhận diện dù đổi thứ tự. **Mẫu cột để dán** tải hàng tiêu đề TSV để mở trong Excel; hoặc dùng chức năng tải file ở trên.
3. Cột cơ bản: ngày, loại nghiệp vụ, hạng mục, phương thức, tiền VND, nội dung, số chứng từ, mã booking và phòng. Bật **Thông tin bổ sung** để nhập nguồn/đối tác, người nộp/nhận, ca, mã cọc, tính chi phí và lý do trùng.
4. Ngày dùng `dd/mm/yyyy` hoặc `yyyy-mm-dd`. Tiền dùng số nguyên VND như `1250000` hoặc `1.250.000`. Công thức tiền, số thập phân và giá trị không hợp lệ bị chặn; không thực thi công thức Excel.
5. **Tab** chuyển ô tiếp; **Enter** xuống dòng cùng cột; **Shift+bấm chuột** chọn vùng; **Ctrl+C** sao chép vùng; **Ctrl+D** điền xuống; **Ctrl+Z** hoàn tác và **Ctrl+Shift+Z** làm lại. Chọn ô vuông đầu dòng để nhân đôi hoặc xóa dòng trong bảng.
6. Bấm **Kiểm tra bảng**, sửa ô đỏ/cột kết quả rồi **Lưu N dòng chờ duyệt**. Các dòng mẫu chưa nhập được bỏ qua. Tổng Thu/Chi phía trên chỉ cộng các dòng trong bảng, chưa phải tổng đã ghi sổ.

## Kết quả lưu và xử lý lỗi

- Dữ liệu chia thành các đợt 25 dòng. Mỗi dòng có kết quả riêng. Một dòng bị khóa/trùng ở máy chủ không hủy những dòng đã lưu thành công.
- Dòng đã lưu chuyển xanh, bị khóa trong bảng; **Dọn dòng đã lưu** chỉ xóa khỏi màn hình nhập. Sửa nghiệp vụ/chứng từ tại **Sổ nhập liệu** hoặc **Duyệt nghiệp vụ** theo quyền và trạng thái hiện tại.
- Dòng lỗi chắc chắn chưa lưu có thể sửa và gửi lại. Các dòng thành công không bị gửi lại.
- Nếu mất kết nối và chưa xác định kết quả, dòng giữ nguyên nội dung và mã chống trùng. Bấm lưu lại trên chính bảng đó hoặc tải **Xem báo cáo** để đối chiếu. Không sao chép thành nghiệp vụ mới. Dòng chưa xác nhận không được xóa/chuyển kỳ để tránh mất khả năng đối chiếu.
- Bảng giữ nháp trong bộ nhớ tab khi chuyển màn hình của phần mềm. **Chưa lưu thì không được bảo đảm sau khi tải lại/đóng tab**; trình duyệt sẽ cảnh báo khi rời trang. Nên lưu từng đợt thay vì giữ bảng chưa lưu lâu.
- Phiếu kho, hóa đơn nhiều mặt hàng, chia phương thức, tiền gộp/phí/VAT, đính chứng từ dùng **Nhập chi tiết** hoặc các sổ nghiệp vụ hiện có.

## Quyền và triển khai

Nhân viên chỉ nhập tại cơ sở được giao; chỉ xem không có bảng nhập. Quản lý có thêm doanh thu/chi phí theo quyền quản lý cơ sở. Máy chủ vẫn kiểm tra khóa ngày/tháng, chứng từ trùng, mã chống gửi lặp và nhật ký qua RPC tài chính hiện có.

Cập nhật **cả frontend và backend**. Không có migration SQL mới cho tính năng này. Kiểm tra tự động dùng cơ sở dữ liệu PGlite tách biệt với dữ liệu thật:

```powershell
node --test frontend/test/*.test.js backend/test/finance*.test.js
$env:VITE_API_URL='https://bluejay-qa.local'
node --input-type=module -e "import {build} from './frontend/node_modules/vite/dist/node/index.js'; await build({root:'frontend',configLoader:'native',resolve:{preserveSymlinks:true}});"
node scripts/check-finance-grid.mjs
```

Script trình duyệt kiểm tra dán 500 dòng, chia đợt 25 dòng, lưu một phần, thử lại khi mất phản hồi không tạo trùng, nhập bàn phím, hoàn tác, phân quyền và cuộn bảng trên điện thoại. Dữ liệu QA không được gửi lên hệ thống đang chạy thật.
