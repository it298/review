begin;
alter table public.review_tracker_directory_sources add column if not exists rating_max numeric not null default 5;
alter table public.review_tracker_directory_sources add column if not exists count_display text;
alter table public.review_tracker_directory_sources add column if not exists count_display_captured_at timestamptz;
update public.review_tracker_directory_sources set count_display_captured_at=count_captured_at where count_display is not null and count_display_captured_at is null;
update public.review_tracker_directory_sources set count_captured_at=null where count_display is not null and review_count is null;
alter table public.review_tracker_directory_sources add column if not exists count_kind text not null default 'reviews' check(count_kind in ('ratings','reviews'));
alter table public.review_tracker_directory_sources add column if not exists resolved_source_token text;
alter table public.review_tracker_directory_sources drop constraint if exists review_tracker_directory_sources_rating_check;
alter table public.review_tracker_directory_sources drop constraint if exists review_tracker_public_rating_check;
alter table public.review_tracker_directory_sources add constraint review_tracker_public_rating_check check(rating_max in (5,10) and (rating is null or rating between 0 and rating_max));
create or replace function public.review_tracker_public_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('name',d.name) order by s.source,d.name),'[]'::jsonb)
 from public.review_tracker_directory_sources s join public.review_tracker_directory d using(entity_key)
 where s.source<>'google' and s.warning is null and not exists(select 1 from public.review_tracker_ota_targets t where t.source=s.source and t.hotel_key=s.entity_key and t.enabled);
$$;
create or replace function public.review_tracker_public_summary_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources; captured timestamptz; scale numeric;
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
 captured:=(p->>'capturedAt')::timestamptz;
 if (p->>'rating' is null or target.rating_captured_at>captured) and (p->>'reviewCount' is null or target.count_captured_at>captured) and (p->>'countDisplay' is null or target.count_display_captured_at>captured) then return jsonb_build_object('status','stale');end if;
 update public.review_tracker_directory_sources set
  rating=case when p->>'rating' is not null and (rating_captured_at is null or rating_captured_at<=captured) then (p->>'rating')::numeric else rating end,
  rating_captured_at=case when p->>'rating' is not null and (rating_captured_at is null or rating_captured_at<=captured) then captured else rating_captured_at end,
  review_count=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then (p->>'reviewCount')::bigint else review_count end,
  count_display=case when (p->>'reviewCount' is not null or p->>'countDisplay' is not null) and (count_display_captured_at is null or count_display_captured_at<=captured) then p->>'countDisplay' else count_display end,
  count_display_captured_at=case when (p->>'reviewCount' is not null or p->>'countDisplay' is not null) and (count_display_captured_at is null or count_display_captured_at<=captured) then case when p->>'countDisplay' is not null then captured else null end else count_display_captured_at end,
  count_kind=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then coalesce(p->>'countKind','reviews') else count_kind end,
  count_captured_at=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then captured else count_captured_at end,
  rating_max=scale,last_attempt_at=now(),last_error=case when p->>'rating' is null then 'missing_rating' when p->>'reviewCount' is null then case when p->>'countDisplay' is not null then 'approximate_count' else 'missing_count' end else null end,
  collection_method=p->>'method',resolved_source_token=coalesce(resolved_source_token,p->>'sourceToken')
 where entity_key=target.entity_key and source=target.source;
 return jsonb_build_object('status','success');
end;
$$;
revoke all on function public.review_tracker_public_targets_read(),public.review_tracker_public_summary_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_public_targets_read(),public.review_tracker_public_summary_ingest(jsonb) to service_role;
commit;
