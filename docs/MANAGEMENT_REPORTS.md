# Báo cáo quản lý từ Excel

Luồng chính thay cho mục Thu–chi & HĐKD: **Báo cáo quản lý → chọn cơ sở/tháng → tải Excel → dashboard**. Không tạo nghiệp vụ hay yêu cầu duyệt/chốt sổ. Các module đánh giá, Blue Jay và marketing giữ hoạt động như cũ. Mã/API tài chính cũ và dữ liệu lịch sử giữ nguyên để tránh xóa dữ liệu; giao diện cũ không còn được nạp trong App.

## Thao tác

1. Mở **Báo cáo quản lý** trên sidebar.
2. Chọn đúng cơ sở nhận file, chọn tháng trong file. Tải một hoặc nhiều file .xlsx/.xls (mỗi file tối đa 10 MB) của cùng cơ sở/kỳ. Mỗi file được đọc và lưu ngay, không có bước nhập dòng/duyệt.
3. Dashboard tự mở tháng vừa tải: số tiền thu, chi, chênh lệch, doanh thu/chi phí/lợi nhuận theo KQ HĐKD. Có lọc cơ sở và ngày, biểu đồ tròn với nhãn/mũi tên, bảng so sánh, chi tiết dịch vụ, xuất CSV theo kết quả tìm kiếm và In/PDF ngang bằng hộp thoại trình duyệt.
4. Mở **Xem các sheet** để xem toàn bộ sheet nguồn theo từng trang 100 hàng. Sheet tham chiếu không tạo thêm tiền thu/chi. Dữ liệu gốc trống/công thức chưa có kết quả không được mặc định thành số 0.
5. Kiểm tra ghi chú nguồn ở mục Kiểm tra dữ liệu. Thiếu nhóm/diễn giải không chặn dashboard nếu ngày/số tiền hợp lệ; thiếu ngày/số tiền không tính vào tổng và được cảnh báo. Sửa Excel và tải bản mới nếu cần điều chỉnh.

## Nguồn và tránh cộng trùng

- Bảng BK THU KS, BK CHI KS, THU CHI MINIMART là nguồn tiền thu–chi. Dấu âm giữ nguyên, tổng/phụ tổng/cọc thu trước và bảng tổng hợp bên phải không cộng thêm. Các ô nguồn khác nhau có cùng nội dung/số tiền vẫn giữ nguyên để phản ánh đúng file và có ghi chú trùng.
- Sheet DV Ngoài là bảng phân tích riêng giá bán, giá thuê, chênh lệch và chiết khấu. Không cộng giá bán/giá thuê vào tổng thu–chi lần nữa. Ô giá thuê trống chưa chứng minh giá vốn bằng 0 nên tổng chênh lệch để “—” khi chưa đủ số.
- Sheet KQ HĐKD lấy đúng dòng TỔNG DOANH THU, TỔNG CHI PHÍ và Lợi nhuận; không cộng dòng tổng với dòng con. Chỉ cộng KPI HĐKD khi đầu cột đúng kỳ và bộ lọc bao trọn tháng. Không lấy tiền thu thay doanh thu hoặc tiền chi thay chi phí. KQ HĐKD có sai tháng nguồn được hiển thị riêng và cảnh báo.
- Các sheet khác (kho, kiểm kê, đồ vải, công suất, OTA/OTP, phân bổ…) giữ để đối chiếu nguồn, chưa tự suy diễn thành tiền/tỷ lệ tổng hợp. Không coi ô trống là 0 hoặc cộng các sheet tổng hợp trùng chi tiết.
- Cơ sở/tháng dùng tối đa một bản `cash` và một bản `business`. Bản cash ưu tiên cho thu–chi, tránh cộng thêm BK THU/BK CHI sao chép trong file QL HĐKD. Nếu chưa có cash riêng thì dùng bản sao trong business. File chỉ có thêm phần chi tiết không phải dữ liệu bổ sung để cộng với bản cùng loại; hãy tải bản đầy đủ cho kỳ đó.

## Lưu trữ và quyền

Backend tự đọc binary Excel, không tin số tổng do client gửi. Lưu riêng vào bucket **private `vjh-management-reports`** trong Supabase Storage bằng service key backend hiện có, không thay đổi ledger và không cần SQL mới. Bucket được tạo ở lần upload đầu; không cấp quyền đọc công khai. Cần SUPABASE_URL và service secret có quyền Storage. File gốc, bản phân tích lịch sử và bản đang dùng lưu riêng; công bố bản đang dùng sau khi hai bản đầu đã lưu thành công. Đọc lại sau tải trang vẫn có báo cáo.

Tải cùng binary lên cơ sở/kỳ/loại đang dùng trả bản hiện tại, không cộng trùng kể cả người tải khác nhau. Bản cập nhật thay active snapshot, giữ nguồn và phiên bản trước trong Storage. Khóa theo cơ sở/kỳ/loại tránh hai lần tải ghi đè chồng; bản đang tải lỗi không thay active. Lịch sử được giữ ở Storage, giao diện hiện chỉ mở bản đang dùng.

Quản trị viên xem mọi cơ sở. Quản lý chỉ xem cơ sở có quyền manager; nhân viên editor chỉ tải lên cơ sở được giao và thấy metadata file đã tải, không đọc số tổng/chi tiết HĐKD qua API. Tài khoản chỉ xem không được tải. Quyền dùng cùng bảng phân quyền tài chính đã có, không tự mở rộng quyền.

## Triển khai và kiểm tra

Cần cả backend/frontend mới. Backend thêm dependency `@e965/xlsx` (đã có lockfile). Render `npm ci` cài cùng phiên bản. Không đẩy secret/file Excel lên Git. Không cần nhập lại dữ liệu sổ cũ; dashboard mới chỉ dùng các file được tải vào trang này.

```powershell
node --test frontend/test/*.test.js backend/test/*.test.js
$env:VITE_API_URL='https://management-qa.local'
node --input-type=module -e "import {build} from './frontend/node_modules/vite/dist/node/index.js'; await build({root:'frontend',configLoader:'native',resolve:{preserveSymlinks:true}});"
node scripts/check-management-reports.mjs
```

Test trình duyệt dùng các file nguồn ở Downloads trên máy này trong fixture riêng, không gửi vào môi trường thật. Kiểm tra upload → API → storage → dashboard, chống trùng khi tải lại, file cash cùng file HĐKD, cập nhật bản thay thế, reload, sheet gốc, phân quyền, hiển thị desktop/mobile. Script check-finance-grid là bài kiểm tra luồng cũ, không áp dụng cho App mới.
