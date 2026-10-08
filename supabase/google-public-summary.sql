begin;
alter table public.review_tracker_directory_sources add column if not exists rating numeric check(rating between 0 and 5);
alter table public.review_tracker_directory_sources add column if not exists review_count bigint check(review_count>=0);
alter table public.review_tracker_directory_sources add column if not exists rating_captured_at timestamptz;
alter table public.review_tracker_directory_sources add column if not exists count_captured_at timestamptz;
alter table public.review_tracker_directory_sources add column if not exists last_attempt_at timestamptz;
alter table public.review_tracker_directory_sources add column if not exists last_error text;
alter table public.review_tracker_directory_sources add column if not exists collection_method text;
alter table public.review_tracker_directory_sources add column if not exists resolved_place_token text;
create or replace function public.review_tracker_google_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('entity_key',d.entity_key,'name',d.name,'source_url',s.source_url,'resolved_place_token',s.resolved_place_token) order by d.name),'[]'::jsonb)
 from public.review_tracker_directory d join public.review_tracker_directory_sources s using(entity_key)
 where s.source='google' and s.warning is null;
$$;
create or replace function public.review_tracker_google_summary_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources; captured timestamptz;
begin
 select * into target from public.review_tracker_directory_sources where entity_key=p->>'entityKey' and source='google' and warning is null for update;
 if not found then raise exception 'Unknown Google Maps target';end if;
 if p->>'status'='failed' then
  update public.review_tracker_directory_sources set last_attempt_at=now(),last_error=p->>'error' where entity_key=target.entity_key and source='google';
  return jsonb_build_object('status','failed','preservedPreviousData',true);
 end if;
 if target.resolved_place_token is not null and target.resolved_place_token<>p->>'placeToken' then raise exception 'Google place identity changed';end if;
 captured:=(p->>'capturedAt')::timestamptz;
 if (p->>'rating' is null or target.rating_captured_at>captured) and (p->>'reviewCount' is null or target.count_captured_at>captured) then return jsonb_build_object('status','stale');end if;
 update public.review_tracker_directory_sources set
  rating=case when p->>'rating' is not null and (rating_captured_at is null or rating_captured_at<=captured) then (p->>'rating')::numeric else rating end,
  rating_captured_at=case when p->>'rating' is not null and (rating_captured_at is null or rating_captured_at<=captured) then captured else rating_captured_at end,
  review_count=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then (p->>'reviewCount')::bigint else review_count end,
  count_captured_at=case when p->>'reviewCount' is not null and (count_captured_at is null or count_captured_at<=captured) then captured else count_captured_at end,
  last_attempt_at=now(),last_error=case when p->>'reviewCount' is null then 'missing_count' when p->>'rating' is null then 'missing_rating' else null end,
  collection_method=p->>'method',resolved_place_token=coalesce(resolved_place_token,p->>'placeToken')
 where entity_key=target.entity_key and source='google';
 return jsonb_build_object('status',case when p->>'reviewCount' is null or p->>'rating' is null then 'partial' else 'success' end);
end;
$$;
revoke all on function public.review_tracker_google_targets_read(),public.review_tracker_google_summary_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_google_targets_read(),public.review_tracker_google_summary_ingest(jsonb) to service_role;
commit;
