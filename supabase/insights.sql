begin;
create table if not exists public.review_tracker_alert_reads(alert_key text primary key,read_at timestamptz not null default now());
create table if not exists public.review_tracker_weekly_reports(week_start date primary key,payload jsonb not null,generated_at timestamptz not null default now());
create table if not exists public.review_tracker_evidence(
 history_id bigint primary key references public.review_tracker_source_history(id),
 object_path text not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 byte_length integer not null check(byte_length between 24 and 2097152),uploaded_at timestamptz not null default now()
);
alter table public.review_tracker_alert_reads enable row level security;
alter table public.review_tracker_weekly_reports enable row level security;
alter table public.review_tracker_evidence enable row level security;
revoke all on public.review_tracker_alert_reads,public.review_tracker_weekly_reports,public.review_tracker_evidence from public,anon,authenticated;
grant select,insert on public.review_tracker_alert_reads,public.review_tracker_weekly_reports,public.review_tracker_evidence to service_role;
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
create or replace function public.review_tracker_alert_read(p_key text) returns jsonb language sql security invoker set search_path=public as $$
 insert into review_tracker_alert_reads(alert_key) values(p_key) on conflict do nothing returning jsonb_build_object('ok',true);
$$;
create or replace function public.review_tracker_reports_read() returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by week_start desc),'[]'::jsonb) from (select * from review_tracker_weekly_reports order by week_start desc limit 52) r;
$$;
create or replace function public.review_tracker_report_save(p_week date,p_payload jsonb) returns jsonb language sql security invoker set search_path=public as $$
 insert into review_tracker_weekly_reports(week_start,payload) values(p_week,p_payload) on conflict do nothing returning jsonb_build_object('ok',true);
$$;
create or replace function public.review_tracker_evidence_context(p_entity text,p_source text,p_property text,p_captured timestamptz) returns jsonb
language sql stable security invoker set search_path=public as $$
 select to_jsonb(h) from review_tracker_source_history h where source=p_source
 and entity_key=coalesce(nullif(p_entity,''),(select hotel_key from review_tracker_ota_targets where source=p_source and property_id=p_property and enabled))
 and (rating_at=p_captured or count_at=p_captured) and status<>'failed' order by id desc limit 1;
$$;
create or replace function public.review_tracker_evidence_save(p_id bigint,p_path text,p_hash text,p_bytes integer) returns jsonb language sql security invoker set search_path=public as $$
 insert into review_tracker_evidence(history_id,object_path,sha256,byte_length) values(p_id,p_path,p_hash,p_bytes) on conflict do nothing returning jsonb_build_object('ok',true);
$$;
create or replace function public.review_tracker_evidence_read(p_entity text,p_source text) returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by attempted_at desc,id desc),'[]'::jsonb) from(select h.*,e.history_id is not null has_image from review_tracker_source_history h left join review_tracker_evidence e on e.history_id=h.id where h.entity_key=p_entity and h.source=p_source and h.status<>'failed' order by h.attempted_at desc,h.id desc limit 200) r;
$$;
create or replace function public.review_tracker_evidence_object(p_id bigint) returns jsonb language sql stable security invoker set search_path=public as $$ select to_jsonb(e) from review_tracker_evidence e where history_id=p_id; $$;
create or replace function public.review_tracker_evidence_previous(p_id bigint) returns jsonb language sql stable security invoker set search_path=public as $$
 select to_jsonb(h) from review_tracker_source_history h join review_tracker_evidence e on e.history_id=h.id
 join review_tracker_source_history current on current.id=p_id and current.entity_key=h.entity_key and current.source=h.source
 where h.attempted_at<current.attempted_at order by h.attempted_at desc,h.id desc limit 1;
$$;
revoke all on function public.review_tracker_evidence_previous(bigint) from public,anon,authenticated;
grant execute on function public.review_tracker_evidence_previous(bigint) to service_role;
revoke all on function public.review_tracker_insights_read(integer),public.review_tracker_alert_read(text),public.review_tracker_reports_read(),public.review_tracker_report_save(date,jsonb),public.review_tracker_evidence_context(text,text,text,timestamptz),public.review_tracker_evidence_save(bigint,text,text,integer),public.review_tracker_evidence_read(text,text),public.review_tracker_evidence_object(bigint) from public,anon,authenticated;
grant execute on function public.review_tracker_insights_read(integer),public.review_tracker_alert_read(text),public.review_tracker_reports_read(),public.review_tracker_report_save(date,jsonb),public.review_tracker_evidence_context(text,text,text,timestamptz),public.review_tracker_evidence_save(bigint,text,text,integer),public.review_tracker_evidence_read(text,text),public.review_tracker_evidence_object(bigint) to service_role;
commit;
