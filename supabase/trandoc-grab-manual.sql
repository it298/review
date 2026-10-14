-- Add a manual-entry slot only. No fabricated merchant ID or review score.
insert into public.review_tracker_directory_sources
 (entity_key,source,source_url,property_id,warning,provenance,rating_max,count_kind)
select entity_key,'grab','https://merchant.grab.com/feedback',null,'manual_only',
 'User requested manual entry; merchant identity not connected',5,'ratings'
from public.review_tracker_directory where entity_key='trandoc-mini-mart-24h'
on conflict(entity_key,source) do nothing;
