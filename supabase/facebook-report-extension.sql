-- Apply AFTER facebook-module.sql. Existing daily rows are preserved.
begin;
alter table public.review_tracker_facebook_daily
 add column if not exists page_visits bigint check(page_visits>=0),
 add column if not exists new_follows bigint check(new_follows>=0),
 add column if not exists new_conversations bigint check(new_conversations>=0);
create table if not exists public.review_tracker_facebook_posts_daily (
 page_id text not null,post_date date not null,published_posts bigint not null check(published_posts>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(page_id,post_date)
);
create table if not exists public.review_tracker_facebook_period_reports (
 page_id text not null,period_from date not null,period_to date not null,check(period_from<=period_to),
 metric_values jsonb not null,source_note text not null,actor text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(page_id,period_from,period_to)
);
alter table public.review_tracker_facebook_posts_daily enable row level security;
alter table public.review_tracker_facebook_period_reports enable row level security;
revoke all on public.review_tracker_facebook_posts_daily,public.review_tracker_facebook_period_reports from public,anon,authenticated;
grant select,insert,update on public.review_tracker_facebook_posts_daily,public.review_tracker_facebook_period_reports to service_role;
create or replace function public.review_tracker_facebook_upsert(p jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare h jsonb:=p->'hotel'; s jsonb:=p->'snapshot'; d jsonb;
begin
 if ((h->>'page_id'='115021051629190' and h->>'hotel_key'='sontra-sea-hotel')
  or (h->>'page_id'='1303785806154089' and h->>'hotel_key'='vistara-gia-lai-sea-hotel')
  or (h->>'page_id'='862606296943494' and h->>'hotel_key'='quy-nhon-sea-hotel')
  or (h->>'page_id'='224431597428014' and h->>'hotel_key'='vintage-taste-deli-cafe')
  or (h->>'page_id'='341046985766818' and h->>'hotel_key'='yzistel-hoi-an-39-le-quy-don')) is not true then
  raise exception 'Unknown Facebook hotel';
 end if;
 for d in select value from jsonb_array_elements(p->'days') loop
  insert into public.review_tracker_facebook_daily(page_id,metric_date,hotel_key,hotel_name,post_engagements,media_views,unique_viewers,page_visits,new_follows,new_conversations,bucket_end_time)
  values(h->>'page_id',(d->>'metric_date')::date,h->>'hotel_key',h->>'hotel_name',(d->>'post_engagements')::bigint,(d->>'media_views')::bigint,(d->>'unique_viewers')::bigint,(d->>'page_visits')::bigint,(d->>'new_follows')::bigint,(d->>'new_conversations')::bigint,(d->>'bucket_end_time')::timestamptz)
  on conflict(page_id,metric_date) do update set
   hotel_name=excluded.hotel_name,
   post_engagements=coalesce(excluded.post_engagements,review_tracker_facebook_daily.post_engagements),
   media_views=coalesce(excluded.media_views,review_tracker_facebook_daily.media_views),
   unique_viewers=coalesce(excluded.unique_viewers,review_tracker_facebook_daily.unique_viewers),
   page_visits=coalesce(excluded.page_visits,review_tracker_facebook_daily.page_visits),
   new_follows=coalesce(excluded.new_follows,review_tracker_facebook_daily.new_follows),
   new_conversations=coalesce(excluded.new_conversations,review_tracker_facebook_daily.new_conversations),
   bucket_end_time=excluded.bucket_end_time,updated_at=now();
 end loop;
 insert into public.review_tracker_facebook_followers(page_id,snapshot_date,hotel_key,hotel_name,followers_count,fan_count)
 values(h->>'page_id',(s->>'snapshot_date')::date,h->>'hotel_key',h->>'hotel_name',(s->>'followers_count')::bigint,(s->>'fan_count')::bigint)
 on conflict(page_id,snapshot_date) do update set hotel_name=excluded.hotel_name,
  followers_count=coalesce(excluded.followers_count,review_tracker_facebook_followers.followers_count),
  fan_count=coalesce(excluded.fan_count,review_tracker_facebook_followers.fan_count),updated_at=now();
 for d in select value from jsonb_array_elements(coalesce(nullif(p->'posts','null'::jsonb),'[]'::jsonb)) loop
  insert into public.review_tracker_facebook_posts_daily(page_id,post_date,published_posts)
  values(h->>'page_id',(d->>'post_date')::date,(d->>'published_posts')::bigint)
  on conflict(page_id,post_date) do update set published_posts=excluded.published_posts,updated_at=now();
 end loop;
end; $$;


create or replace function public.review_tracker_facebook_report(p jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v jsonb; k text; n numeric;
begin
 if p->>'page_id' not in ('115021051629190','1303785806154089','862606296943494','341046985766818','224431597428014') or p->>'page_id' is null then raise exception 'Unknown Page'; end if;
 if (p->>'from')::date>(p->>'to')::date then raise exception 'Invalid period'; end if;
 if p->>'action'='save' then
  if jsonb_typeof(p->'values') is distinct from 'object' or p->'values'='{}'::jsonb then raise exception 'Invalid values'; end if;
  if coalesce(length(trim(p->>'source_note')),0) not between 1 and 500 or coalesce(length(p->>'actor'),0)=0 then raise exception 'Invalid source'; end if;
  for k,v in select * from jsonb_each(p->'values') loop
   if k not in ('media_views','period_unique_viewers','post_engagements','link_clicks','page_visits','new_follows','message_contacts','response_rate','published_posts') or jsonb_typeof(v)<>'number' then raise exception 'Invalid metric'; end if;
   n:=v::text::numeric;
   if n<0 or (k='response_rate' and n>100) or (k<>'response_rate' and (n<>trunc(n) or n>9007199254740991)) then raise exception 'Invalid value'; end if;
  end loop;
  insert into public.review_tracker_facebook_period_reports(page_id,period_from,period_to,metric_values,source_note,actor)
  values(p->>'page_id',(p->>'from')::date,(p->>'to')::date,p->'values',trim(p->>'source_note'),p->>'actor')
  on conflict(page_id,period_from,period_to) do update set metric_values=excluded.metric_values,source_note=excluded.source_note,actor=excluded.actor,updated_at=now();
 elsif coalesce(p->>'action','')<>'read' then raise exception 'Invalid action'; end if;
 return jsonb_build_object(
  'report',(select to_jsonb(r)-'actor' from public.review_tracker_facebook_period_reports r where r.page_id=p->>'page_id' and period_from=(p->>'from')::date and period_to=(p->>'to')::date),
  'history',coalesce((select jsonb_agg(to_jsonb(r)-'actor' order by period_to desc,period_from desc) from (select * from public.review_tracker_facebook_period_reports where page_id=p->>'page_id' order by period_to desc,period_from desc limit 100)r),'[]'::jsonb),
  'posts',coalesce((select jsonb_agg(to_jsonb(d) order by post_date) from public.review_tracker_facebook_posts_daily d where d.page_id=p->>'page_id' and post_date between (p->>'from')::date and (p->>'to')::date),'[]'::jsonb)
 );
end; $$;
revoke all on function public.review_tracker_facebook_report(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_facebook_report(jsonb) to service_role;
commit;
