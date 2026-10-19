-- Apply to the EXISTING Supabase project. No access tokens are stored here.
begin;
create table if not exists public.review_tracker_facebook_daily (
 page_id text not null, metric_date date not null,
 hotel_key text not null, hotel_name text not null,
 post_engagements bigint check(post_engagements>=0),
 media_views bigint check(media_views>=0), unique_viewers bigint check(unique_viewers>=0),
 bucket_end_time timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(page_id,metric_date)
);
create table if not exists public.review_tracker_facebook_followers (
 page_id text not null, snapshot_date date not null,
 hotel_key text not null, hotel_name text not null,
 followers_count bigint check(followers_count>=0), fan_count bigint check(fan_count>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(page_id,snapshot_date)
);
alter table public.review_tracker_facebook_daily enable row level security;
alter table public.review_tracker_facebook_followers enable row level security;
revoke all on public.review_tracker_facebook_daily,public.review_tracker_facebook_followers from public,anon,authenticated;
grant select,insert,update on public.review_tracker_facebook_daily,public.review_tracker_facebook_followers to service_role;

create or replace function public.review_tracker_facebook_upsert(p jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare h jsonb:=p->'hotel'; s jsonb:=p->'snapshot'; d jsonb;
begin
 if ((h->>'page_id'='115021051629190' and h->>'hotel_key'='sontra-sea-hotel')
  or (h->>'page_id'='1303785806154089' and h->>'hotel_key'='vistara-gia-lai-sea-hotel')
  or (h->>'page_id'='862606296943494' and h->>'hotel_key'='quy-nhon-sea-hotel')
  or (h->>'page_id'='341046985766818' and h->>'hotel_key'='yzistel-hoi-an-39-le-quy-don')) is not true then
  raise exception 'Unknown Facebook hotel';
 end if;
 for d in select value from jsonb_array_elements(p->'days') loop
  insert into public.review_tracker_facebook_daily(page_id,metric_date,hotel_key,hotel_name,post_engagements,media_views,unique_viewers,bucket_end_time)
  values(h->>'page_id',(d->>'metric_date')::date,h->>'hotel_key',h->>'hotel_name',(d->>'post_engagements')::bigint,(d->>'media_views')::bigint,(d->>'unique_viewers')::bigint,(d->>'bucket_end_time')::timestamptz)
  on conflict(page_id,metric_date) do update set
   hotel_name=excluded.hotel_name,
   post_engagements=coalesce(excluded.post_engagements,review_tracker_facebook_daily.post_engagements),
   media_views=coalesce(excluded.media_views,review_tracker_facebook_daily.media_views),
   unique_viewers=coalesce(excluded.unique_viewers,review_tracker_facebook_daily.unique_viewers),
   bucket_end_time=excluded.bucket_end_time,updated_at=now();
 end loop;
 insert into public.review_tracker_facebook_followers(page_id,snapshot_date,hotel_key,hotel_name,followers_count,fan_count)
 values(h->>'page_id',(s->>'snapshot_date')::date,h->>'hotel_key',h->>'hotel_name',(s->>'followers_count')::bigint,(s->>'fan_count')::bigint)
 on conflict(page_id,snapshot_date) do update set hotel_name=excluded.hotel_name,
  followers_count=coalesce(excluded.followers_count,review_tracker_facebook_followers.followers_count),
  fan_count=coalesce(excluded.fan_count,review_tracker_facebook_followers.fan_count),updated_at=now();
end; $$;

create or replace function public.review_tracker_facebook_read(p jsonb)
returns jsonb language sql stable security invoker set search_path=public as $$
 select case when p->>'type'='insights' then jsonb_build_object('days',coalesce((
  select jsonb_agg(to_jsonb(d) order by metric_date,page_id) from public.review_tracker_facebook_daily d
  where d.page_id in(select jsonb_array_elements_text(p->'page_ids')) and metric_date between (p->>'from')::date and (p->>'to')::date
 ),'[]'::jsonb)) else jsonb_build_object(
 'snapshots',coalesce((select jsonb_agg(to_jsonb(f) order by snapshot_date,page_id) from public.review_tracker_facebook_followers f where f.page_id in(select jsonb_array_elements_text(p->'page_ids')) and snapshot_date between (p->>'from')::date and (p->>'to')::date),'[]'::jsonb),
 'baseline',coalesce((select jsonb_agg(to_jsonb(f)) from (select distinct on(page_id) * from public.review_tracker_facebook_followers where page_id in(select jsonb_array_elements_text(p->'page_ids')) and snapshot_date<(p->>'from')::date order by page_id,snapshot_date desc) f),'[]'::jsonb),
 'latest',coalesce((select jsonb_agg(to_jsonb(f)) from (select distinct on(page_id) * from public.review_tracker_facebook_followers where page_id in(select jsonb_array_elements_text(p->'page_ids')) order by page_id,snapshot_date desc) f),'[]'::jsonb),
 'previous',coalesce((select jsonb_agg(to_jsonb(f)) from public.review_tracker_facebook_followers f where f.page_id in(select jsonb_array_elements_text(p->'page_ids')) and snapshot_date=(select max(x.snapshot_date)-1 from public.review_tracker_facebook_followers x where x.page_id=f.page_id)),'[]'::jsonb)
 ) end;
$$;
revoke all on function public.review_tracker_facebook_upsert(jsonb),public.review_tracker_facebook_read(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_facebook_upsert(jsonb),public.review_tracker_facebook_read(jsonb) to service_role;
commit;
