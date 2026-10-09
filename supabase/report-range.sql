-- Expand the existing history reader to support custom reports up to 365 days.
begin;
create or replace function public.review_tracker_insights_read(p_days integer default 90) returns jsonb
language sql stable security invoker set search_path=public as $$
 with limits as(select ((now() at time zone 'Asia/Ho_Chi_Minh')::date-(least(greatest(p_days,7),365)-1))::timestamp at time zone 'Asia/Ho_Chi_Minh' cutoff),
 h as (select * from review_tracker_source_history where attempted_at>=now()-interval '400 days'),
 r as (select distinct on(entity_key,source,(rating_at at time zone 'Asia/Ho_Chi_Minh')::date)
 entity_key,source,(rating_at at time zone 'Asia/Ho_Chi_Minh')::date as "day",rating,rating_max,rating_at,id rating_history_id
 from h where rating is not null and rating_at>=(select cutoff from limits) order by entity_key,source,(rating_at at time zone 'Asia/Ho_Chi_Minh')::date,rating_at desc,id desc),
 c as (select distinct on(entity_key,source,(count_at at time zone 'Asia/Ho_Chi_Minh')::date)
 entity_key,source,(count_at at time zone 'Asia/Ho_Chi_Minh')::date as "day",review_count,count_kind,count_at,id count_history_id
 from h where review_count is not null and count_display is null and count_at>=(select cutoff from limits) order by entity_key,source,(count_at at time zone 'Asia/Ho_Chi_Minh')::date,count_at desc,id desc),
 daily as(select coalesce(r.entity_key,c.entity_key) entity_key,coalesce(r.source,c.source) source,coalesce(r.day,c.day) as "day",
 r.rating,r.rating_max,r.rating_at,r.rating_history_id,c.review_count,c.count_kind,c.count_at,c.count_history_id from r full join c using(entity_key,source,"day")),
 rating_values as(select distinct on(entity_key,source,rating_at) * from h where rating is not null order by entity_key,source,rating_at,id desc),
 count_values as(select distinct on(entity_key,source,count_at) * from h where review_count is not null and count_display is null order by entity_key,source,count_at,id desc),
 deltas as(select id,entity_key,source,rating_at as "at",'rating' metric,rating value,lag(rating) over(partition by entity_key,source order by rating_at,id) previous,rating_max,'reviews' count_kind from rating_values
 union all select id,entity_key,source,count_at,'review_count',review_count,case when count_kind=lag(count_kind) over(partition by entity_key,source order by count_at,id) then lag(review_count) over(partition by entity_key,source order by count_at,id) end,rating_max,count_kind from count_values),
 latest as(select distinct on(entity_key,source) entity_key,source,attempted_at,status,error,id from h order by entity_key,source,attempted_at desc,id desc),
 maxima as(select entity_key,source,max(rating_at) rating_at,max(count_at) filter(where count_display is null and review_count is not null) count_at,max(greatest(rating_at,count_at)) filter(where status<>'failed') last_good from h group by entity_key,source),
 failures as(select m.entity_key,m.source,count(*) consecutive_failures from maxima m join h x using(entity_key,source) where x.status='failed' and x.attempted_at>coalesce(m.last_good,'-infinity'::timestamptz) group by m.entity_key,m.source),
 status as(select l.*,m.rating_at,m.count_at,coalesce(f.consecutive_failures,0) consecutive_failures from latest l join maxima m using(entity_key,source) left join failures f using(entity_key,source))
 select jsonb_build_object('directory',review_tracker_directory_read(),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by day,entity_key,source) from daily d),'[]'::jsonb),
 'changes',coalesce((select jsonb_agg(to_jsonb(d) order by "at" desc) from deltas d where previous is not null and value<previous and "at">=(select cutoff from limits)),'[]'::jsonb),
 'statuses',coalesce((select jsonb_agg(to_jsonb(s)) from status s),'[]'::jsonb),
 'readKeys',coalesce((select jsonb_agg(alert_key) from review_tracker_alert_reads),'[]'::jsonb));
$$;
revoke all on function public.review_tracker_insights_read(integer) from public,anon,authenticated;
grant execute on function public.review_tracker_insights_read(integer) to service_role;
commit;
