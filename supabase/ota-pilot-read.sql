-- Read pilot reviews through the authenticated backend only.
begin;
create or replace function public.review_tracker_ota_reviews() returns jsonb
language sql stable security invoker set search_path = public
as $$
 select coalesce(jsonb_agg(payload order by payload->>'reviewedAt' desc,review_id),'[]'::jsonb)
 from (select payload,review_id from public.review_tracker_ota_pilot
 order by payload->>'reviewedAt' desc,review_id limit 500) r;
$$;
revoke all on function public.review_tracker_ota_reviews() from public,anon,authenticated;
grant execute on function public.review_tracker_ota_reviews() to service_role;
commit;
