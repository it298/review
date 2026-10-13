-- Private cache for the Blue Jay module, using the existing KV table.
-- Does not change the expiry or permissions of any review/OAuth cache.
begin;
create or replace function public.review_tracker_bluejay_cache_set(p_key text,p_value jsonb)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_key is null or p_key !~ '^bluejay:(record:[a-f0-9]{64}|index|sync-log)$'
    or p_value is null or octet_length(p_value::text)>5000000 then
  raise exception 'Invalid Blue Jay cache payload' using errcode='22023';
 end if;
 insert into public.review_tracker_kv as t(key,value,expires_at)
 values(p_key,p_value,now()+interval '366 days')
 on conflict(key) do update set value=excluded.value,expires_at=excluded.expires_at;
end;
$$;
revoke all on function public.review_tracker_bluejay_cache_set(text,jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_bluejay_cache_set(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
