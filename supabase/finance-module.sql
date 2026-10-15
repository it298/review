-- Private finance ledger. Call only from authenticated backend using service_role.
begin;
create table if not exists public.review_tracker_finance_scopes (
 user_id text not null, unit text not null, access text not null check(access in ('editor','viewer','none')),
 primary key(user_id,unit)
);
create table if not exists public.review_tracker_finance_entries (
 id bigint generated always as identity primary key,
 unit text not null, day date not null, actor text not null, request_id uuid not null,
 entry jsonb not null, status text not null default 'draft' check(status in ('draft','posted','void')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(actor,request_id)
);
create index if not exists finance_unit_day on public.review_tracker_finance_entries(unit,day,id);
create table if not exists public.review_tracker_finance_audit (
 id bigint generated always as identity primary key, at timestamptz not null default now(),
 actor text not null, unit text not null, action text not null, details jsonb not null
);
alter table public.review_tracker_finance_scopes enable row level security;
alter table public.review_tracker_finance_entries enable row level security;
alter table public.review_tracker_finance_audit enable row level security;
revoke all on public.review_tracker_finance_scopes,public.review_tracker_finance_entries,public.review_tracker_finance_audit from public,anon,authenticated;
grant select,insert,update on public.review_tracker_finance_scopes,public.review_tracker_finance_entries to service_role;
grant select,insert on public.review_tracker_finance_audit to service_role;
grant usage,select on sequence public.review_tracker_finance_entries_id_seq,public.review_tracker_finance_audit_id_seq to service_role;
create or replace function public.review_tracker_finance(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a text:=p->>'action'; u text:=p->>'unit'; actor_id text:=p->>'actor';
 is_admin boolean:=coalesce((p->>'admin')::boolean,false); scope_access text;
 row_data public.review_tracker_finance_entries; e jsonb; result jsonb;
begin
 if actor_id is null or actor_id='' then raise exception 'Actor required'; end if;
 if a='scopes' then
  return coalesce((select jsonb_agg(jsonb_build_object('userId',s.user_id,'unit',s.unit,'access',s.access)) from public.review_tracker_finance_scopes s where is_admin or s.user_id=actor_id and s.access<>'none'),'[]');
 end if;
 select s.access into scope_access from public.review_tracker_finance_scopes s where s.user_id=actor_id and s.unit=u;
 if not is_admin and coalesce(scope_access,'none') not in ('editor','viewer') then raise exception 'No finance access'; end if;
 if a='read' then
  if (select count(*) from public.review_tracker_finance_entries t where t.unit=u and t.day between (p->>'from')::date and (p->>'to')::date)>5000 then raise exception 'Report exceeds 5000 rows; shorten period'; end if;
  select coalesce(jsonb_agg(t.entry || jsonb_build_object('id',t.id,'status',t.status,'actor',t.actor,'createdAt',t.created_at,'updatedAt',t.updated_at) order by t.day desc,t.id desc),'[]') into result from public.review_tracker_finance_entries t where t.unit=u and t.day between (p->>'from')::date and (p->>'to')::date;
  return jsonb_build_object('entries',result,'access',case when is_admin then 'admin' else scope_access end);
 elsif a='save' then
  if not is_admin and scope_access<>'editor' then raise exception 'Read only'; end if;
  e:=p->'entry';
  if jsonb_typeof(e)<>'object' or e->>'kind' not in ('receipt','payment','revenue','expense') or (e->>'amount')::numeric=0 or abs((e->>'amount')::numeric)>1000000000000 or (e->>'amount')::numeric<>trunc((e->>'amount')::numeric) or length(trim(e->>'description')) not between 1 and 1000 then raise exception 'Invalid entry'; end if;
  insert into public.review_tracker_finance_entries(unit,day,actor,request_id,entry) values(u,(e->>'date')::date,actor_id,(e->>'requestId')::uuid,e) on conflict(actor,request_id) do nothing returning * into row_data;
  if row_data.id is null then
   select * into row_data from public.review_tracker_finance_entries t where t.actor=actor_id and t.request_id=(e->>'requestId')::uuid;
   if row_data.unit<>u or row_data.entry<>e then raise exception 'Idempotency key conflict'; end if;
  else
   insert into public.review_tracker_finance_audit(actor,unit,action,details) values(actor_id,u,'create',jsonb_build_object('id',row_data.id,'entry',e));
  end if;
  return jsonb_build_object('ok',true,'id',row_data.id,'status',row_data.status);
 elsif a='review' then
  if not is_admin or p->>'status' not in ('posted','void') or length(trim(p->>'reason')) not between 1 and 500 then raise exception 'Admin review required'; end if;
  select * into row_data from public.review_tracker_finance_entries t where t.id=(p->>'id')::bigint and t.unit=u for update;
  if row_data.id is null or row_data.status='void' or (p->>'status'='posted' and row_data.status<>'draft') then raise exception 'Invalid status transition'; end if;
  update public.review_tracker_finance_entries set status=p->>'status',updated_at=now() where id=row_data.id;
  insert into public.review_tracker_finance_audit(actor,unit,action,details) values(actor_id,u,'review',jsonb_build_object('id',row_data.id,'before',row_data.status,'after',p->>'status','reason',p->>'reason'));
  return jsonb_build_object('ok',true);
 elsif a='scope' then
  if not is_admin or p->>'access' not in ('editor','viewer','none') then raise exception 'Admin required'; end if;
  insert into public.review_tracker_finance_scopes(user_id,unit,access) values(p->>'userId',u,p->>'access') on conflict(user_id,unit) do update set access=excluded.access;
  insert into public.review_tracker_finance_audit(actor,unit,action,details) values(actor_id,u,'scope',jsonb_build_object('userId',p->>'userId','access',p->>'access'));
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Unknown finance action';
end;
$$;
revoke all on function public.review_tracker_finance(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_finance(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
