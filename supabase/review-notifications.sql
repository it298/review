-- Run after review-alerts.sql. Extends existing private events; no history is deleted or backfilled.
begin;
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
  if not baseline and ((previous.review_id is null and (posted>monitor.started_at or r->>'dateOnly'='true' and (posted at time zone 'Asia/Ho_Chi_Minh')::date>=(monitor.started_at at time zone 'Asia/Ho_Chi_Minh')::date)) or (low and previous.review_id is not null and not previous_low and updated>monitor.started_at)) then
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
 with events as(
 select e.id,e.entity_key,e.source,e.review_id,e.rating,e.rating_max,e.detected_at as "at",e.reviewed_at,e.reviewed_date_only,e.reason,r.author,r.title,left(r.content,1000) content,s.source_url
 from review_tracker_review_alerts e join review_tracker_reviews r using(entity_key,source,review_id)
 join review_tracker_directory_sources s using(entity_key,source) join review_tracker_directory d using(entity_key)
 where d.relationship='managed' and s.warning is null and e.detected_at between now()-make_interval(days=>least(greatest(p_days,1),365)) and now()
 ), observations as(
 select distinct on(entity_key,source,count_at) id,entity_key,source,count_at,review_count,count_kind,rating_max
 from review_tracker_source_history where status<>'failed' and review_count is not null and count_display is null and count_at is not null and count_at<=now() and attempted_at>=now()-interval '400 days'
 and not(source='agoda' and coalesce(method,'')='api') order by entity_key,source,count_at,id desc
 ), deltas as(
 select *,lag(review_count) over w previous,lag(count_at) over w previous_at,lag(count_kind) over w previous_kind
 from observations window w as(partition by entity_key,source order by count_at,id)
 ), increases as(
 select h.id,h.entity_key,h.source,h.count_at as "at",h.review_count value,h.previous,h.previous_at,h.count_kind,'review_count'::text metric,s.source_url
 from deltas h join review_tracker_directory d using(entity_key) join review_tracker_directory_sources s using(entity_key,source)
 where d.relationship='managed' and s.warning is null and h.previous is not null and h.review_count>h.previous and h.count_kind is not distinct from h.previous_kind
 and h.count_at>=now()-make_interval(days=>least(greatest(p_days,1),365))
 )
 select jsonb_build_object(
 'reviewMonitoring',coalesce((select jsonb_agg(to_jsonb(m)) from review_tracker_review_monitors m),'[]'::jsonb),
 'lowReviews',coalesce((select jsonb_agg(to_jsonb(a) order by "at" desc,id desc) from (select * from events where (rating_max=5 and rating=1) or (rating_max=10 and rating<=2) order by "at" desc,id desc limit 500)a),'[]'::jsonb),
 'newReviews',coalesce((select jsonb_agg(to_jsonb(a) order by "at" desc,id desc) from (select * from events where reason in ('new','detected') and not((rating_max=5 and rating=1) or (rating_max=10 and rating<=2)) order by "at" desc,id desc limit 500)a),'[]'::jsonb),
 'countIncreases',coalesce((select jsonb_agg(to_jsonb(a) order by "at" desc,id desc) from (select * from increases order by "at" desc,id desc limit 500)a),'[]'::jsonb)
 );
$$;
revoke all on function public.review_tracker_reviews_ingest(jsonb),public.review_tracker_review_alerts_read(integer) from public,anon,authenticated;
grant execute on function public.review_tracker_reviews_ingest(jsonb),public.review_tracker_review_alerts_read(integer) to service_role;
notify pgrst,'reload schema';
commit;
