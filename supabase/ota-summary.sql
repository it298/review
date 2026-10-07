begin;
create table if not exists public.review_tracker_ota_summary (
 source text not null check(source in ('agoda','traveloka','trip')),
 property_id text not null, property_name text not null,
 google_place_id bigint references public.review_tracker_places(id) on delete set null,
 rating numeric, rating_max numeric not null check(rating_max>0),
 review_count bigint not null check(review_count>=0),
 captured_at timestamptz not null, source_url text not null, is_pilot boolean not null default true,
 primary key(source,property_id),check(rating is null or rating between 0 and rating_max)
);
alter table public.review_tracker_ota_summary enable row level security;
revoke all on public.review_tracker_ota_summary from public,anon,authenticated;
grant select,insert,update,delete on public.review_tracker_ota_summary to service_role;
create or replace function public.review_tracker_ota_summary_read() returns jsonb
language sql stable security invoker set search_path=public as $$
select coalesce(jsonb_agg(to_jsonb(s) order by property_name,source),'[]'::jsonb) from public.review_tracker_ota_summary s;
$$;
revoke all on function public.review_tracker_ota_summary_read() from public,anon,authenticated;
grant execute on function public.review_tracker_ota_summary_read() to service_role;
commit;
