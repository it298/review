# Facebook Analytics — tích hợp VJH Workspace

## Kiến trúc

Backend Express/ES Modules trong `backend/src`, React/Vite trong `frontend/src`, database Supabase hiện có. Module mới dùng `store.js` (RPC, khóa đồng bộ), `utils/date.js` (Asia/Ho_Chi_Minh), middleware auth hiện có và frontend `lib/api.js`. Không thêm dependency, không đổi port/framework/database. Recharts đã có sẵn. Không sửa logic Bluejay, Google hoặc báo cáo Excel.

Page cố định, cùng hotel_key với danh mục công ty:

| Khách sạn | Page ID | hotel_key |
|---|---|---|
| Sontra Sea Hotel | 115021051629190 | sontra-sea-hotel |
| Vistara Gia Lai Sea Hotel | 1303785806154089 | vistara-gia-lai-sea-hotel |
| Vistara Quy Nhon Sea Hotel | 862606296943494 | quy-nhon-sea-hotel |
| Yzistel Hoi An | 341046985766818 | yzistel-hoi-an-39-le-quy-don |

## Cấu hình triển khai

1. Chạy toàn bộ `supabase/facebook-module.sql` trong SQL Editor của Supabase **hiện tại**. Migration có thể chạy lại, không xóa dữ liệu cũ.
2. Tại backend Render → Environment thêm:

   ```dotenv
   META_API_VERSION=v26.0
   META_USER_ACCESS_TOKEN=<nhập token tại Render, không đưa vào Git/chat>
   FACEBOOK_AUTO_SYNC=true
   ```

   Dùng lại SUPABASE_URL, SUPABASE_SECRET_KEY (hoặc SUPABASE_SERVICE_ROLE_KEY), CRON_SECRET, TIMEZONE=Asia/Ho_Chi_Minh. Không thêm token vào frontend/VITE_*. Local backend dùng `.env` qua dotenv từ working directory `backend`.
3. Deploy backend và frontend theo cấu hình Render hiện tại. `.env.example` và `render.yaml` đã bổ sung cấu hình Facebook; service đang có trên Render có thể cần nhập biến trực tiếp.
4. GitHub repository → Actions bật workflow **Sync Facebook Analytics**. Tạo repository variable `FACEBOOK_DEPLOYMENT_URL` = URL **backend** và secret `CRON_SECRET` trùng backend. Biến URL này riêng cho Facebook, không kích hoạt workflow Google hiện có. Chạy `workflow_dispatch` để thử. Cron `30 1 * * *` UTC tương ứng 08:30 Asia/Ho_Chi_Minh; GitHub có thể chạy trễ. Render free có thể ngủ, không đảm bảo chạy đúng từng giây.
5. Quyền token do khách hàng cung cấp: read_insights, pages_show_list, business_management, pages_read_engagement, public_profile. Tài khoản phải có quyền trên cả bốn Page. Token hết hạn cần thay tại backend; module không giả lập refresh token hoặc tự gia hạn.

Không thể chạy sync thật khi chưa có token hợp lệ và migration. Thông báo `configured` chỉ xác nhận biến môi trường có giá trị, không khẳng định token còn hạn.

## API

Tất cả API dashboard qua auth hiện tại. Các tài khoản workspace đã đăng nhập đọc dữ liệu Facebook, theo cách module Marketing Google hiện tại hoạt động. Sync thủ công chỉ admin/manager; member/viewer bị từ chối. Module Facebook không thay đổi quyền của module khác.

- `GET /api/facebook/status`: danh mục Page, phiên bản, trạng thái cấu hình/lịch; không có token.
- `POST /api/facebook/sync?since=2026-10-01&until=2026-10-19`: hoặc JSON body `{ "since":"2026-10-01", "until":"2026-10-19" }`. **since bao gồm, until không bao gồm**, tối đa 366 ngày. Mặc định ba ngày đã hoàn tất gần nhất. Dashboard chọn ngày kết thúc bao gồm, tự gửi until = ngày kế tiếp.
- `GET /api/facebook/insights?hotelKey=sontra-sea-hotel&from=2026-10-01&to=2026-10-19`: `from/to` bao gồm; có thể lọc `pageId`; bỏ bộ lọc để đọc cả bốn Page.
- `GET /api/facebook/followers?from=2026-10-01&to=2026-10-19`: snapshots trong kỳ, baseline trước kỳ, latest hiện tại và previous đúng ngày trước latest. `pageId/hotelKey` tương tự insights.
- `GET /api/facebook/cron`: chỉ nhận `Authorization: Bearer <CRON_SECRET>`, không dùng phiên nhân viên. Trước 08:30 hoặc đã hoàn tất ngày hiện tại thì bỏ qua. Tắt bằng FACEBOOK_AUTO_SYNC=false. Lỗi trả response, không làm crash server. Đợt có Page lỗi không đánh dấu ngày hoàn tất, để có thể chạy lại.

