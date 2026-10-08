begin;
create table if not exists public.review_tracker_directory (
 entity_key text primary key,name text not null,
 category text not null check(category in ('hotel','cafe','store','activity')),
 relationship text not null check(relationship in ('managed','comparison')),
 google_place_id bigint references public.review_tracker_places(id) on delete set null
);
create table if not exists public.review_tracker_directory_sources (
 entity_key text not null references public.review_tracker_directory(entity_key),
 source text not null check(source in ('google','tripadvisor','agoda','booking','expedia','trip','traveloka','grab','shopee')),
 source_url text not null check(source_url like 'https://%'),property_id text,warning text,provenance text,
 primary key(entity_key,source)
);
alter table public.review_tracker_directory enable row level security;
alter table public.review_tracker_directory_sources enable row level security;
revoke all on public.review_tracker_directory,public.review_tracker_directory_sources from public,anon,authenticated;
grant select,insert,update,delete on public.review_tracker_directory,public.review_tracker_directory_sources to service_role;
create or replace function public.review_tracker_directory_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('sources',
  (select coalesce(jsonb_agg(to_jsonb(s) order by source),'[]'::jsonb) from public.review_tracker_directory_sources s where s.entity_key=d.entity_key)
 ) order by relationship,category,name),'[]'::jsonb) from public.review_tracker_directory d;
$$;
revoke all on function public.review_tracker_directory_read() from public,anon,authenticated;
grant execute on function public.review_tracker_directory_read() to service_role;
commit;
