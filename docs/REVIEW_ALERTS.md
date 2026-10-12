# Cảnh báo review riêng lẻ

Áp dụng cho các nguồn đã đăng ký trong danh mục: Google Maps, Tripadvisor, Agoda,
Booking.com, Traveloka, Trip.com/Ctrip (nguồn `trip`), Expedia, Grab và ShopeeFood.
Thang 5: đúng 1 sao. Thang 10: điểm thấp ≤ 2/10, luôn hiển thị thang gốc.

Chạy `supabase/review-alerts.sql` sau `directory.sql` và `insights.sql` trước khi
triển khai backend mới. Migration chỉ thêm bảng/RPC, không sửa số tổng hợp hay
lịch sử đang có; không lấy review mẫu cũ làm dữ liệu thật.

## Dữ liệu và cảnh báo

- Mỗi review gắn đúng địa điểm, nền tảng và mã review gốc; URL phải trùng nguồn
  đã đăng ký. Thời gian đăng, sửa và đọc được lưu riêng.
- Lần đọc thành công đầu tiên của từng nguồn là mốc khởi tạo, kể cả khi chưa có
  review. Các review đăng trước mốc này không được báo là mới.
- Review mới đăng sau mốc, hoặc review đã biết được sửa từ điểm cao xuống mức
  thấp, tạo cảnh báo một lần theo mã review và thời gian sửa.
- Nếu nguồn chỉ có ngày đăng, review chưa biết thuộc ngày khởi tạo trở đi được
  ghi là “Mới phát hiện”, không khẳng định vừa đăng hay tự tạo giờ đăng.
- Lần quét lỗi và việc điểm trung bình giảm không tạo cảnh báo 1 sao.
- Cảnh báo ở chuông và trang Cần chú ý, có nội dung, thời điểm, liên kết nguồn,
  bộ lọc nền tảng và thao tác Đánh dấu đã xem. Khi mở phần mềm, kiểm tra mỗi phút.
  Đây là nhịp kiểm tra cảnh báo đã lưu, không phải nhịp quét mọi OTA hay push tức thì.
- Báo cáo khoảng ngày lấy cả cảnh báo mới phát hiện trong khoảng đã chọn.

## Luồng đã nối

Google: khi đồng bộ địa điểm đã liên kết Google Business Profile, backend đọc
`accounts.locations.reviews.list` với `pageSize=50`, `orderBy=updateTime desc`,
duyệt phân trang và ánh xạ `ONE` thành 1/5. Cần kết nối Google có quyền quản lý,
project được Google duyệt API, và `directory.google_place_id` trỏ đúng địa điểm.
Đọc tối đa 20 trang mỗi lượt; lượt dài lưu con trỏ riêng để tiếp tục lần đồng bộ sau.
Địa điểm chỉ quét tổng số/sao bằng trình duyệt chưa có cảnh báo review riêng lẻ.
Lỗi đọc review không làm mất lần đồng bộ tổng số/sao thành công.

Luồng OTA sẵn có (`/api/ota/worker/results`) chuyển review được xác minh vào cơ
chế chung sau khi lưu thành công; không chuyển dữ liệu chỉ có summary hoặc các
review mẫu/pilot cũ. Booking Extranet hiện chỉ đọc điểm/tổng; Tripadvisor worker
đang bị chặn nên chưa tự đọc review riêng lẻ.

Traveloka TERA: worker `traveloka-run.js --daemon` đọc điểm/tổng rồi đổi bộ lọc
thành “Tất cả đánh giá”. Nó quan sát JSON do chính trang đã đăng nhập gửi tới
`astcapi-public.ast.traveloka.com/api/v2/public/review/getHotelReviews`, kiểm tra
hotelId, bộ lọc không giới hạn ngày và thứ tự NEWEST_TIMESTAMP. Chỉ mã review,
điểm gốc, timestamp và reviewText được lưu, không cookie/token/context, thông tin
đặt phòng hoặc tên khách. Thời gian cập nhật riêng không có trong JSON này nên
không cam kết phát hiện chỉnh sửa điểm. Đọc trang đầu 10 review mới nhất mỗi
khách sạn/lượt; cần giữ phiên đăng nhập còn hiệu lực và máy Windows chạy worker.
Ngày 12/10/2026 đã đọc thử thành công 33 review của 4 khách sạn.

## Nối các bộ đọc còn lại

### Worker review công khai riêng

Trong thư mục `worker`, chạy `npm run reviews:daemon`. Worker đọc các review
mới nhất đang hiển thị trên Agoda và Trip.com, độc lập với worker điểm/tổng và
OCR (OCR thành công không khiến bộ đọc review bị bỏ qua). Dùng
`npm run reviews -- --source=agoda --entity=hotel-key` để kiểm tra một nguồn.
Chu kỳ mặc định 60 phút, cấu hình `REVIEW_INTERVAL_MINUTES` tối thiểu 15 phút.
Không đăng nhập OTA, không ghi thông tin đặt phòng hay token; dùng đúng nguồn
đã đăng ký. Không tạo mốc theo dõi rỗng khi panel review chưa đọc được.

Bộ đọc hiện dùng số review gần nhất của trang đầu, tối đa 10 review/lượt;
không cam kết phát hiện đủ nếu số review mới vượt số review trang đầu giữa
hai lượt quét. Google API là bộ đọc có phân trang; Google chưa kết nối API
không được tính là đã đọc review. Traveloka có bộ đọc riêng như trên.
Các nguồn chưa có bộ đọc không được
worker này báo là đã hoạt động.

`GET /api/reviews/worker/targets` trả nguồn quản lý đã đăng ký.
`POST /api/reviews/worker/results` dùng `OTA_WORKER_SECRET`, payload:

```json
{
  "entityKey": "hotel-key",
  "source": "tripadvisor",
  "sourceUrl": "URL công khai đúng như danh mục",
  "method": "extranet-auto",
  "capturedAt": "Thời gian đọc ISO có múi giờ",
  "reviews": [{
    "reviewId": "Mã review thật",
    "rating": 1,
    "ratingMax": 5,
    "reviewedAt": "Thời gian đăng ISO",
    "updatedAt": "Thời gian sửa ISO (hoặc ngày đăng khi nguồn không cung cấp)",
    "title": "Tiêu đề nếu có",
    "content": "Nội dung nếu có"
  }]
}
```

Tối đa 200 review/lượt. Không gửi cookie, token OTA, mã đặt phòng hoặc dữ liệu
khách lưu trú. `method=ocr` chỉ nhận khi có `corroborated=true`. Nguồn bị chặn
giữ số liệu cũ; cần phục hồi phiên/nguồn truy cập trước khi bật thu thập.
Đăng ký quy tắc cho một nguồn không có nghĩa là nguồn đó đã đọc được review.

Google reference: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
