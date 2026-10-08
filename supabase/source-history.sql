-- Run after directory.sql, public-source-summary.sql and ota-automation.sql.
-- Additive: retain every accepted refresh, including failures and partial readings.
begin;
create table if not exists public.review_tracker_source_history (
 id bigint generated always as identity primary key,
 entity_key text not null, source text not null,
 attempted_at timestamptz not null, status text not null,
 rating numeric, rating_max numeric not null,
 review_count bigint, count_display text, count_kind text not null default 'reviews',
 rating_at timestamptz, count_at timestamptz, method text, error text,
 origin text not null, origin_key text not null,
 unique(origin,origin_key),
 check(status in ('success','partial','failed','baseline')),
 check(rating_max in (5,10)), check(rating is null or rating between 0 and rating_max),
 check(review_count is null or review_count>=0)
);
create index if not exists review_tracker_history_lookup on public.review_tracker_source_history(entity_key,source,attempted_at desc);
alter table public.review_tracker_source_history enable row level security;
revoke all on public.review_tracker_source_history from public,anon,authenticated;
grant select,insert on public.review_tracker_source_history to service_role;
grant usage,select on sequence public.review_tracker_source_history_id_seq to service_role;

create or replace function public.review_tracker_history_directory() returns trigger
language plpgsql security invoker set search_path=public as $$
declare fresh_rating boolean; fresh_count boolean; fresh_label boolean;
begin
 if new.last_attempt_at is null or new.last_attempt_at is not distinct from old.last_attempt_at then return new;end if;
 fresh_rating:=new.rating_captured_at is not null and new.rating_captured_at is distinct from old.rating_captured_at;
 fresh_count:=new.count_captured_at is not null and new.count_captured_at is distinct from old.count_captured_at;
 fresh_label:=new.count_display is not null and new.count_display_captured_at is distinct from old.count_display_captured_at;
 insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,count_display,count_kind,rating_at,count_at,method,error,origin,origin_key)
 values(new.entity_key,new.source,new.last_attempt_at,
 case when not(fresh_rating or fresh_count or fresh_label) then 'failed' when fresh_rating and fresh_count then 'success' else 'partial' end,
 case when fresh_rating then new.rating end,new.rating_max,case when fresh_count then new.review_count end,case when fresh_label then new.count_display end,new.count_kind,
 case when fresh_rating then new.rating_captured_at end,case when fresh_label then new.count_display_captured_at when fresh_count then new.count_captured_at end,
 new.collection_method,new.last_error,'directory',new.entity_key||':'||new.source||':'||new.last_attempt_at::text)
 on conflict(origin,origin_key) do nothing;
 return new;
end;$$;
drop trigger if exists review_tracker_history_directory on public.review_tracker_directory_sources;
create trigger review_tracker_history_directory after update on public.review_tracker_directory_sources for each row execute function public.review_tracker_history_directory();

-- Deferred until the entire ingest transaction has finished; never read the previous
-- summary before a successful run writes its new values.
create or replace function public.review_tracker_history_ota() returns trigger
language plpgsql security invoker set search_path=public as $$
declare t public.review_tracker_ota_targets; s public.review_tracker_ota_summary; fresh boolean;
begin
 select * into t from review_tracker_ota_targets where source=new.source and property_id=new.property_id;
 select * into s from review_tracker_ota_summary where source=new.source and property_id=new.property_id;
 fresh:=new.status='success' and s.last_attempt_at=new.attempted_at and s.captured_at=t.last_success_at;
 insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,error,origin,origin_key)
 values(t.hotel_key,new.source,new.attempted_at,case when new.status='failed' then 'failed' when fresh then 'success' else 'partial' end,
 case when fresh then s.rating end,coalesce(s.rating_max,10),case when fresh then s.review_count end,
 case when fresh then s.captured_at end,case when fresh then s.captured_at end,new.method,new.error,'ota-run',new.id::text)
 on conflict(origin,origin_key) do nothing;
 return new;