Trong DevTools của phần mềm đã đăng nhập, xem request khi bấm **Cập nhật Facebook** để xác nhận since/until và kết quả từng Page. Không copy token đăng nhập hoặc token Meta vào báo cáo lỗi. `/me/accounts` gọi một lần mỗi đợt (có thể cần trang tiếp theo nếu Meta phân trang), map Page Access Token dùng chung cho bốn công việc. Chỉ sử dụng Page token cho summary/insights. Phân trang dùng cursor trên host Graph cố định, không đi theo URL `paging.next` chứa token.

Kết quả sync có `results` của bốn Page. `ok:false` từng Page không ngăn Page khác lưu thành công. Lỗi lấy danh mục tài khoản làm cả đợt dừng, vì chưa có Page token nào đáng tin cậy. Khóa phân tán Supabase ngăn hai đợt ghi chồng. Các khoảng lớn được chia cửa sổ 30 ngày, tổng thời gian gọi Meta bị giới hạn 240 giây; khi vượt giới hạn, chọn kỳ ngắn hơn để tải bổ sung.

## Database và cách kiểm tra

Hai bảng riêng cần thiết vì module Google hiện có chỉ lưu cache theo khoảng, không lưu fact/ngày hoặc snapshot lâu dài:

- `review_tracker_facebook_daily`: khóa chính `(page_id,metric_date)`, hotel_key/name, post_engagements, media_views, unique_viewers, bucket_end_time, created_at/updated_at.
- `review_tracker_facebook_followers`: khóa chính `(page_id,snapshot_date)`, hotel_key/name, followers_count, fan_count, created_at/updated_at.
- Hai RPC service-only: `review_tracker_facebook_upsert(jsonb)` và `review_tracker_facebook_read(jsonb)`. RLS bật, anon/authenticated không có quyền đọc/ghi trực tiếp. Backend dùng service key hiện có. Không lưu access token trong hai bảng hoặc trả xuống frontend.

Mỗi Page được ghi trong một transaction. Sync lại cập nhật record cũ, giữ created_at, thay updated_at. Chỉ số null không ghi đè số đã lưu; 0 là giá trị thật. API lỗi/response không hợp lệ không xóa dữ liệu cũ. Meta trả rỗng insights thì vẫn ghi follower snapshot và báo rõ chưa có chỉ số, không tự tạo số 0.

SQL Editor:

```sql
select hotel_name,metric_date,post_engagements,media_views,unique_viewers,
       bucket_end_time,created_at,updated_at
from public.review_tracker_facebook_daily
order by metric_date desc,hotel_name;

select hotel_name,snapshot_date,followers_count,fan_count,updated_at
from public.review_tracker_facebook_followers
order by snapshot_date desc,hotel_name;

-- Hai truy vấn này phải trả 0 dòng:
select page_id,metric_date,count(*) from public.review_tracker_facebook_daily
group by page_id,metric_date having count(*)>1;
select page_id,snapshot_date,count(*) from public.review_tracker_facebook_followers
group by page_id,snapshot_date having count(*)>1;
```

## Ngày và ý nghĩa số liệu

`end_time` giữ nguyên **thời điểm** trong `bucket_end_time` kiểu timestamptz, chuẩn hóa ISO UTC khi truyền API. `metric_date` = ngày tại Asia/Ho_Chi_Minh của `end_time - 24h`, tức ngày bắt đầu daily bucket. Ví dụ end_time `2026-10-16T07:00:00+0000` lưu instant `2026-10-16T07:00:00.000Z`, metric_date `2026-10-15`. Đây là bucket ngày của Meta, không chia lại thành ngày lịch 00:00 Việt Nam. UI hiển thị rõ thời gian kết thúc bucket.

Follower chỉ snapshot theo ngày đồng bộ thật, kể cả khi sync một khoảng quá khứ. Không suy ngược follower lịch sử. Delta ngày trước chỉ hiện khi có snapshot đúng ngày liền trước latest; thiếu thì “Chưa đủ snapshot”. Growth trong kỳ dùng baseline ngày trước from nếu có, nếu không dùng snapshot đầu tiên trong kỳ; luôn hiển thị hai ngày thực đo. Chỉ một snapshot thì chưa tính growth.

