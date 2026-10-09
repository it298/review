-- Run after public-source-summary.sql and source-history.sql. Additive and repeatable.
begin;
alter table public.review_tracker_directory_sources add column if not exists extranet_property_id text;
create unique index if not exists review_tracker_extranet_identity on public.review_tracker_directory_sources(source,extranet_property_id) where extranet_property_id is not null;
-- Verified in the signed-in property home: numeric ID + canonical public hotel URL.
update public.review_tracker_directory_sources set extranet_property_id='17212594'
where entity_key='vistara-gia-lai-sea-hotel' and source='booking'
and source_url='https://www.booking.com/hotel/vn/vistara-gia-lai-sea.vi.html'
and (extranet_property_id is null or extranet_property_id='17212594');

create or replace function public.review_tracker_booking_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('name',d.name) order by d.name),'[]'::jsonb)
 from review_tracker_directory_sources s join review_tracker_directory d using(entity_key)
 where s.source='booking' and s.extranet_property_id is not null and s.warning is null and d.relationship='managed';
$$;
create or replace function public.review_tracker_booking_summary_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources;
begin
 select s.* into target from review_tracker_directory_sources s join review_tracker_directory d using(entity_key)
 where s.entity_key=p->>'entityKey' and s.source='booking' and s.warning is null and d.relationship='managed' for update of s;
 if not found or target.extranet_property_id is null or target.extranet_property_id is distinct from p->>'extranetPropertyId'
 or p->>'source' is distinct from 'booking' or p->>'method' is distinct from 'dom' or p->>'collectionContext' is distinct from 'booking-extranet'
 then raise exception 'Booking Extranet identity does not match the enrolled property';end if;
 if p->>'status'='success' and (p->>'sourceUrl' is distinct from target.source_url or p->>'ratingMax' is distinct from '10'
 or p->>'rating' is null or p->>'reviewCount' is null or (p->>'rating')::numeric not between 0 and 10
 or (p->>'reviewCount')::numeric<0 or (p->>'reviewCount')::numeric<>trunc((p->>'reviewCount')::numeric)
 or p->>'capturedAt' is null or (p->>'capturedAt')::timestamptz<now()-interval '1 day' or (p->>'capturedAt')::timestamptz>now()+interval '5 minutes')
 then raise exception 'Invalid Booking Extranet summary';end if;
 if coalesce(p->>'status','') not in ('success','failed') then raise exception 'Invalid Booking refresh status';end if;
 -- Reuse the existing field timestamps, stale protection and immutable history trigger.
 return review_tracker_public_summary_ingest(p);
end;$$;
revoke all on function public.review_tracker_booking_targets_read(),public.review_tracker_booking_summary_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_booking_targets_read(),public.review_tracker_booking_summary_ingest(jsonb) to service_role;
commit;
