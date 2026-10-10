-- Correct only the nine verified Management Center observations from 10 Oct 2026.
-- The manual RPC was the import transport; the observed source was Extranet.
-- Retain origin/key, all values, capture times, entry times and idempotency.
-- Run after manual-summary.sql. Repeatable; no effect on ordinary manual entries.
begin;
with verified(entity_key,request_id,location_id,captured_at) as (values
 ('sontra-sea-hotel','0a261010-0000-4000-8000-000000000001','24979323','2026-10-10T07:17:55.816Z'::timestamptz),
 ('trandoc-mini-mart-24h','0a261010-0000-4000-8000-000000000002','34694475','2026-10-10T07:18:51.137Z'::timestamptz),
 ('mini-mart-24h-quy-nhon','0a261010-0000-4000-8000-000000000003','34261594','2026-10-10T07:20:28.570Z'::timestamptz),
 ('sontra-mini-mart-24h','0a261010-0000-4000-8000-000000000004','28050884','2026-10-10T07:21:08.091Z'::timestamptz),
 ('vintage-taste-deli-cafe-hoi-an','0a261010-0000-4000-8000-000000000005','32993663','2026-10-10T07:21:54.884Z'::timestamptz),
 ('vintage-taste-deli-cafe-sai-gon','0a261010-0000-4000-8000-000000000006','27457230','2026-10-10T07:22:37.057Z'::timestamptz),
 ('vistara-gia-lai-sea-hotel','0a261010-0000-4000-8000-000000000007','34666891','2026-10-10T07:23:31.388Z'::timestamptz),
 ('yzistel-hoi-an-39-le-quy-don','0a261010-0000-4000-8000-000000000008','33037118','2026-10-10T07:24:14.173Z'::timestamptz),
 ('quy-nhon-sea-hotel','0a261010-0000-4000-8000-000000000009','34097641','2026-10-10T07:25:03.697Z'::timestamptz)
)
update public.review_tracker_source_history h set method='extranet'
from verified v,public.review_tracker_directory_sources s
where h.origin='manual' and h.origin_key=v.request_id and h.entity_key=v.entity_key
 and h.source='tripadvisor' and h.method='manual' and h.attempted_at=v.captured_at
 and h.note like 'Tripadvisor Management Center · đọc từ tài khoản đã cấp quyền; locationId='||v.location_id||' · %'
 and s.entity_key=h.entity_key and s.source=h.source
 and substring(s.source_url from '-d([0-9]+)-')=v.location_id;
commit;