Unique Viewers là người duy nhất **mỗi ngày**. Tổng cộng dồn ngày có thể trùng người, không gọi là unique cả kỳ. Dashboard ghi rõ điều này. Days coverage hiện trên từng chỉ số, ngày thiếu để trống trong biểu đồ. Không tự nội suy hoặc bù 0.

## Kiểm thử và kiểm tra frontend

```powershell
node --test backend/test/facebook.test.js
node --test --test-concurrency=2 backend/test/*.test.js
npm.cmd --prefix frontend run build
node scripts/check-facebook.mjs
```

Kiểm thử riêng gồm Meta HTTP mock (không token thật), Page token mapping, phân trang an toàn, che lỗi, lỗi một Page/database không ngăn Page khác, lịch cron, ngày/bucket, SQL PostgreSQL/PGlite, upsert/rollback/RLS, tăng follower +16 và API auth/filter. Browser QA dùng dữ liệu fixture có nhãn trong script, không gửi lên production.

Trong phần mềm: mở **Facebook Analytics** ở sidebar hoặc thẻ tổng quan → 7/30 ngày hoặc ngày tùy chỉnh → **Cập nhật Facebook** (admin/manager) → xem bốn thẻ, ba biểu đồ ngày, so sánh và bảng lịch sử. Tải lại trang phải đọc dữ liệu đã lưu mà không cần sync lại.

## File thay đổi

Mới: `backend/src/modules/facebook/{hotels,dates,meta-service,sync,router,auto-sync}.js`, `backend/test/facebook.test.js`, `supabase/facebook-module.sql`, `frontend/src/lib/facebook-report.js`, `frontend/src/pages/FacebookAnalytics.jsx`, `frontend/src/pages/facebook.css`, `.github/workflows/facebook-sync.yml`, `scripts/check-facebook.mjs`, tài liệu này.

Sửa nhỏ: `backend/src/app.js`, `backend/.env.example`, `frontend/src/App.jsx`, `frontend/src/components/Sidebar.jsx`, `frontend/src/pages/WorkspaceHome.jsx`, `render.yaml`. Không sửa worker hoặc các file Analytics website đang tạm dừng.

## Token hết hạn khi vận hành

Nếu workflow báo HTTP 502 với thông báo phiên Meta hết hạn, kiểm tra User Access Token. Meta code 190/subcode 463 xác nhận token đã hết hạn. Thay META_USER_ACCESS_TOKEN trong backend Render bằng User Access Token còn hạn, Save/redeploy rồi chạy lại workflow. Không thay CRON_SECRET. Workflow dùng --fail-with-body để hiện trường error đã được backend loại bỏ bí mật, đồng thời vẫn đánh dấu lượt chạy thất bại.


## Mở rộng báo cáo tiếp cận (19/10/2026)

Áp dụng `supabase/facebook-report-extension.sql` trong SQL Editor của **Supabase hiện tại**, sau migration gốc. Script chạy lại được, không xóa dữ liệu cũ. Cần áp dụng trước khi deploy mã mở rộng; không chạy lại migration gốc sau extension vì sẽ thay thế hàm upsert mở rộng.

Danh mục bổ sung Page **Vintage Taste Deli Cafe — 224431597428014**, giữ riêng cấp thương hiệu và không tự gán cho chi nhánh. Tổng cộng 5 Page, `/me/accounts` vẫn chỉ được đọc một lần trong mỗi đợt (có phân trang nếu Meta yêu cầu).

Chỉ số API bổ sung theo ngày: `page_views_total` → `page_visits`, `page_daily_follows` → `new_follows`, `page_messages_new_conversations_unique` → `new_conversations`. Lượt theo dõi mới là phát sinh, khác tăng trưởng follower ròng. Cuộc trò chuyện mới lần đầu khác tổng tin nhắn hoặc mọi liên hệ Messenger. Mỗi chỉ số bổ sung được thử riêng; lỗi một chỉ số không ngăn lưu chỉ số gốc, có `warnings` và `additionalComplete:false`. Cron đánh dấu hoàn tất khi các Page lưu thành công; cảnh báo bổ sung vẫn hiện trong kết quả, không tự thử lại ngoài lịch vì thiếu quyền chỉ số.

`published_posts` lấy từ edge `/PAGE/published_posts`, phân trang đầy đủ, đếm theo ngày xuất bản tại Việt Nam. Chỉ đếm bài mà API trả được, không suy ra bài đã xóa/không còn khả dụng. Chỉ ghi ngày 0 bài sau khi đọc thành công toàn bộ edge; lỗi thì giữ lịch sử đã lưu.

