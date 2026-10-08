# Thu thập điểm và tổng đánh giá theo từng nguồn

Kiểm tra trên máy Windows ngày 08/10/2026: danh mục có 85 liên kết thuộc 9 nền tảng. 19 link Google Maps đã chạy được; 65 link còn lại đã được thử bằng Chromium. Hai link cần xác nhận tiếp tục được loại khỏi worker: Google Travel của Mira và TripAdvisor của mục cho thuê phao bơi đang trỏ đến khách sạn khác.

Worker mới bổ sung 52 đích ngoài 19 Google Maps và 12 đích OTA hiện có. Mỗi đích được ghép bằng `entity_key + source`, không tạo thêm dòng địa điểm.

| Nguồn | Kết quả đã xác minh trong lượt thử | Giới hạn thực tế |
|---|---|---|
| Google Maps | 19 địa điểm, điểm /5 và tổng review | Chạy Chromium có cửa sổ với profile riêng đã được người dùng đăng nhập |
| Booking.com | 7 khách sạn, điểm /10 và tổng review | Chỉ đọc card điểm chung; không lấy điểm vị trí/phòng làm điểm tổng |
| Expedia | 5 khách sạn có số liệu đọc được | Có trang bắt đầu trả 403 ở lượt sau; giữ số liệu cùng thời điểm đọc thành công. Vistara chưa có tổng xác minh |
| Agoda | 4 khách sạn quản lý đã chạy OCR; thêm Silkotel 8,9/10 với 3.579 review và The Code 8,6/10 với 793 review | Card có thể khác bố cục; không lấy 10 điểm gần đây hoặc tổng gộp Booking |
| Trip.com | 3 khách sạn quản lý đã có tổng xác minh | Link khách sạn so sánh có thể chuyển sang đăng nhập; không lấy số liệu từ trang đăng nhập |
| TripAdvisor | Yzistel đọc được 4,9/5 và 77 review trong lượt đầu | Các lượt sau và phần lớn link khác trả 403. Tích hợp bộ đọc/chụp, không cam kết vượt chặn |
| Grab | 3 café và Highlands có điểm cùng tổng lượt chấm điểm | `ratingCount` được ghi là lượt chấm điểm, không gọi là số bài review; hai link GrabMart chỉ mở trang tải ứng dụng |
| ShopeeFood | 6 địa điểm có tổng/mốc hiển thị | Giữ nguyên `10+`, `50+`; Trandoc có tổng chính xác 1. Không suy ra điểm từ sao trống hay `reviewRating` của một đánh giá |
| Traveloka | Đã thử 7 link | Trả trang chặn 403, chưa có dữ liệu xác minh |

Lượt worker chạy trực tiếp trong Git Bash sau đó đã tăng nhóm mới lên 36 nguồn có số liệu, trong đó TripAdvisor có 12 địa điểm có dữ liệu (11 đọc mới và Yzistel giữ lần đọc trước). Khả năng mở trang khác nhau giữa các lượt; trạng thái chặn và thời điểm dữ liệu vẫn được giữ riêng. Google đã quét lại 19 đích; An Dương có lượt chỉ đọc được điểm, nên tổng 12 đã xác minh trước đó được giữ với thời điểm cũ.

Phần OTA cũ cũng dùng Chromium có cửa sổ trên Windows theo mặc định (`OTA_BROWSER_HEADLESS=false`), vì kiểm tra thực tế ghi nhận một số trang trắng khi chạy ẩn. Sau thay đổi này đã chạy lại thành công Agoda của cả 4 khách sạn quản lý. Bộ đọc chấp nhận cả card bắt đầu bằng điểm và card có nhãn “Điểm số qua Agoda”, bỏ qua điểm của biểu đồ 10 đánh giá gần đây. OCR không khớp vẫn chuyển sang đọc card đã xác minh; không gắn nhãn đọc ảnh cho kết quả đọc trang.

## Cấu hình và triển khai

Sau các migration hiện có, áp dụng `supabase/public-source-summary.sql`, rồi `supabase/public-source-links.sql`. Trong lượt triển khai này hai migration đã được áp dụng vào Supabase cùng 25 nguồn mới có dữ liệu xác minh. Ba link được sửa từ URL chuyển hướng đã kiểm tra: TripAdvisor Yzistel, Grab café Hội An và ShopeeFood Trandoc. Seed danh mục cũng chứa các URL đã sửa.

Backend dùng thêm `GET /api/public/worker/targets` và `POST /api/public/worker/results`, bảo vệ bằng `OTA_WORKER_SECRET` hiện có. RPC chỉ cấp quyền cho `service_role`; endpoint không mở dữ liệu cho người dùng chưa đăng nhập.

`worker/Start-Worker.ps1` kiểm tra cả ba nhóm API rồi chạy một daemon. Chu kỳ gồm các nguồn công khai, Google Maps và OTA; nghỉ theo `OTA_INTERVAL_MINUTES` (mặc định 60) sau mỗi lượt. Máy Windows cần thức, có mạng và worker còn chạy. Chưa có tác vụ tự khởi động sau khi Windows khởi động lại.

Thử một nguồn mà không ghi dữ liệu:

```powershell
cd worker
node --env-file=.env src/run.js --dry-run --source=booking
node --env-file=.env src/run.js --dry-run --source=public
```

`--entity=entity-key` giới hạn đích của bộ đọc công khai; `--source=public` chỉ chạy nhóm mới, không chạy Google/OTA cũ. `src/audit-sources.js` chụp từng link để chẩn đoán, không tự coi mở được trang là đọc được điểm.

## Kiểm chứng và bảo toàn dữ liệu

Ảnh card và JSON số liệu được lưu tại `OTA_EVIDENCE_DIR/public-summary`, ảnh lỗi kèm trạng thái được lưu riêng. OCR dùng `vie+eng`; chỉ gắn nhãn đọc ảnh khi độ tin cậy >=90 và các trường đọc từ ảnh khớp độc lập với card của đúng nguồn. Nếu OCR không đủ tin cậy nhưng card/metadata của đúng địa điểm xác minh được, dùng đọc trang và giữ ảnh làm bằng chứng. Không giải CAPTCHA, không dùng proxy hoặc giả lập để vượt chặn.

URL phải thuộc nền tảng đã đăng ký và giữ mã địa điểm khi chuyển hướng. TripAdvisor sử dụng ID `d...`, Expedia sử dụng ID `h...`, Grab sử dụng merchant ID; Booking sử dụng quốc gia + slug và chấp nhận đổi ngôn ngữ. Card điểm không được đọc từ khách sạn gợi ý hoặc vị trí lân cận.

Lỗi không xóa điểm/tổng cũ. Điểm và tổng có thời điểm riêng; dữ liệu đến chậm không ghi đè trường mới hơn. Mốc `10+`/`50+` có trường riêng, không chuyển thành tổng chính xác. Bảng hiển thị phần chưa xác minh và nguồn bị chặn/yêu cầu ứng dụng/đăng nhập.

Kiểm thử: backend gồm validation, phân quyền RPC, thang điểm, giữ số liệu cũ, dữ liệu chậm và định danh nguồn; worker kiểm tra card Booking/Expedia/TripAdvisor/Agoda cùng mốc ShopeeFood; frontend build Vite.
