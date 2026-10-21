# Quay clip luồng kết nối TikTok trong VJH Workspace

## Chuẩn bị

- Chờ cả frontend và backend Render triển khai bản có module TikTok.
- Thêm Client key/secret của đúng Sandbox và Redirect URI vào Environment của backend. Không quay màn hình đang hiển thị Client Secret hoặc token.
- Trong TikTok Sandbox, thêm tài khoản cần thử vào Target users; bật Login Kit Web, Display API và các quyền `user.info.basic`, `user.info.stats`, `video.list`; Apply changes.
- Redirect URI đăng ký trong Login Kit phải trùng chính xác:

`https://hotel-review-tracker-api-gbp.onrender.com/api/tiktok/callback`

## Thao tác quay

1. Đăng nhập phần mềm bằng tài khoản quản trị viên.
2. Mở **Marketing & Tiếp cận → TikTok**. Quay trạng thái chưa kết nối, nút **Connect TikTok** và liên kết chính sách quyền riêng tư.
3. Chọn **Địa điểm TikTok**, kiểm tra @tài khoản cần cấp quyền, rồi bấm **Connect TikTok**. Trình duyệt chuyển sang trang đăng nhập/cấp quyền chính thức của TikTok.
4. Đăng nhập tài khoản Target user và đồng ý các quyền hiển thị. Tạm dừng quay nếu cần nhập mật khẩu hoặc mã xác thực.
5. Sau khi cấp quyền, phần mềm tự quay về tab TikTok và hiển thị tên tài khoản, trạng thái kết nối, follower, tổng lượt thích, số video công khai và báo cáo video.
6. Cuộn xuống biểu đồ tròn, đổi chỉ số lượt xem/thích/bình luận/chia sẻ; mở **Chi tiết video**. Các số này là tích lũy của video tại lần cập nhật, không phải phát sinh trong kỳ.
7. Bấm **Cập nhật TikTok**, sau đó tải lại trang để thể hiện báo cáo đã lưu vẫn còn. Không cần sao chép access token thủ công.
8. Nếu cần minh họa thu hồi quyền, bấm **Ngắt kết nối** và xác nhận. Thao tác này xóa báo cáo/lịch sử TikTok đang lưu cho địa điểm được chọn; chỉ làm khi bạn muốn xóa các dữ liệu đó.

Chưa cấp quyền thành công thì phần mềm chỉ hiện hướng dẫn và trạng thái chưa kết nối. Không dùng dữ liệu kiểm thử hoặc ảnh QA để thay cho dữ liệu thật trong clip trình diễn kết nối.

Lặp lại bước chọn địa điểm → Connect TikTok → đăng nhập đúng tài khoản cho cả 5 địa điểm. Có thể bấm Cập nhật tất cả TikTok và xem biểu đồ so sánh. Kết nối cũ chưa gán địa điểm được giữ riêng; không tự đổi thành tài khoản khách sạn.
