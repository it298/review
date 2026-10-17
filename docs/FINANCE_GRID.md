> Tài liệu luồng tài chính cũ. Luồng chính hiện tại là [Báo cáo quản lý từ Excel](MANAGEMENT_REPORTS.md); các bước nhập/duyệt/chốt dưới đây không còn hiển thị ở sidebar. Dữ liệu/API cũ vẫn được giữ.

# Nhập thu–chi nhiều dòng như Excel

## Mở màn hình

- Nhân viên: **Thu–chi & HĐKD → Nhập thu–chi → Nhập bảng (Excel)**.
- Quản lý: **Thu–chi & HĐKD → Điều chỉnh → Nhập bảng (Excel)**.
- Chọn cơ sở, khoảng ngày và bấm **Xem báo cáo** để kiểm tra dữ liệu, trạng thái khóa hiện có trước khi nhập.

## Nhập nhanh

### Tải file Excel và tự ghép cột

Bấm **Tải Excel lên**, chọn file `.xlsx` / `.xls` tối đa 10 MB. File được đọc ngay trong trình duyệt; file gốc không được gửi lên máy chủ. Chọn sheet và cơ sở/kỳ nhận đúng với file. Hệ thống tự tìm hàng tiêu đề, ghép tên cột tiếng Việt/tiếng Anh thông dụng, nhận diện bảng thu/chi đặt cạnh nhau và tiêu đề hai hàng của mẫu khách sạn. Một hàng có tiền mặt, chuyển khoản hoặc thu/chi ở nhiều cột sẽ tách thành các nghiệp vụ riêng. Các bảng số tổng/đối chiếu bên phải và khoản cọc đã thu trước đó được loại khỏi phần nhập tự động để tránh tính trùng.

Mở **Xem / sửa ghép cột tự động** để đổi trường tương ứng hoặc bỏ qua cột. Có thể đổi hàng tiêu đề và chọn ngày, loại, phương thức mặc định cho ô trống. Các hạng mục/phương thức chưa rõ được giữ lại để sửa, không tự áp vào một hạng mục tùy ý. Hệ thống không tự tạo doanh thu hoặc chi phí đã ghi sổ từ tổng tiền thu/chi.

Xem trước tối đa 30 dòng và tổng Thu/Chi của các vùng đang chọn trong sheet. Bấm xem các dòng/ô bỏ qua để kiểm tra dòng tổng, dòng không có thông tin và tiền bằng 0. **Giá trị đã lưu của công thức được đọc tự động khi tải file**, gồm cả ngày, nội dung và số tiền; không cần bật thêm bước xác nhận. Phần mềm không chạy hay tính lại công thức: cần bảo đảm file đã tính và lưu đúng trước khi tải. Nếu file thiếu kết quả công thức, dòng vẫn hiện để sửa; phần mềm không đổi thành 0 hoặc âm thầm bỏ dòng. Mở file trong Excel, tính và lưu lại rồi tải lên, hoặc nhập giá trị thủ công. Có thể tắt tùy chọn đọc giá trị đã lưu nếu muốn tự kiểm tra các ô công thức.

Chọn **Từ nghiệp vụ số**, **Số nghiệp vụ đưa vào bảng** để nhập từng đợt tối đa 500 dòng, tùy số chỗ còn trống trong bảng. Xác nhận đúng cơ sở/vùng/cột, bấm **Đưa N dòng vào bảng**. Dữ liệu lúc này mới có ở bảng nhập; kiểm tra ô đỏ, sửa và bấm **Lưu N dòng chờ duyệt**. Với file lớn, giữ phần nhập file mở, lưu và dọn các dòng thành công rồi nhập tiếp đợt sau. Chọn sheet khác để nhập các phần còn lại.

Các dòng cùng nguồn sheet/dòng/cột, cùng dữ liệu chuẩn bị và cùng cơ sở có mã chống lặp ổn định khi nhập lại. Những dòng đã có trong bảng không được thêm lại; lưu lại đúng mã qua cùng tài khoản không tạo thêm bản ghi. Đây không phải bảo đảm gộp mọi bản sao đã sửa nội dung, đổi vị trí nguồn hoặc nhập bằng các tài khoản khác nhau; vẫn đối chiếu chứng từ như khi nhập trực tiếp.

### Gõ hoặc dán vùng ô

1. Mỗi dòng là một nghiệp vụ. Có sẵn 20 dòng trống; thêm 20 hoặc 100 dòng, tối đa 500 dòng trong một bảng.
2. Nhập trực tiếp hoặc sao chép vùng ô Excel rồi Ctrl+V vào ô bắt đầu. Dán được cả hàng tiêu đề theo mẫu; cột theo tên sẽ được nhận diện dù đổi thứ tự. **Mẫu cột để dán** tải hàng tiêu đề TSV để mở trong Excel; hoặc dùng chức năng tải file ở trên.
3. Cột cơ bản: ngày, loại nghiệp vụ, hạng mục, phương thức, tiền VND, nội dung, mã booking và phòng. Bật **Thông tin bổ sung** để nhập nguồn/đối tác, người nộp/nhận, ca, mã cọc, tính chi phí và lý do trùng.
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

Bảng nhập và phần ghép cột Excel không có trường Số chứng từ vì các mẫu thu–chi hiện tại không dùng cột này. Mã booking được giữ riêng. Cột số chứng từ trong file/mẫu dán cũ sẽ bỏ qua, các cột sau vẫn ghép đúng vị trí; dữ liệu và liên kết chứng từ đã lưu trước đây vẫn giữ nguyên.

