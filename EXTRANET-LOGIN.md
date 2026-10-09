# Chuẩn bị phiên Extranet các OTA còn lại

Đã có helper mở trình duyệt riêng cho Traveloka TERA, Booking.com Extranet, Trip.com eBooking, Ctrip eBooking và Expedia Partner Central. **Helper đăng nhập không phải bộ đồng bộ JSON.** Agoda YCS đã có bộ đọc JSON kiểm chứng. Booking đã kiểm chứng thẻ HTML tổng của Vistara Gia Lai Sea Hotel và có bộ đọc tự động; xem [BOOKING-EXTRANET.md](BOOKING-EXTRANET.md) để triển khai backend và bật worker. Traveloka, Trip/Ctrip và Expedia cần kiểm tra phiên thật trước khi triển khai.

Trong `worker/`, dùng một lệnh cho từng nền tảng:

```bash
node --env-file=.env src/open-extranet-login.js --source=traveloka
node --env-file=.env src/open-extranet-login.js --source=booking
node --env-file=.env src/open-extranet-login.js --source=trip
node --env-file=.env src/open-extranet-login.js --source=ctrip
node --env-file=.env src/open-extranet-login.js --source=expedia
```

Chỉ chạy nền tảng bạn có quyền quản lý. Tự đăng nhập, chọn khách sạn và mở Reviews/Guest reviews, sau đó đóng Chromium rồi báo nền tảng và khách sạn đã mở. Không cần ảnh, F12, cookie/token hay mật khẩu gửi vào chat.

Mỗi phiên lưu riêng ở `worker/extranet-profiles/<source>/`, đã loại khỏi Git. Helper không ghi response, nội dung review, dữ liệu đặt phòng hoặc thông tin khách và không tự xác nhận đăng nhập thành công. Booking cần bật riêng bộ đọc sau khi backend và ánh xạ ID đã được triển khai. Các nền tảng khác chưa có bộ đọc cho các profile này. Không chạy nhiều tiến trình dùng cùng một profile.

## Cổng chính thức

- Traveloka: https://tera.traveloka.com/v2/login/ — nguồn hướng dẫn đăng nhập: https://tera.traveloka.com/th-th/partner-hub/login/login-process/login-to-traveloka-tera/
- Booking.com: https://admin.booking.com/
- Trip.com: https://ebooking.trip.com/ — giới thiệu eBooking: https://us.trip.com/list-your-property/faq.html
- Ctrip: https://ebooking.ctrip.com/ — help center: https://ebooking.ctrip.com/ebkgrowth/helpCenter
- Expedia: https://www.expediapartnercentral.com/ — danh sách cổng đối tác: https://partner.expediagroup.com/en-us/log-in

Trip.com và Ctrip được giữ hai profile riêng. Chưa xác minh ID nội bộ hay phạm vi review của hai cổng; không tự ghép/tổng hợp điểm hai kênh. ID Extranet có thể khác ID trang khách đặt phòng, nên cần đối chiếu trước khi ánh xạ vào dòng khách sạn trong StayScope.
