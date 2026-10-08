-- Explicit mappings verified for YZISTEL. No summary values are invented here.
insert into public.review_tracker_ota_targets(source,property_id,property_name,hotel_key,source_url)
values
('agoda','64821141','YZISTEL HOI AN','yzistel-hoi-an-39-le-quy-don','https://www.agoda.com/vi-vn/yzistel-hoi-an/hotel/hoi-an-vn.html'),
('trip','126921251','YZISTEL HOI AN','yzistel-hoi-an-39-le-quy-don','https://www.trip.com/hotels/hoi-an-hotel-detail-126921251/yzistel-hoi-an/'),
('traveloka','9000005722460','YZISTEL HOI AN','yzistel-hoi-an-39-le-quy-don','https://www.traveloka.com/en-en/hotel/vietnam/yzistel-9000005722460')
on conflict(source,property_id) do update set property_name=excluded.property_name,hotel_key=excluded.hotel_key,source_url=excluded.source_url;
