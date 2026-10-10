-- Run after public-source-summary.sql and source-history.sql.
-- Store Tripadvisor's own relative ranking and retain each captured position.
begin;
alter table public.review_tracker_directory_sources
 add column if not exists rank_position integer,
 add column if not exists rank_total integer,
 add column if not exists rank_category text,
 add column if not exists rank_area text,
 add column if not exists rank_captured_at timestamptz;
alter table public.review_tracker_source_history
 add column if not exists rank_position integer,
 add column if not exists rank_total integer,
 add column if not exists rank_category text,
 add column if not exists rank_area text,
 add column if not exists rank_captured_at timestamptz;
alter table public.review_tracker_directory_sources drop constraint if exists review_tracker_directory_rank_check;
alter table public.review_tracker_directory_sources add constraint review_tracker_directory_rank_check check(
 (rank_position is null and rank_total is null and rank_category is null and rank_area is null and rank_captured_at is null)
 or (source='tripadvisor' and rank_position is not null and rank_position>=1 and rank_total is not null and rank_total>=rank_position and rank_category is not null and rank_category in ('hotel','restaurant','attraction','b_and_b','specialty_lodging') and rank_area is not null and length(rank_area) between 1 and 160 and rank_captured_at is not null));
alter table public.review_tracker_source_history drop constraint if exists review_tracker_history_rank_check;
alter table public.review_tracker_source_history add constraint review_tracker_history_rank_check check(
 rank_position is null or (rank_position>=1 and rank_total is not null and rank_total>=rank_position and rank_category is not null and rank_category in ('hotel','restaurant','attraction','b_and_b','specialty_lodging') and rank_area is not null and length(rank_area) between 1 and 160 and rank_captured_at is not null));

create or replace function public.review_tracker_history_directory() returns trigger
language plpgsql security invoker set search_path=public as $$
declare fresh_rating boolean; fresh_count boolean; fresh_label boolean; fresh_rank boolean;
begin
 if new.last_attempt_at is null or new.last_attempt_at is not distinct from old.last_attempt_at then return new;end if;
 fresh_rating:=new.rating_captured_at is not null and new.rating_captured_at is distinct from old.rating_captured_at;
 fresh_count:=new.count_captured_at is not null and new.count_captured_at is distinct from old.count_captured_at;
 fresh_label:=new.count_display is not null and new.count_display_captured_at is distinct from old.count_display_captured_at;
 fresh_rank:=new.rank_position is not null and new.rank_captured_at is not null and new.rank_captured_at is distinct from old.rank_captured_at;
 insert into review_tracker_source_history(entity_key,source,attempted_at,status,rating,rating_max,review_count,count_display,count_kind,rating_at,count_at,method,error,origin,origin_key,rank_position,rank_total,rank_category,rank_area,rank_captured_at)
 values(new.entity_key,new.source,new.last_attempt_at,
 case when not(fresh_rating or fresh_count or fresh_label or fresh_rank) then 'failed' when fresh_rating and fresh_count then 'success' else 'partial' end,
 case when fresh_rating then new.rating end,new.rating_max,case when fresh_count then new.review_count end,case when fresh_label then new.count_display end,new.count_kind,
 case when fresh_rating then new.rating_captured_at end,case when fresh_label then new.count_display_captured_at when fresh_count then new.count_captured_at end,
 new.collection_method,new.last_error,'directory',new.entity_key||':'||new.source||':'||new.last_attempt_at::text,
 case when fresh_rank then new.rank_position end,case when fresh_rank then new.rank_total end,case when fresh_rank then new.rank_category end,case when fresh_rank then new.rank_area end,case when fresh_rank then new.rank_captured_at end)
 on conflict(origin,origin_key) do nothing;
 return new;
end;$$;

create or replace function public.review_tracker_public_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('name',d.name,'category',d.category) order by s.source,d.name),'[]'::jsonb)
 from public.review_tracker_directory_sources s join public.review_tracker_directory d using(entity_key)
 where s.source<>'google' and s.warning is null and not exists(select 1 from public.review_tracker_ota_targets t where t.source=s.source and t.hotel_key=s.entity_key and t.enabled);
$$;