Không dùng lifetime post clicks thay cho click trong kỳ. Không cộng daily unique viewers thành unique cả kỳ. Click liên kết, người xem duy nhất cả kỳ, liên hệ Messenger theo báo cáo và tỷ lệ phản hồi có thể lấy từ báo cáo gốc nhập bổ sung. Không giả định các chỉ số này luôn được Meta API hỗ trợ với token hiện tại.

### Database và endpoint mới

- Daily facts hiện có thêm nullable bigint `page_visits`, `new_follows`, `new_conversations`.
- `review_tracker_facebook_posts_daily`: khóa Page/ngày, lưu số bài đăng, upsert giữ lịch sử.
- `review_tracker_facebook_period_reports`: khóa Page/từ/đến, 9 chỉ số JSON, nguồn, người lưu, timestamps. Lưu lại đúng kỳ thay bộ số bổ sung của kỳ đó, không cộng kỳ chồng lấn, không ghi đè API.
- RPC riêng `review_tracker_facebook_report(jsonb)` chỉ service role gọi được. Bảng mới bật RLS và từ chối anon/authenticated. Backend áp dụng phân quyền hiện có.
- `GET /api/facebook/report?pageId=...&from=YYYY-MM-DD&to=YYYY-MM-DD`: đọc kỳ chính xác, lịch sử 100 kỳ gần nhất và số bài API theo ngày.
- `POST /api/facebook/report`: admin/manager; body `{pageId,from,to,values,source_note}`. `values` dùng các key ở `shared/facebook-report.js`. Ngày đến ở endpoint báo cáo là inclusive. Không cần environment variable mới.

### Thao tác trên phần mềm

Chọn Page và khoảng ngày → **Báo cáo tiếp cận Facebook**. Bảng 9 chỉ số ghi nguồn API/báo cáo bổ sung và giữ cột API để đối chiếu. Chọn **Nhập bổ sung hoặc tải báo cáo Excel** để nhập tay hoặc tải file mẫu tiếp cận. File hỗ trợ cột tên `ID` hoặc `Brand`, chỉ đọc hàng Facebook, nhận diện từng Page/kỳ. Kiểm tra preview rồi **Lưu kỳ báo cáo đang chọn**. Phần mềm chuyển sang đúng Page/kỳ vừa lưu. Các ô trống, số sai kiểu, ngày nằm trong ô phần trăm và dữ liệu mâu thuẫn được báo riêng. Không chuyển ô lỗi thành 0. Không nhập Website, Instagram, Maps hay TikTok vào Facebook.

**Lịch sử báo cáo bổ sung** mở lại từng kỳ đã lưu mà không cần tải file. **Xuất báo cáo CSV** xuất 9 chỉ số, nguồn, kỳ và số API đối chiếu. Viewer/member xem và xuất; chỉ admin/manager được nhập bổ sung hoặc sync.

### Kiểm tra sau triển khai

1. Chạy extension trên Supabase, deploy backend/frontend.
2. Bấm Cập nhật Facebook; kiểm tra 5/5 Page và không có cảnh báo bổ sung.
3. Kiểm tra SQL:

```sql
select hotel_name,metric_date,page_visits,new_follows,new_conversations,bucket_end_time
from public.review_tracker_facebook_daily order by metric_date desc,hotel_name;
select * from public.review_tracker_facebook_posts_daily order by post_date desc;
select page_id,period_from,period_to,metric_values,source_note,updated_at
from public.review_tracker_facebook_period_reports order by updated_at desc;
```

4. Thử tải file tiếp cận, lưu một kỳ, reload, mở lịch sử và xuất CSV. Không bấm lưu mọi kỳ nếu chỉ muốn xem trước.
5. Kiểm thử riêng: `node --test backend/test/facebook.test.js`; end-to-end fixture: `node scripts/check-facebook.mjs`. Có thể đặt `FACEBOOK_QA_WORKBOOK` thành đường dẫn file gốc để kiểm tra đọc Excel trong trình duyệt; chỉ lưu vào PGlite fixture, không ghi production.

Các file bổ sung: `shared/facebook-report.js`, `frontend/src/lib/facebook-excel.js`, `frontend/src/components/FacebookPeriodReport.jsx`, migration extension. Sửa nhỏ service/sync/router/danh mục Facebook, frontend report/page/CSS, WorkspaceHome và các kiểm thử tương ứng. Không thay logic Bluejay, tài chính, Google Review hay worker.
