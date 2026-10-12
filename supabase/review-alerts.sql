-- Run after directory.sql and insights.sql. Summary snapshots cannot create review alerts.
begin;
create table if not exists public.review_tracker_review_monitors(
 entity_key text not null,source text not null,started_at timestamptz not null,last_scan_at timestamptz not null,
 primary key(entity_key,source),foreign key(entity_key,source) references public.review_tracker_directory_sources(entity_key,source)
);
create table if not exists public.review_tracker_reviews(
 entity_key text not null,source text not null,review_id text not null,rating numeric not null,rating_max integer not null,
 reviewed_at timestamptz not null,updated_at timestamptz not null,captured_at timestamptz not null,
 author text not null default '',title text not null default '',content text not null default '',method text not null,
 primary key(entity_key,source,review_id),foreign key(entity_key,source) references public.review_tracker_directory_sources(entity_key,source),
 check(rating_max in (5,10) and rating between 0 and rating_max),check(updated_at>=reviewed_at),check(length(content)<=20000)
);
create table if not exists public.review_tracker_review_alerts(
 id bigint generated always as identity primary key,entity_key text not null,source text not null,review_id text not null,
 rating numeric not null,rating_max integer not null,reviewed_at timestamptz not null,updated_at timestamptz not null,
 detected_at timestamptz not null,reason text not null check(reason in ('new','changed','detected')),reviewed_date_only boolean not null default false,
 unique(entity_key,source,review_id,updated_at,rating),
 foreign key(entity_key,source,review_id) references public.review_tracker_reviews(entity_key,source,review_id)
);
alter table public.review_tracker_review_monitors enable row level security;
alter table public.review_tracker_reviews enable row level security;
alter table public.review_tracker_review_alerts enable row level security;
revoke all on public.review_tracker_review_monitors,public.review_tracker_reviews,public.review_tracker_review_alerts from public,anon,authenticated;
grant select,insert,update on public.review_tracker_review_monitors,public.review_tracker_reviews,public.review_tracker_review_alerts to service_role;
grant usage,select on sequence public.review_tracker_review_alerts_id_seq to service_role;
create or replace function public.review_tracker_review_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('google_place_id',d.google_place_id,'last_review_scan_at',m.last_scan_at)),'[]'::jsonb)
 from review_tracker_directory_sources s join review_tracker_directory d using(entity_key)
 left join review_tracker_review_monitors m using(entity_key,source)
 where d.relationship='managed' and s.warning is null;
$$;
create or replace function public.review_tracker_reviews_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources; monitor public.review_tracker_review_monitors;
 previous public.review_tracker_reviews;r jsonb;scale integer;score numeric;posted timestamptz;updated timestamptz;captured timestamptz;low boolean;previous_low boolean;baseline boolean:=false;added integer:=0;