Các hạng mục “Tiền quẹt thẻ tháng này/tháng trước” được nhận diện là **Đối soát tiền thẻ**. Giữ riêng dòng ngân hàng nhận tiền và dòng điều chỉnh âm ở phương thức thẻ; không đổi dấu hoặc nhập thêm cột phí khấu trừ thành một khoản tiền thứ ba. Nhóm này không được dùng để ghi nhận doanh thu, chi phí phân bổ hay đồng thời tính chi phí. Các dòng đã đưa vào bảng trước bản cập nhật cần chọn lại hạng mục tương ứng hoặc tải lại file; phần mềm không sửa các bản ghi đã lưu.


### Dòng giống nhau trong Excel

Phần xem trước kiểm tra trùng trên toàn bộ vùng đã chọn, kể cả khi chia nhiều đợt. Cảnh báo chỉ rõ dòng bảng và sheet/dòng/cột Excel gốc; ô Nội dung tô đỏ có thể do trùng nghiệp vụ, không phải do nội dung sai. Khoản dương và âm có khóa trùng khác nhau; phần mềm giữ dấu gốc.

Khi các ô gốc khác nhau có cùng thông tin, người nhập cần đối chiếu file. Nếu là các nghiệp vụ riêng, chọn “Tôi đã đối chiếu…” trong phần nhập Excel hoặc “Đã đối chiếu, giữ … dòng theo Excel” trên bảng. Phần mềm ghi lý do vào từng nghiệp vụ, không tự xóa, gộp hoặc bỏ qua dòng. Nếu là lặp thực sự, xóa dòng thừa trong bảng. Nút xác nhận không áp dụng cho bản sao nhập tay, cùng ô Excel, chứng từ trùng hoặc dòng đã gửi/lưu. Sửa nội dung sau khi xác nhận sẽ bỏ xác nhận tự động để kiểm tra lại. Nhân đôi dòng không sao chép lý do trùng.

Xác nhận qua phần xem trước hoặc bảng giữ cùng mã chống gửi lại theo cơ sở/ô gốc/dữ liệu; không tạo mã mới chỉ vì xác nhận trùng. Chỉ dữ liệu được lưu chờ duyệt sau khi bấm Lưu; quản lý tiếp tục duyệt như các khoản khác.


### Dịch vụ khách sạn

Nhãn “DỊCH VỤ KS”, “DV KS”, “Dịch vụ khách sạn”, kê đệm/giường phụ và phụ thu trẻ em được nhận diện là **Dịch vụ khách sạn**. Nếu cột dịch vụ ghi nhãn chung này nhưng nội dung rõ là tiền phòng/nâng hạng phòng, phần mềm ưu tiên **Tiền phòng**; khoản không rõ hạng mục vẫn cần sửa. Nội dung, mã booking, phương thức, số tiền và dấu âm được giữ nguyên. Thu dịch vụ vẫn là tiền thu chờ duyệt, không tự ghi nhận thêm doanh thu HĐKD.

Hạng mục mới dùng chung cho frontend và backend, cần triển khai cả hai. Không cần thay đổi bảng Supabase. Với bảng nháp đã nhập trước bản sửa, chọn hạng mục mới trong ô đang đỏ hoặc tải lại file vào bảng mới; không thêm lần hai các dòng đã lưu bằng cách đổi vị trí/cấu trúc file.


### Phí ngân hàng và lãi tiền gửi

“Phí chuyển khoản expedia”, phí chuyển tiền/ngân hàng/duy trì tài khoản được nhận diện là **Phí ngân hàng / chuyển khoản**. “Lãi tiền gửi”, lãi ngân hàng/tài khoản là **Lãi tiền gửi**. Có thể sửa hạng mục này trong bảng nháp sau khi bản mới được triển khai.

Giữ loại và dấu theo file: khoản phí -2.200đ trong cột thu chuyển khoản vẫn là điều chỉnh giảm tiền thu; khoản lãi 19.487đ là tiền thu. Hai khoản làm tăng tiền thu ròng 17.287đ, không tự tạo khoản chi 2.200đ khác hoặc ghi doanh thu/chi phí HĐKD lần nữa. Khi cần ghi nhận kết quả kinh doanh, quản lý ghi nghiệp vụ doanh thu lãi hoặc chi phí ngân hàng riêng theo luồng hiện có. Hạng mục mới cần cả frontend/backend cùng phiên bản; không cần SQL mới. Ô thiếu nội dung/hạng mục vẫn cần người nhập xác nhận, không tự điền thông tin không có trong file.


### Bồi thường, nhân sự casual và thuê cơ sở

“Chi bồi thường KH” được nhập thành **Bồi thường khách hàng**, tách khỏi hoàn tiền và giặt ủi. “Casual HK”/“Casual Housekeeping” là **Nhân sự**. Nhãn “Chi thuê khách sạn” và cách viết “Chi thuê khác sạn” trong file Sơn Trà được ghép vào **Thuê mặt bằng**. Chỉ nhận diện các nhãn rõ nghĩa này, không tự gán mọi nội dung có từ bồi thường/thuê vào một nhóm. Ngày, diễn giải, dấu, số tiền và phương thức gốc được giữ nguyên. Cờ ghi chi phí không tự bật khi nhập file; các nghiệp vụ tiếp tục chờ quản lý duyệt như trước. Cần triển khai frontend/backend cùng phiên bản; không cần SQL mới.
