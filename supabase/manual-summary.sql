-- Run after source-history.sql and tripadvisor-ranking.sql. Manual observations are immutable and do not
-- alter worker attempts, resolved source identities or automation settings.
begin;
alter table public.review_tracker_source_history add column if not exists note text;
alter table public.review_tracker_source_history add column if not exists entered_at timestamptz;
create or replace function public.review_tracker_manual_summary_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources; existing public.review_tracker_source_history;
 captured timestamptz; scale numeric; point numeric; total bigint; rp integer; rt integer; has_rank boolean; new_id bigint;
begin
 if jsonb_typeof(p)<>'object' or not coalesce(p->>'requestId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception using errcode='22023',message='Số liệu nhập không hợp lệ.';
 end if;
 select * into target from review_tracker_directory_sources where entity_key=p->>'entityKey' and source=p->>'source' for update;
 if not found then raise exception using errcode='P0002',message='Không tìm thấy nguồn của địa điểm.';end if;
 scale:=case when target.source in ('google','tripadvisor','grab','shopee') then 5 else 10 end;
 captured:=(p->>'capturedAt')::timestamptz;point:=(p->>'rating')::numeric;total:=(p->>'reviewCount')::bigint;
 has_rank:=p->>'rankPosition' is not null or p->>'rankTotal' is not null or p->>'rankCategory' is not null or p->>'rankArea' is not null;
 if has_rank then rp:=(p->>'rankPosition')::integer;rt:=(p->>'rankTotal')::integer;end if;
 if captured is null or captured>clock_timestamp() or captured<now()-interval '365 days' or (point is null and total is null and not has_rank)
  or (point is not null and (point<0 or point>scale or point::text in ('NaN','Infinity','-Infinity')))
  or (total is not null and (total<0 or total>9007199254740991 or (p->>'reviewCount')::numeric<>total))
  or (has_rank and (target.source<>'tripadvisor' or rp is null or rp<1 or rt is null or rt<rp or coalesce(p->>'rankCategory','') not in ('hotel','restaurant','attraction') or coalesce(length(trim(p->>'rankArea')),0) not between 1 and 160 or position(chr(10) in coalesce(p->>'rankArea',''))>0 or position(chr(13) in coalesce(p->>'rankArea',''))>0))
  or length(coalesce(p->>'note',''))>500 then raise exception using errcode='22023',message='Điểm, tổng hoặc thời điểm ghi nhận không hợp lệ.';end if;
 select * into existing from review_tracker_source_history where origin='manual' and origin_key=p->>'requestId';
 if found then
  if existing.entity_key<>target.entity_key or existing.source<>target.source or existing.rating is distinct from point or existing.review_count is distinct from total
   or existing.rank_position is distinct from rp or existing.rank_total is distinct from rt or existing.rank_category is distinct from p->>'rankCategory' or existing.rank_area is distinct from nullif(trim(p->>'rankArea'),'')
   or existing.attempted_at<>captured or coalesce(existing.note,'')<>coalesce(p->>'note','') then
   raise exception using errcode='22023',message='Lần nhập này đã được lưu với số liệu khác.';
  end if;
  return jsonb_build_object('ok',true,'id',existing.id,'duplicate',true);
 end if;
 insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,count_kind,rating_at,count_at,method,origin,origin_key,note,entered_at,rank_position,rank_total,rank_category,rank_area,rank_captured_at)
 values(target.entity_key,target.source,captured,case when point is not null and total is not null then 'success' else 'partial' end,
 point,scale,total,case when target.source in ('grab','shopee') then 'ratings' else 'reviews' end,
 case when point is not null then captured end,case when total is not null then captured end,'manual','manual',p->>'requestId',nullif(p->>'note',''),clock_timestamp(),rp,rt,p->>'rankCategory',nullif(trim(p->>'rankArea'),''),case when has_rank then captured end) returning id into new_id;
 update review_tracker_directory_sources set
  rating=case when point is not null and (rating_captured_at is null or captured>=rating_captured_at) then point else rating end,
  rating_captured_at=case when point is not null and (rating_captured_at is null or captured>=rating_captured_at) then captured else rating_captured_at end,
  review_count=case when total is not null and (count_captured_at is null or captured>=count_captured_at) then total else review_count end,
  count_captured_at=case when total is not null and (count_captured_at is null or captured>=count_captured_at) then captured else count_captured_at end,
  count_kind=case when total is not null and (count_captured_at is null or captured>=count_captured_at) then case when source in ('grab','shopee') then 'ratings' else 'reviews' end else count_kind end,
  count_display=case when total is not null and (count_display_captured_at is null or captured>=count_display_captured_at) then null else count_display end,
  count_display_captured_at=case when total is not null and (count_display_captured_at is null or captured>=count_display_captured_at) then null else count_display_captured_at end,
  rank_position=case when has_rank and (rank_captured_at is null or captured>=rank_captured_at) then rp else rank_position end,
  rank_total=case when has_rank and (rank_captured_at is null or captured>=rank_captured_at) then rt else rank_total end,
  rank_category=case when has_rank and (rank_captured_at is null or captured>=rank_captured_at) then p->>'rankCategory' else rank_category end,
  rank_area=case when has_rank and (rank_captured_at is null or captured>=rank_captured_at) then trim(p->>'rankArea') else rank_area end,
  rank_captured_at=case when has_rank and (rank_captured_at is null or captured>=rank_captured_at) then captured else rank_captured_at end,
  rating_max=scale
 where entity_key=target.entity_key and source=target.source;
 return jsonb_build_object('ok',true,'id',new_id,'duplicate',false);
end;$$;
create or replace function public.review_tracker_directory_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('sources',
  (select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object(
   'rating_method',coalesce((select h.method from review_tracker_source_history h where h.entity_key=s.entity_key and h.source=s.source and h.rating_at=s.rating_captured_at and h.rating=s.rating order by h.id desc limit 1),s.collection_method),
   'count_method',coalesce((select h.method from review_tracker_source_history h where h.entity_key=s.entity_key and h.source=s.source and h.count_at=s.count_captured_at and h.review_count=s.review_count order by h.id desc limit 1),s.collection_method),
   'rank_method',case when s.rank_position is null then null else coalesce((select h.method from review_tracker_source_history h where h.entity_key=s.entity_key and h.source=s.source and h.rank_captured_at=s.rank_captured_at and h.rank_position=s.rank_position order by h.id desc limit 1),s.collection_method) end
  ) order by s.source),'[]'::jsonb) from review_tracker_directory_sources s where s.entity_key=d.entity_key)
 ) order by relationship,category,name),'[]'::jsonb) from review_tracker_directory d;
$$;
revoke all on function public.review_tracker_manual_summary_ingest(jsonb),public.review_tracker_directory_read() from public,anon,authenticated;
grant execute on function public.review_tracker_manual_summary_ingest(jsonb),public.review_tracker_directory_read() to service_role;
commit;
