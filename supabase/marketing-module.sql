-- Private marketing snapshots. Apply after schema.sql; no client-side secret keys.
create or replace function public.review_tracker_marketing_set(p_key text,p_value jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if p_key !~ '^marketing:(report:[a-f0-9]{64}|last-cron)$' then
    raise exception 'Invalid marketing key' using errcode='22023';
  end if;
  insert into public.review_tracker_kv(key,value,expires_at)
  values(p_key,p_value,now()+interval '366 days')
  on conflict(key) do update set value=excluded.value,expires_at=excluded.expires_at;
end; $$;
revoke all on function public.review_tracker_marketing_set(text,jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_marketing_set(text,jsonb) to service_role;
