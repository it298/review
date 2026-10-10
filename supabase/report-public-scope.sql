-- Read-only reporting view. Run after insights.sql / report-range.sql.
-- Keep raw history and saved weekly snapshots unchanged. Existing Agoda 'api'
-- observations were recorded by the verified YCS reader; reports now use public
-- Agoda observations only. Never turn a switch from 143 YCS to 150 public into +7.
begin;
create or replace function public.review_tracker_report_inputs_read(p_days integer default 90) returns jsonb
language sql stable security invoker set search_path=public as $$
 with limits as(select ((now() at time zone 'Asia/Ho_Chi_Minh')::date-(least(greatest(p_days,1),365)-1))::timestamp at time zone 'Asia/Ho_Chi_Minh' cutoff),
 h as(select * from review_tracker_source_history where attempted_at>=now()-interval '400 days'
 and status<>'failed' and not(source='agoda' and coalesce(method,'')='api')),
 r as(select distinct on(entity_key,source,(rating_at at time zone 'Asia/Ho_Chi_Minh')::date)
 entity_key,source,(rating_at at time zone 'Asia/Ho_Chi_Minh')::date as "day",rating,rating_max,rating_at,method rating_method,id rating_history_id
 from h where rating is not null and rating_at>=(select cutoff from limits)
 order by entity_key,source,(rating_at at time zone 'Asia/Ho_Chi_Minh')::date,rating_at desc,id desc),
 c as(select distinct on(entity_key,source,(count_at at time zone 'Asia/Ho_Chi_Minh')::date)
 entity_key,source,(count_at at time zone 'Asia/Ho_Chi_Minh')::date as "day",review_count,count_kind,count_at,method count_method,id count_history_id
 from h where review_count is not null and count_display is null and count_at>=(select cutoff from limits)
 order by entity_key,source,(count_at at time zone 'Asia/Ho_Chi_Minh')::date,count_at desc,id desc),
 daily as(select coalesce(r.entity_key,c.entity_key) entity_key,coalesce(r.source,c.source) source,coalesce(r."day",c."day") as "day",
 r.rating,r.rating_max,r.rating_at,r.rating_method,r.rating_history_id,c.review_count,c.count_kind,c.count_at,c.count_method,c.count_history_id
 from r full join c using(entity_key,source,"day")),
 rv as(select distinct on(entity_key,source,rating_at) * from h where rating is not null order by entity_key,source,rating_at,id desc),
 cv as(select distinct on(entity_key,source,count_at) * from h where review_count is not null and count_display is null order by entity_key,source,count_at,id desc),
 deltas as(select id,entity_key,source,rating_at as "at",'rating' metric,rating value,
 case when rating_max=lag(rating_max) over(partition by entity_key,source order by rating_at,id) then lag(rating) over(partition by entity_key,source order by rating_at,id) end previous,lag(rating_at) over(partition by entity_key,source order by rating_at,id) previous_at,rating_max,'reviews' count_kind from rv
 union all select id,entity_key,source,count_at,'review_count',review_count,
 case when count_kind=lag(count_kind) over(partition by entity_key,source order by count_at,id) then lag(review_count) over(partition by entity_key,source order by count_at,id) end,lag(count_at) over(partition by entity_key,source order by count_at,id),rating_max,count_kind from cv)
 select jsonb_build_object('directory',review_tracker_directory_read(),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by "day",entity_key,source) from daily d),'[]'::jsonb),
 'changes',coalesce((select jsonb_agg(to_jsonb(d) order by "at" desc) from deltas d where previous is not null and value<previous and "at">=(select cutoff from limits)),'[]'::jsonb),
 'statuses','[]'::jsonb,'readKeys','[]'::jsonb);
$$;
revoke all on function public.review_tracker_report_inputs_read(integer) from public,anon,authenticated;
grant execute on function public.review_tracker_report_inputs_read(integer) to service_role;
commit;
