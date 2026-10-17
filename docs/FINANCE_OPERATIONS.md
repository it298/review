# Vận hành Thu–chi & HĐKD

## Quyền và màn hình

| Tài khoản | Quyền cơ sở | Nội dung tài chính |
|---|---|---|
| Nhân viên | Nhập liệu (`editor`) | Thu/chi, chứng từ, bàn giao ca, hóa đơn nhiều dòng, kiểm kê, sổ đã nhập, số lượng tồn và cọc |
| Quản lý cơ sở | Quản lý (`manager`) | Dashboard các cơ sở được giao, duyệt/trả lại, doanh thu lưu trú, công nợ, danh mục hàng, lương/BH, lịch phân bổ, HĐKD, xuất báo cáo |
| Chỉ xem | Xem hoặc nhập liệu | Xem dữ liệu vận hành tại cơ sở; không ghi/sửa/duyệt; không lấy báo cáo HĐKD hoặc lương của quản lý |
| Quản trị viên | Toàn bộ | Như quản lý và thêm cấp tài khoản, phân quyền cơ sở |

Quản lý cần **cả vai trò tài khoản lẫn quyền quản lý tại từng cơ sở**. Đặt vai trò Quản lý cơ sở ở Tài khoản, rồi cấp quyền cùng tên ở Thu–chi → Lịch sử & quyền. Đổi một mục không tự cấp mục còn lại. Nhân viên không được nhận doanh thu/chi phí ghi nhận, lương hay nhật ký quản lý từ API báo cáo. Các module đánh giá/Bluejay giữ cơ chế truy cập hiện có.

## Luồng mỗi ngày

Nhập nhiều nghiệp vụ cùng lúc bằng **Nhập bảng (Excel)**, tối đa 500 dòng; xem [hướng dẫn nhập hàng loạt](FINANCE_GRID.md). Chế độ **Nhập chi tiết** vẫn dùng cho chứng từ và nghiệp vụ có thông tin mở rộng.

1. Nhân viên nhập thu/chi thực tế, tách phương thức nếu cần, đính chứng từ. Có thể gỡ chứng từ đính nhầm khi phiếu còn chờ duyệt; lý do và metadata cũ lưu trong nhật ký, tệp gốc vẫn riêng tư.
2. Bán hàng: lập **một hóa đơn nhiều dòng**, chọn hàng cần xuất kho, điền tiền đã thu, giảm giá và VAT đã gồm trong giá. Không nhập lại phiếu thu/doanh thu/xuất kho cho cùng hóa đơn. Duyệt hóa đơn tạo các dòng liên kết trong cùng transaction; lỗi một dòng hủy cả lần ghi sổ.
3. Quản lý duyệt nghiệp vụ/hóa đơn trước. Nhân viên chọn các nghiệp vụ của từng ca và nhập tồn đầu, bàn giao thực tế từng quỹ. Một nghiệp vụ chỉ bàn giao một ca; các ca đã duyệt nối số dư theo thứ tự. Chênh lệch cần giải trình. Bàn giao không tạo tiền lần hai.
4. Kiểm kê: nhập số lượng đếm thật. Tồn sổ được chụp tại lúc lưu phiếu và kiểm tra lại lúc duyệt; thay đổi tồn yêu cầu kiểm tra/lưu lại. Thiếu thành phiếu hao hụt; thừa thành phiếu nhập có giá vốn bổ sung, không sinh tiền.
5. Hoàn tất các phiếu mở rộng đang chờ, rồi gửi báo cáo ngày. Quản lý đối chiếu tồn quỹ, chứng từ và chốt. Ngày không phát sinh vẫn gửi báo cáo có ghi chú.

## Quản lý tổng hợp

