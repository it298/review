-- Explicit grouping after verifying the property address on each OTA.
alter table public.review_tracker_ota_summary add column if not exists hotel_key text;
