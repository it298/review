# Đăng nhập nhân viên – Supabase Auth

## Bật trên bản chạy thật

1. Đẩy mã lên GitHub, đợi frontend và backend Render triển khai thành công. `AUTH_MODE` chưa cấu hình sẽ giữ chế độ mật khẩu chung để tránh khóa người quản trị trước khi tài khoản mới có sẵn.
2. Trong Supabase của dự án hiện tại → Authentication → Users → Add user → Create new user: tạo `it@vjh.vn`, nhập mật khẩu tối thiểu 12 ký tự trực tiếp trong dashboard và bật Auto confirm user. Không gửi mật khẩu vào chat hoặc lưu Git. Email quản trị bootstrap phải đã xác nhận.
3. Trong Supabase Authentication → URL Configuration: Site URL là `https://hotel-review-tracker-ui.onrender.com`; thêm Redirect URL `https://hotel-review-tracker-ui.onrender.com/?auth=recovery`.
4. Backend Render → Environment: `AUTH_MODE=supabase`, `AUTH_ADMIN_EMAIL=it@vjh.vn`, `FRONTEND_URL=https://hotel-review-tracker-ui.onrender.com`. Giữ SUPABASE_URL và SUPABASE_SECRET_KEY hiện có. Sau đó deploy lại backend.
5. Đăng nhập phần mềm bằng tài khoản `it@vjh.vn`. Sidebar → Tài khoản: cấp tài khoản nhân viên với email, tên, mật khẩu ban đầu và quyền. Tài khoản đăng ký tự do không có `app_metadata.workspace_role` sẽ không được vào dữ liệu.
6. Cấu hình Custom SMTP trong Supabase Auth để gửi email khôi phục cho nhân viên ngoài danh sách email được Supabase cho phép khi dùng dịch vụ email mặc định. Kiểm tra giao nhận email thực tế trước khi đưa chức năng Quên mật khẩu vào vận hành. Không có SMTP hợp lệ thì phần mềm có giao diện và API khôi phục nhưng chưa bảo đảm gửi được mail.

Không cần migration database mới. Phiên và giới hạn đăng nhập lưu trong private KV của dự án đã có, chỉ backend service role truy cập. Không đưa secret key vào frontend.

## Quyền và phiên

- Quản trị: cấp tài khoản, đổi quyền, khóa nhân viên, cấu hình kết nối và toàn bộ dữ liệu workspace. Không tự hạ quyền/khóa mình; email bootstrap không bị quản trị khác thay đổi quyền qua phần mềm.
- Nhân viên: dữ liệu chung của công ty, nhập số liệu và đồng bộ. Chưa phân quyền theo từng khách sạn hoặc từng module.
- Chỉ xem: các API đọc; không sửa/đồng bộ dữ liệu. Được đánh dấu cảnh báo đã xem và đổi mật khẩu của chính mình.
- Khóa/đổi quyền thu hồi phiên cũ. Đổi mật khẩu và đăng xuất mọi thiết bị thu hồi toàn bộ phiên của người dùng. Đăng xuất thiết bị này chỉ thu hồi token hiện tại.
- Phiên thông thường: 12 giờ, token trong sessionStorage. Giữ đăng nhập: tối đa 7 ngày, token trong localStorage. Frontend không lưu mật khẩu ở chế độ email; token phiên ngẫu nhiên lưu hash phía backend. Supabase access token không được trả về từ API đăng nhập workspace.
- Backend kiểm tra trạng thái tài khoản từ Supabase và phiên trên mỗi yêu cầu. Frontend kiểm tra phiên trước khi mount module, khi lấy focus và mỗi phút. Phiên hết hạn trở lại đăng nhập; lỗi kết nối ban đầu có nút Thử lại.
- Link khôi phục xử lý access token ở fragment trong bộ nhớ và xóa khỏi thanh địa chỉ trước khi hiển thị form. Khi đổi mật khẩu xong, người dùng phải đăng nhập lại.
- Người quản trị cung cấp mật khẩu ban đầu cho nhân viên qua kênh nội bộ; phần mềm không tự gửi email tạo tài khoản. Nhân viên đổi mật khẩu ở Tài khoản. Tên và quyền lấy từ tài khoản thực tế, không hiển thị tất cả là quản trị viên.

## Kiểm tra và giới hạn vận hành

Kiểm thử mock Supabase: email/mật khẩu sai, người ngoài/role tự gán trong user_metadata bị chặn, mật khẩu chung không được dùng khi bật email, phân quyền chỉ xem, bảo vệ chính mình, khóa nhân viên, replay token sau đăng xuất, thu hồi mọi phiên, hết hạn, xác nhận mật khẩu hiện tại và khôi phục. Hồi quy auth worker và Blue Jay vẫn đạt.

Build và UI preview dùng fixture riêng; không tạo tài khoản thật hay gửi mail trong kiểm thử. Kích hoạt Auth, tài khoản bootstrap và giao nhận email production cần kiểm tra riêng. Phiên dùng bearer token (không dùng cookie cross-site), vẫn cần giữ frontend tránh XSS; không mở tự đăng ký, không công khai mã backend secret.

Giới hạn đăng nhập dùng private KV và lock để đồng bộ nhiều instance; tối đa 10 yêu cầu trên mỗi IP/email/action trong cửa sổ 10 phút. Hạ tầng Render/NAT có thể khiến nhiều người dùng cùng IP; theo dõi và điều chỉnh sau khi có lưu lượng thực tế.
