-- Run after booking-extranet.sql, tripadvisor-ranking.sql and manual-summary.sql.
begin;
alter table public.review_tracker_directory_sources add column if not exists extranet_property_id text;
alter table public.review_tracker_directory_sources add column if not exists extranet_name text;
alter table public.review_tracker_directory_sources add column if not exists extranet_enabled boolean not null default false;
create unique index if not exists review_tracker_extranet_identity on public.review_tracker_directory_sources(source,extranet_property_id) where extranet_property_id is not null;
-- Enrollment below is restricted to identities verified in the signed-in portal.
with verified(entity_key,source,portal_id,public_id,portal_name) as (values
 ('sontra-sea-hotel','traveloka','20057470','9000000986772','Sontra Sea Hotel'),
 ('yzistel-hoi-an-39-le-quy-don','traveloka','20087897','9000005722460','Yzistel'),
 ('quy-nhon-sea-hotel','traveloka','20096147','9000007896045','Vistara Quy Nhon Sea Hotel'),
 ('vistara-gia-lai-sea-hotel','traveloka','20105109','9000008505991','Vistara Gia Lai Sea Hotel'),
 ('sontra-sea-hotel','tripadvisor','24979323','24979323','Sontra Sea Hotel'),
 ('trandoc-mini-mart-24h','tripadvisor','34694475','34694475','Trandoc mini Mart 24h'),
 ('mini-mart-24h-quy-nhon','tripadvisor','34261594','34261594','Mini Mart 24h Quy Nhon'),
 ('sontra-mini-mart-24h','tripadvisor','28050884','28050884','Sontra mini Mart 24h'),
 ('vintage-taste-deli-cafe-hoi-an','tripadvisor','32993663','32993663','Vintage Taste Deli Cafe Hoi An'),
 ('vintage-taste-deli-cafe-sai-gon','tripadvisor','27457230','27457230','Vintage Taste Deli Cafe Sai Gon'),
 ('vistara-gia-lai-sea-hotel','tripadvisor','34666891','34666891','Vistara Gia Lai Sea Hotel'),
 ('yzistel-hoi-an-39-le-quy-don','tripadvisor','33037118','33037118','Yzistel Hoi An'),
 ('quy-nhon-sea-hotel','tripadvisor','34097641','34097641','Quy Nhon Sea Hotel')
)
update public.review_tracker_directory_sources s set extranet_property_id=v.portal_id,extranet_name=v.portal_name,extranet_enabled=(v.source='traveloka')
from verified v,public.review_tracker_directory d where s.entity_key=v.entity_key and s.source=v.source and d.entity_key=s.entity_key and d.relationship='managed' and s.warning is null
 and (s.extranet_property_id is null or s.extranet_property_id=v.portal_id)
 and case when v.source='tripadvisor' then substring(s.source_url from '-d([0-9]+)-')=v.public_id else s.source_url like 'https://www.traveloka.com/%' and position(v.public_id in s.source_url)>0 end;
create or replace function public.review_tracker_extranet_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('name',d.name) order by s.source,d.name),'[]'::jsonb)
 from review_tracker_directory_sources s join review_tracker_directory d using(entity_key)
 where s.source in ('traveloka','tripadvisor') and s.extranet_enabled and s.extranet_property_id is not null and s.warning is null and d.relationship='managed';
$$;
create or replace function public.review_tracker_extranet_summary_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare target public.review_tracker_directory_sources; captured timestamptz;
begin
 select s.* into target from review_tracker_directory_sources s join review_tracker_directory d using(entity_key)
 where s.entity_key=p->>'entityKey' and s.source=p->>'source' and s.source in ('traveloka','tripadvisor') and s.extranet_enabled and s.warning is null and d.relationship='managed' for update of s;
 if not found or target.extranet_property_id is null or target.extranet_property_id is distinct from p->>'extranetPropertyId' or p->>'method' is distinct from 'extranet-auto' or p->>'collectionContext' is distinct from target.source||'-extranet' then raise exception 'Extranet identity mismatch';end if;
 if p->>'status'='failed' then
  if coalesce(p->>'error','') not in ('login_required','network','blocked','invalid_data') then raise exception 'Invalid Extranet failure';end if;
 elsif p->>'status'='success' then
  captured:=(p->>'capturedAt')::timestamptz;
  if p->>'sourceUrl' is distinct from target.source_url or p->>'sourceToken' is null or captured is null or captured<now()-interval '1 day' or captured>now()+interval '5 minutes'
   or p->>'ratingMax' is distinct from (case when target.source='tripadvisor' then '5' else '10' end)
   or p->>'reviewCount' is null or (p->>'reviewCount')::numeric<0 or (p->>'reviewCount')::numeric>9007199254740991 or (p->>'reviewCount')::numeric<>trunc((p->>'reviewCount')::numeric)
   or (p->>'rating' is null and (target.source<>'tripadvisor' or (p->>'reviewCount')::numeric<>0))
   or (p->>'rating' is not null and ((p->>'rating')::numeric not between 0 and (p->>'ratingMax')::numeric or (p->>'rating')::numeric::text in ('NaN','Infinity','-Infinity')))
   then raise exception 'Invalid Extranet summary';end if;
 else raise exception 'Invalid Extranet status';end if;
 return review_tracker_public_summary_ingest(p);
end;$$;
revoke all on function public.review_tracker_extranet_targets_read(),public.review_tracker_extranet_summary_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_extranet_targets_read(),public.review_tracker_extranet_summary_ingest(jsonb) to service_role;
-- Old public workers must not overwrite an explicitly enabled Extranet source.
do $preference$
declare definition text;
begin
 definition:=replace(pg_get_functiondef('public.review_tracker_public_summary_ingest(jsonb)'::regprocedure),E'\r\n',E'\n');
 if position('-- Extranet preference' in definition)=0 then
  if position(E'\nbegin\n' in definition)=0 then raise exception 'Unrecognized public summary function';end if;
  definition:=replace(definition,E'\nbegin\n',E'\nbegin\n -- Extranet preference: retain the selected source even when its session expires.\n if p->>''method'' is distinct from ''extranet-auto'' and exists(select 1 from public.review_tracker_directory_sources s where s.entity_key=p->>''entityKey'' and s.source=p->>''source'' and s.extranet_enabled) then return jsonb_build_object(''status'',''stale'');end if;\n');
  execute definition;
 end if;
end;$preference$;
commit;
