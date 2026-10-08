begin;
alter table public.review_tracker_ota_summary add column if not exists last_attempt_at timestamptz;
alter table public.review_tracker_ota_summary add column if not exists last_error text;
alter table public.review_tracker_ota_summary add column if not exists collection_method text;
create table if not exists public.review_tracker_ota_targets (
 source text not null check(source in ('agoda','traveloka','trip')),property_id text not null,
 property_name text not null,hotel_key text not null,source_url text not null,
 google_place_id bigint references public.review_tracker_places(id) on delete set null,
 enabled boolean not null default true,last_attempt_at timestamptz,last_success_at timestamptz,
 last_status text,last_error text,primary key(source,property_id)
);
create table if not exists public.review_tracker_ota_runs (
 id bigint generated always as identity primary key,source text not null,property_id text not null,
 attempted_at timestamptz not null default now(),status text not null,method text not null,error text
);
create table if not exists public.review_tracker_ota_daily (
 source text not null,property_id text not null,date date not null,rating numeric not null,
 review_count bigint not null,captured_at timestamptz not null,method text not null,
 primary key(source,property_id,date)
);
alter table public.review_tracker_ota_targets enable row level security;
alter table public.review_tracker_ota_runs enable row level security;
alter table public.review_tracker_ota_daily enable row level security;
revoke all on public.review_tracker_ota_targets,public.review_tracker_ota_runs,public.review_tracker_ota_daily from public,anon,authenticated;
grant select,insert,update,delete on public.review_tracker_ota_targets,public.review_tracker_ota_runs,public.review_tracker_ota_daily to service_role;
grant usage,select on sequence public.review_tracker_ota_runs_id_seq to service_role;
create or replace function public.review_tracker_ota_targets_read() returns jsonb
language sql stable security invoker set search_path=public as $$
select coalesce(jsonb_agg(to_jsonb(t) order by property_name,source),'[]'::jsonb) from public.review_tracker_ota_targets t where enabled;
$$;
create or replace function public.review_tracker_ota_ingest(p jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare t public.review_tracker_ota_targets; captured timestamptz; r jsonb; n integer:=0;
begin
 select * into t from public.review_tracker_ota_targets where source=p->>'source' and property_id=p->>'propertyId' and enabled for update;
 if not found then raise exception 'Unknown enabled OTA target';end if;
 update public.review_tracker_ota_targets set last_attempt_at=now(),last_status=p->>'status',last_error=p->>'error' where source=t.source and property_id=t.property_id;
 insert into public.review_tracker_ota_runs(source,property_id,status,method,error) values(t.source,t.property_id,p->>'status',p->>'method',p->>'error');
 if p->>'status'='failed' then
  update public.review_tracker_ota_summary set last_attempt_at=now(),last_error=p->>'error' where source=t.source and property_id=t.property_id;
  return jsonb_build_object('status','failed','preservedPreviousData',true);
 end if;
 captured:=(p->>'capturedAt')::timestamptz;
 -- Ignore delayed deliveries: never replace newer data with an older observation.
 if exists(select 1 from public.review_tracker_ota_targets where source=t.source and property_id=t.property_id and last_success_at>captured) then return jsonb_build_object('status','stale');end if;
 if p->'summary' is not null and p->'summary'<>'null'::jsonb then
  insert into public.review_tracker_ota_summary(source,property_id,property_name,hotel_key,google_place_id,rating,rating_max,review_count,captured_at,source_url,is_pilot,last_attempt_at,last_error,collection_method)
  values(t.source,t.property_id,t.property_name,t.hotel_key,t.google_place_id,(p->'summary'->>'rating')::numeric,10,(p->'summary'->>'count')::bigint,captured,t.source_url,false,now(),null,p->>'method')
  on conflict(source,property_id) do update set rating=excluded.rating,review_count=excluded.review_count,captured_at=excluded.captured_at,is_pilot=false,last_attempt_at=now(),last_error=null,collection_method=excluded.collection_method,hotel_key=excluded.hotel_key;
  insert into public.review_tracker_ota_daily values(t.source,t.property_id,(captured at time zone 'Asia/Ho_Chi_Minh')::date,(p->'summary'->>'rating')::numeric,(p->'summary'->>'count')::bigint,captured,p->>'method')
  on conflict(source,property_id,date) do update set rating=excluded.rating,review_count=excluded.review_count,captured_at=excluded.captured_at,method=excluded.method;
 end if;
 for r in select value from jsonb_array_elements(p->'reviews') loop
  insert into public.review_tracker_ota_pilot(source,property_id,review_id,payload)
  values(t.source,t.property_id,r->>'reviewId',r||jsonb_build_object('key',t.source||':'||t.property_id||':'||(r->>'reviewId'),'source',t.source,'propertyId',t.property_id,'propertyName',t.property_name,'sourceUrl',t.source_url,'capturedAt',captured,'collectionMethod',p->>'method','isPilot',false,'collectionComplete',false))
  on conflict(source,property_id,review_id) do update set payload=excluded.payload,imported_at=now();n:=n+1;
 end loop;
 update public.review_tracker_ota_targets set last_success_at=captured,last_error=null where source=t.source and property_id=t.property_id;
 return jsonb_build_object('status','success','reviewsUpserted',n);
end;
$$;
revoke all on function public.review_tracker_ota_targets_read(),public.review_tracker_ota_ingest(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_ota_targets_read(),public.review_tracker_ota_ingest(jsonb) to service_role;
commit;