- **Lưu trú:** nhập doanh thu thuần của phòng/kỳ lưu trú đã đối chiếu, sau giảm giá và không gồm VAT. Chia chính xác đến từng VND theo số đêm; không tính ngày trả phòng. Một mã riêng cho mỗi phòng. Booking Bluejay chỉ điền mã/phòng/nguồn; giá booking không tự trở thành doanh thu.
- **Công nợ:** hóa đơn/lưu trú đã duyệt tự có phải thu. Phải thu/phải trả khác lập một lần với mã duy nhất, đối tác và hạn thanh toán. Tiền thu/chi đã duyệt có cùng số chứng từ được đối chiếu tự động; cọc bị loại. Không dùng lại mã cho một sổ nợ khác. Chi tiết hiển thị ID phiếu tiền đã khớp. Không tự nhập lại snapshot Công nợ OTA của Bluejay vào sổ mới nếu chưa đối soát khoản gốc.
- **Lương/BH:** nhập công, lương/công, phụ cấp, BH doanh nghiệp, BH nhân viên và khấu trừ theo bảng lương đã duyệt. Chi phí = lương gộp + BH doanh nghiệp; thực lĩnh = lương gộp − BH nhân viên − khấu trừ. Đây là công thức tổng hợp, không tự xác định mức đóng theo luật, thuế TNCN hoặc chuyển tiền trả lương. Khi chi lương, không nhận chi phí lần nữa.
- **Phân bổ:** tiền thuê, phí quản lý, marketing hoặc tài sản/công cụ; ngày bắt đầu là đầu tháng, 1–120 tháng. Duyệt sinh lịch chi phí từng tháng, giữ đúng tổng số tiền, không tạo dòng tiền. Chi phí tháng tương lai chỉ vào báo cáo tháng đó. Hủy cả lịch phải mở những kỳ liên quan trước.
- **HĐKD:** doanh thu, giá vốn, lãi gộp, từng nhóm chi phí, kết quả tạm tính; dòng tiền trình bày riêng. Chưa đủ số liệu không coi là báo cáo lợi nhuận hoàn chỉnh. Không tự nối lại các công thức IMPORTRANGE hay số liệu cũ trong Excel.
- **Excel / PDF ngang:** theo cơ sở và khoảng ngày đang chọn, gồm HĐKD (quản lý), sổ, theo ngày, kho, công nợ (quản lý), phiếu và hóa đơn. PDF qua cửa sổ in, chọn Lưu thành PDF; Excel chứa số thực, không phải ảnh. Nhân viên không được xuất các sheet dành cho quản lý.

Phiếu đã ghi sổ không sửa rời từng dòng liên kết: hủy cả phiếu có lý do rồi lập phiếu thay thế. Nếu đã bàn giao, mở/hủy bàn giao trước. Khóa ngày/tháng vẫn áp dụng. Chống gửi trùng theo UUID, khóa phiên bản khi sửa và mutex từng cơ sở tránh ghi đè đồng thời.

## Cài đặt và xác nhận

**Cài mới:** chạy lần lượt `finance-module.sql`, `finance-workflow.sql`, `finance-books.sql`. **Nâng cấp hệ thống đã có workflow:** chỉ chạy `finance-books.sql`. Sau khi có books wrapper, không chạy lại các migration cũ để ghi đè RPC; nâng cấp về sau phải có migration phiên bản mới. Các migration books có thể chạy lại an toàn.

Ngày 15/10/2026 đã áp dụng `finance-books.sql` trong Supabase hiện tại qua SQL Editor. Chỉ tạo cấu trúc/logic; không nhập các dòng QA hay dữ liệu tài chính Excel vào production. Mã frontend/backend còn cần Git push và Render deploy.

Kiểm tra: 19 kiểm tra backend về đăng nhập, quyền, dashboard, workflow, nghiệp vụ mở rộng, công nợ và Bluejay đã qua. PGlite chạy SQL thật: chặn vượt kho, rollback toàn bộ hóa đơn lỗi, chống ghi trùng, khóa phiên bản, kiểm kê thay đổi, ca trùng, công nợ vượt thu và RLS. Kiểm tra trình duyệt cục bộ dùng cùng router/SQL: nhân viên tạo hóa đơn, quản lý duyệt, số thu/doanh thu/giá vốn đúng, chỉ xem không nhập, Excel đọc lại và PDF A4 ngang. Các ảnh/PDF QA là dữ liệu mẫu, không chứng minh đối soát tổng số liệu kinh doanh thật.
