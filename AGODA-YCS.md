# Đồng bộ JSON từ Agoda Partner Portal (YCS)

Đã kiểm tra phiên thật trên Windows ngày 09/10/2026 với Vistara Quy Nhon Sea Hotel, ID `83491477`. Luồng không phụ thuộc PMS và không cần người dùng mở F12/chụp ảnh.

## Dữ liệu đã xác minh

Trang Reviews `/mldc/en-us/app/setting/review/83491477` tải hai JSON trên `portal.agoda.com`:

- `/mldc/en-us/api/setting/Review/score/83491477`: dùng chính xác `group.score`, `group.maxScore`, `group.reviewCount`. Lượt thử đọc được **9,4/10, 143 đánh giá**, khớp thẻ trên YCS.
- `/mldc/en-us/api/setting/Review/83491477`: `propertyName` xác nhận tên của trang. Cả hai response phải cùng ID đã đăng ký trên backend; không ghép theo tên gần giống.

Worker chỉ quan sát response khi trình duyệt tải trang bình thường. Không chép cookie, bearer token, OTP hoặc tự gọi/replay endpoint bằng thông tin xác thực xuất ra ngoài. Không lưu raw response chứa thông tin khách; file evidence JSON chỉ gồm property ID/tên, điểm/tổng, thời điểm và phương thức `api`.

Không dùng `searchreviews`, `reviews.length`, số review đang lọc, điểm thành phần hoặc điểm từng review để tính tổng. Chưa lấy nội dung từng review. Đây là endpoint nội bộ YCS, có thể thay đổi; khi schema không khớp, sai trang hoặc hết phiên, giữ số cũ và ghi lượt thất bại.

## Đăng nhập

```bash
cd worker
node --env-file=.env src/open-ycs-login.js
```

Tự đăng nhập, mở khách sạn → Performance → Guest reviews, rồi đóng Chromium. Profile mặc định `worker/ycs-profile/`, đã loại khỏi Git, dùng chung giữa helper và worker, độc lập với Google và Chrome thường. Có thể đổi bằng `AGODA_YCS_PROFILE_DIR`. Không chạy helper và worker YCS cùng lúc vì profile bị khóa.

## Thử một lần

```bash
node --env-file=.env src/ycs-run.js --property=83491477 --dry-run
```

Lệnh này đọc JSON thật, chỉ lưu bản số liệu đã chuẩn hóa ở máy. Bỏ `--dry-run` để cập nhật StayScope qua endpoint worker hiện có. Không cần sửa database hay deploy frontend/backend cho luồng này.

## Bật trong worker chính

Thêm trong `worker/.env`:

```dotenv
AGODA_YCS_ENABLED=true
AGODA_YCS_PROPERTY_IDS=83491477
```

Chỉ đưa ID đã được cấp quyền YCS vào danh sách, phân cách bằng dấu phẩy. Mã khác chưa được kiểm tra bằng phiên này; không tự thêm tất cả khách sạn.

Dừng daemon cũ bằng Ctrl+C, rồi chạy lại:

```bash
node --env-file=.env src/run.js --daemon
```

YCS chạy đầu mỗi chu kỳ. Các nguồn Google/OTA khác tiếp tục theo luồng hiện có. Những khách sạn Agoda đã chọn YCS sẽ bỏ qua quét Agoda công khai để tránh ghi đè thống kê YCS. Cần khởi động lại daemon cũ để nhận thay đổi mã/cấu hình. Không chạy một daemon chính cũ song song với daemon YCS riêng.

Có thể chỉ thử luồng YCS: `node --env-file=.env src/run.js --source=ycs --dry-run`. Worker YCS riêng có `--daemon`, nhưng chỉ dùng khi không còn worker công khai quét Agoda của cùng khách sạn.

Chu kỳ chính quét xong rồi nghỉ `OTA_INTERVAL_MINUTES` (mặc định 60, tối thiểu 15). Máy phải bật, có mạng và tiến trình đang chạy; chưa có tự khởi động Windows. Khi phiên hết hạn, dừng worker, chạy helper để đăng nhập lại rồi bật worker. Không tự giải CAPTCHA hay nhập OTP. Đóng profile sau mỗi chu kỳ; không cần để F12 hay trang Reviews mở trên Chrome thường.

## Lưu và hiển thị

Endpoint `/api/ota/worker/results` đã có ánh xạ ID `83491477` về `quy-nhon-sea-hotel`, giữ một dòng khách sạn. Dữ liệu đi vào summary, daily snapshot và source history hiện có, phương thức `api`. Không thêm nhãn “Extranet” riêng trên UI, không tạo ảnh trong luồng đọc JSON. Lịch sử mới là số thực quan sát tại thời điểm chạy, không tạo dữ liệu quá khứ.