create or replace function public.review_tracker_public_summary_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources; captured timestamptz; scale numeric; rp integer; rt integer;
begin
 select * into target from public.review_tracker_directory_sources where entity_key=p->>'entityKey' and source=p->>'source' and source<>'google' and warning is null for update;
 if not found then raise exception 'Unknown public source target';end if;
 if p->>'status'='failed' then
  update public.review_tracker_directory_sources set last_attempt_at=now(),last_error=p->>'error' where entity_key=target.entity_key and source=target.source;
  return jsonb_build_object('status','failed','preservedPreviousData',true);
 end if;
 if target.source_url<>p->>'sourceUrl' or (target.resolved_source_token is not null and target.resolved_source_token<>p->>'sourceToken') then raise exception 'Public source identity changed';end if;
 scale:=case when target.source in ('tripadvisor','grab','shopee') then 5 else 10 end;
 if (p->>'ratingMax')::numeric<>scale then raise exception 'Wrong rating scale';end if;
 if p->>'rankPosition' is not null then
  rp:=(p->>'rankPosition')::integer;rt:=(p->>'rankTotal')::integer;
  if target.source<>'tripadvisor' or rp is null or rp<1 or rt is null or rt<rp or p->>'rankCategory' is null or p->>'rankCategory' not in ('hotel','restaurant','attraction','b_and_b','specialty_lodging') or coalesce(length(trim(p->>'rankArea')),0) not between 1 and 160 then raise exception 'Invalid Tripadvisor ranking';end if;
 end if;
 captured:=(p->>'capturedAt')::timestamptz;
 if (p->>'rating' is null or target.rating_captured_at>captured) and (p->>'reviewCount' is null or target.count_captured_at>captured) and (p->>'countDisplay' is null or target.count_display_captured_at>captured) and (p->>'rankPosition' is null or (target.rank_captured_at is not null and target.rank_captured_at>captured)) then return jsonb_build_object('status','stale');end if;
 update public.review_tracker_directory_sources set
  rating=case when p->>'rating' is not null and (rating_captured_at is null or rating_captured_at<=captured) then (p->>'rating')::numeric else rating end,
  rating_captured_at=case when p->>'rating' is not null and (rating_captured_at is null or rating_captured_at<=captured) then captured else rating_captured_at end,
  review_count=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then (p->>'reviewCount')::bigint else review_count end,
  count_display=case when (p->>'reviewCount' is not null or p->>'countDisplay' is not null) and (count_display_captured_at is null or count_display_captured_at<=captured) then p->>'countDisplay' else count_display end,
  count_display_captured_at=case when (p->>'reviewCount' is not null or p->>'countDisplay' is not null) and (count_display_captured_at is null or count_display_captured_at<=captured) then case when p->>'countDisplay' is not null then captured else null end else count_display_captured_at end,
  count_kind=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then coalesce(p->>'countKind','reviews') else count_kind end,
  count_captured_at=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then captured else count_captured_at end,
  rank_position=case when p->>'rankPosition' is not null and (rank_captured_at is null or rank_captured_at<=captured) then rp else rank_position end,
  rank_total=case when p->>'rankPosition' is not null and (rank_captured_at is null or rank_captured_at<=captured) then rt else rank_total end,
  rank_category=case when p->>'rankPosition' is not null and (rank_captured_at is null or rank_captured_at<=captured) then p->>'rankCategory' else rank_category end,
  rank_area=case when p->>'rankPosition' is not null and (rank_captured_at is null or rank_captured_at<=captured) then trim(p->>'rankArea') else rank_area end,
  rank_captured_at=case when p->>'rankPosition' is not null and (rank_captured_at is null or rank_captured_at<=captured) then captured else rank_captured_at end,
  rating_max=scale,last_attempt_at=now(),last_error=case when p->>'rating' is null then 'missing_rating' when p->>'reviewCount' is null then case when p->>'countDisplay' is not null then 'approximate_count' else 'missing_count' end else null end,
  collection_method=p->>'method',resolved_source_token=coalesce(resolved_source_token,p->>'sourceToken')
 where entity_key=target.entity_key and source=target.source;
 return jsonb_build_object('status','success');
end;
$$;
revoke all on function public.review_tracker_history_directory(),public.review_tracker_public_targets_read(),public.review_tracker_public_summary_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_history_directory(),public.review_tracker_public_targets_read(),public.review_tracker_public_summary_ingest(jsonb) to service_role;
commit;
