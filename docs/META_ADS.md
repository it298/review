# Meta Ads

Mở **Marketing & Tiếp cận → Meta Ads**. Đọc duy nhất tài khoản **337065855108233** do người dùng xác nhận. Tab Tổng quan cũng đọc bản lưu theo cùng khoảng ngày. Không tự suy đoán khách sạn từ tên chiến dịch, không cộng số quảng cáo trả phí vào số liệu Page.

Backend dùng `META_ADS_ACCESS_TOKEN`, hoặc `META_USER_ACCESS_TOKEN` hiện có nếu chưa có biến riêng. Token cần `ads_read` và quyền xem tài khoản quảng cáo; token có `ads_management` phù hợp cũng có thể có quyền đọc. Chưa có token/quyền thì không thể xác nhận dữ liệu thật. Không cần thay Page token dùng Facebook/Instagram. Phiên bản dùng `META_GRAPH_VERSION`, rồi `META_API_VERSION`, mặc định `v26.0`. Không ghi token vào frontend, request URL, log, file báo cáo hoặc phản hồi lỗi.

Kiểm tra bằng Graph API Explorer, đúng app và User Access Token: GET `me/permissions` để xem quyền; GET `act_337065855108233?fields=account_id,name,currency` để kiểm tra tài khoản. Chỉ quản trị/quản lý được POST đồng bộ; tài khoản chỉ xem đọc bản lưu. ID bị cố định phía server, không cho client yêu cầu tài khoản bất kỳ.

## Dữ liệu

`GET /api/meta-ads/status`, `GET /api/meta-ads/report?from=...&to=...`, `POST /api/meta-ads/sync` JSON `{from,to}`. GET report chỉ đọc bản lưu. POST lấy account metadata, account insights, campaign insights toàn kỳ và metadata chiến dịch; đầy đủ phân trang qua cursor. Không gọi theo paging URL từ provider. Giới hạn 93 ngày/lần, tối đa 100 trang/collection và thời gian đồng bộ 180 giây. Lỗi giữa chừng không ghi đè báo cáo cũ. Dùng khóa hash `marketing:report:*` và RPC riêng tư `review_tracker_marketing_set` sẵn có; không cần migration, policy hoặc database mới.

Tổng chi tiêu, reach, impressions, frequency, CTR/CPC/CPM lấy từ **account insights**, không cộng reach chiến dịch hoặc lấy trung bình rate. `spend` giữ đơn vị tiền tệ tài khoản, không chia 100 như giá trị ngân sách dạng minor unit. Múi giờ do account trả về. API đặt `use_account_attribution_setting=true`, `action_report_time=impression`; Ads Manager cần cùng kỳ, tài khoản, cấp báo cáo, filter và attribution để đối chiếu. Dữ liệu có thể được Meta cập nhật lại sau lần lưu.

ThruPlay dùng `video_thruplay_watched_actions:video_view`; chi phí dùng `cost_per_thruplay:video_view`. Cuộc trò chuyện dùng action `onsite_conversion.messaging_conversation_started_7d`; chi phí dùng action tương ứng trong `cost_per_action_type`. Tương tác bài viết dùng `post_engagement`. Không cộng các action này thành “Kết quả” chung. Cuộc trò chuyện từ quảng cáo không phải tổng tin nhắn Inbox. Giá trị thiếu giữ null (—), số 0 do provider trả giữ 0. Meta trả collection rỗng thì chưa tự điền tất cả chỉ số bằng 0.

Trạng thái là `effective_status` ở lần đồng bộ, không phải trạng thái lịch sử của từng ngày. Bảng chỉ liệt kê chiến dịch có insights trong kỳ. Cấp nhóm quảng cáo/quảng cáo và ngân sách quy đổi đầy đủ chưa có trong giao diện bản này; metadata ngân sách API chưa dùng để tính chi tiêu. Không tự suy ra “đã hoạt động nhưng 0 đồng” từ thiếu insights.

CSV áp dụng bộ lọc tên chiến dịch, có tài khoản/kỳ/múi giờ/tiền tệ/attribution, chống công thức từ tên. KPI vẫn là toàn tài khoản; biểu đồ/bảng theo filter tên. Không gắn dữ liệu demo vào sản phẩm.

## Kiểm tra

`node --test backend/test/meta-ads.test.js` kiểm tra hành động, tài khoản/kỳ, null/0, paging, lỗi token, không ghi đè khi lỗi, khóa namespace và quyền RPC bằng PGlite, phân quyền sync. `node scripts/check-meta-ads.mjs` kiểm tra UI/CSV bằng fixture biệt lập desktop/mobile. Chưa khẳng định đã đọc Meta production cho đến khi xác minh token và gọi đồng bộ trên bản Live.

Tham chiếu chính thức: [Meta Insights](https://developers.facebook.com/docs/marketing-api/insights/), [Meta SDK AdsInsights fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py).