end;$$;
drop trigger if exists review_tracker_history_ota on public.review_tracker_ota_runs;
create constraint trigger review_tracker_history_ota after insert on public.review_tracker_ota_runs deferrable initially deferred for each row execute function public.review_tracker_history_ota();

-- Known observations only: no reconstruction of days that were never collected.
insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,count_display,count_kind,rating_at,count_at,method,origin,origin_key)
select entity_key,source,greatest(rating_captured_at,count_captured_at,count_display_captured_at),'baseline',rating,rating_max,case when count_display is null then review_count end,count_display,count_kind,rating_captured_at,coalesce(count_display_captured_at,count_captured_at),collection_method,'baseline',entity_key||':'||source
from review_tracker_directory_sources where rating_captured_at is not null or count_captured_at is not null or count_display_captured_at is not null
on conflict(origin,origin_key) do nothing;

create or replace function public.review_tracker_history_google_snapshot() returns trigger
language plpgsql security invoker set search_path=public as $$
begin
 insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key)
 select d.entity_key,'google',new.captured_at,'success',new.rating,5,new.user_rating_count,new.captured_at,new.captured_at,'google-api','google-snapshot',new.id::text||':'||new.captured_at::text
 from review_tracker_directory d where d.google_place_id=new.place_id
 on conflict(origin,origin_key) do nothing;
 return new;
end;$$;
drop trigger if exists review_tracker_history_google_snapshot on public.review_tracker_snapshots;
create trigger review_tracker_history_google_snapshot after insert or update on public.review_tracker_snapshots for each row execute function public.review_tracker_history_google_snapshot();
insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key)
select d.entity_key,'google',s.captured_at,'baseline',s.rating,5,s.user_rating_count,s.captured_at,s.captured_at,'google-api','google-snapshot',s.id::text||':'||s.captured_at::text
from review_tracker_snapshots s join review_tracker_directory d on d.google_place_id=s.place_id
on conflict(origin,origin_key) do nothing;
insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,rating_at,count_at,method,origin,origin_key)
select t.hotel_key,d.source,d.captured_at,'baseline',d.rating,10,d.review_count,d.captured_at,d.captured_at,d.method,'ota-day',d.source||':'||d.property_id||':'||d.date::text
from review_tracker_ota_daily d join review_tracker_ota_targets t using(source,property_id)
on conflict(origin,origin_key) do nothing;
insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating_max,method,error,origin,origin_key)
select t.hotel_key,r.source,r.attempted_at,'failed',10,r.method,r.error,'ota-run',r.id::text
from review_tracker_ota_runs r join review_tracker_ota_targets t using(source,property_id) where r.status='failed'
on conflict(origin,origin_key) do nothing;

create or replace function public.review_tracker_source_history_read(p_entity text,p_source text,p_days integer default 30) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('observations',coalesce((select jsonb_agg(to_jsonb(h) order by attempted_at,id) from review_tracker_source_history h
 where entity_key=p_entity and source=p_source and status<>'failed' and greatest(rating_at,count_at)>=((now() at time zone 'Asia/Ho_Chi_Minh')::date-(least(greatest(p_days,1),365)-1))::timestamp at time zone 'Asia/Ho_Chi_Minh'),'[]'::jsonb),
 'runs',coalesce((select jsonb_agg(to_jsonb(r) order by attempted_at desc,id desc) from (select * from review_tracker_source_history
 where entity_key=p_entity and source=p_source and attempted_at>=((now() at time zone 'Asia/Ho_Chi_Minh')::date-(least(greatest(p_days,1),365)-1))::timestamp at time zone 'Asia/Ho_Chi_Minh' order by attempted_at desc,id desc limit 200) r),'[]'::jsonb));
$$;
revoke all on function public.review_tracker_history_directory(),public.review_tracker_history_ota(),public.review_tracker_history_google_snapshot(),public.review_tracker_source_history_read(text,text,integer) from public,anon,authenticated;
grant execute on function public.review_tracker_history_directory(),public.review_tracker_history_ota(),public.review_tracker_history_google_snapshot(),public.review_tracker_source_history_read(text,text,integer) to service_role;
commit;