begin
 select s.* into target from review_tracker_directory_sources s join review_tracker_directory d using(entity_key)
 where s.entity_key=p->>'entityKey' and s.source=p->>'source' and s.warning is null and d.relationship='managed' for update of s;
 if not found or target.source_url is distinct from p->>'sourceUrl' then raise exception 'Review source identity mismatch';end if;
 scale:=case when target.source in ('google','tripadvisor','grab','shopee') then 5 else 10 end;
 captured:=(p->>'capturedAt')::timestamptz;
 if captured is null or captured<now()-interval '1 day' or captured>now()+interval '5 minutes' or coalesce(p->>'method','') not in ('api','dom','extranet-auto','email','ocr') or jsonb_typeof(p->'reviews') is distinct from 'array' or jsonb_array_length(p->'reviews')>200 then raise exception 'Invalid review batch';end if;
 select * into monitor from review_tracker_review_monitors where entity_key=target.entity_key and source=target.source for update;
 if not found then
  baseline:=true;
  insert into review_tracker_review_monitors values(target.entity_key,target.source,captured,captured) returning * into monitor;
 elsif captured<monitor.last_scan_at then return jsonb_build_object('status','stale');
 end if;
 for r in select value from jsonb_array_elements(p->'reviews') loop
  score:=(r->>'rating')::numeric;posted:=(r->>'reviewedAt')::timestamptz;updated:=(r->>'updatedAt')::timestamptz;
  if coalesce(r->>'reviewId','')!~'^[-a-zA-Z0-9_]{1,200}$' or score is null or score::text in ('NaN','Infinity','-Infinity') or score not between 0 and scale or (r->>'ratingMax')::integer is distinct from scale
   or scale=5 and (score<1 or score<>trunc(score)) or posted is null or updated is null or updated<posted or posted>captured+interval '5 minutes' or updated>captured+interval '5 minutes'
   or length(coalesce(r->>'content',''))>20000 or length(coalesce(r->>'title',''))>500 or length(coalesce(r->>'author',''))>200 then raise exception 'Invalid individual review';end if;
  select * into previous from review_tracker_reviews where entity_key=target.entity_key and source=target.source and review_id=r->>'reviewId';
  if found and (updated<previous.updated_at or captured<previous.captured_at) then continue;end if;
  -- A rating cannot change at the same source update timestamp.
  if previous.review_id is not null and updated=previous.updated_at and score<>previous.rating then raise exception 'Conflicting review timestamp';end if;
  low:=case when scale=5 then score=1 else score<=2 end;
  previous_low:=case when scale=5 then previous.rating=1 else previous.rating<=2 end;
  insert into review_tracker_reviews(entity_key,source,review_id,rating,rating_max,reviewed_at,updated_at,captured_at,author,title,content,method)
  values(target.entity_key,target.source,r->>'reviewId',score,scale,posted,updated,captured,coalesce(r->>'author',''),coalesce(r->>'title',''),coalesce(r->>'content',''),p->>'method')
  on conflict(entity_key,source,review_id) do update set rating=excluded.rating,updated_at=excluded.updated_at,captured_at=excluded.captured_at,author=excluded.author,title=excluded.title,content=excluded.content,method=excluded.method;
  if low and not baseline and ((previous.review_id is null and (posted>monitor.started_at or r->>'dateOnly'='true' and (posted at time zone 'Asia/Ho_Chi_Minh')::date>=(monitor.started_at at time zone 'Asia/Ho_Chi_Minh')::date)) or (previous.review_id is not null and not previous_low and updated>monitor.started_at)) then
   insert into review_tracker_review_alerts(entity_key,source,review_id,rating,rating_max,reviewed_at,updated_at,detected_at,reason,reviewed_date_only)
   values(target.entity_key,target.source,r->>'reviewId',score,scale,posted,updated,captured,case when previous.review_id is not null then 'changed' when r->>'dateOnly'='true' then 'detected' else 'new' end,coalesce(r->>'dateOnly','false')='true')
   on conflict(entity_key,source,review_id,updated_at,rating) do nothing;
   if found then added:=added+1;end if;
  end if;
 end loop;
 update review_tracker_review_monitors set last_scan_at=captured where entity_key=target.entity_key and source=target.source;
 return jsonb_build_object('status','success','alertsAdded',added,'reviewsRead',jsonb_array_length(p->'reviews'));
end;$$;
create or replace function public.review_tracker_review_alerts_read(p_days integer default 7) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('reviewMonitoring',coalesce((select jsonb_agg(to_jsonb(m)) from review_tracker_review_monitors m),'[]'::jsonb),
 'lowReviews',coalesce((select jsonb_agg(to_jsonb(a)) from (
 select e.id,e.entity_key,e.source,e.rating,e.rating_max,e.detected_at as "at",e.reviewed_at,e.reviewed_date_only,e.reason,r.title,left(r.content,1000) content,s.source_url
 from review_tracker_review_alerts e join review_tracker_reviews r using(entity_key,source,review_id)
 join review_tracker_directory_sources s using(entity_key,source)
 where e.detected_at>=now()-make_interval(days=>least(greatest(p_days,1),365)) order by e.detected_at desc,e.id desc limit 500) a),'[]'::jsonb));
$$;
revoke all on function public.review_tracker_review_targets_read(),public.review_tracker_reviews_ingest(jsonb),public.review_tracker_review_alerts_read(integer) from public,anon,authenticated;
grant execute on function public.review_tracker_review_targets_read(),public.review_tracker_reviews_ingest(jsonb),public.review_tracker_review_alerts_read(integer) to service_role;
notify pgrst,'reload schema';
commit;
