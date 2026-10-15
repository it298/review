-- Run finance-module.sql first. Private workflow extension; rerunnable.
begin;
alter table public.review_tracker_finance_entries drop constraint if exists review_tracker_finance_entries_status_check;
alter table public.review_tracker_finance_entries add constraint review_tracker_finance_entries_status_check check(status in ('draft','returned','posted','void'));
create table if not exists public.review_tracker_finance_days(unit text not null,day date not null,status text not null default 'draft' check(status in ('draft','submitted','returned','closed')),report jsonb not null,actor text not null,reason text,updated_at timestamptz not null default now(),primary key(unit,day));
create table if not exists public.review_tracker_finance_files(id uuid primary key,unit text not null,entry_id bigint not null references public.review_tracker_finance_entries(id),actor text not null,name text not null,mime text not null,bytes integer not null check(bytes between 1 and 5242880),object_path text not null,created_at timestamptz not null default now());
create table if not exists public.review_tracker_finance_months(unit text not null,month text not null,status text not null check(status in ('locked','open')),actor text not null,reason text not null,updated_at timestamptz not null default now(),primary key(unit,month));
alter table public.review_tracker_finance_months enable row level security;
revoke all on public.review_tracker_finance_months from public,anon,authenticated;
grant select,insert,update on public.review_tracker_finance_months to service_role;
create table if not exists public.review_tracker_finance_mutex(unit text primary key);
alter table public.review_tracker_finance_days enable row level security;
alter table public.review_tracker_finance_files enable row level security;
alter table public.review_tracker_finance_mutex enable row level security;
revoke all on public.review_tracker_finance_days,public.review_tracker_finance_files,public.review_tracker_finance_mutex from public,anon,authenticated;
grant select,insert,update on public.review_tracker_finance_days,public.review_tracker_finance_files,public.review_tracker_finance_mutex to service_role;
do $$ begin if to_regprocedure('public.review_tracker_finance_v1(jsonb)') is null then alter function public.review_tracker_finance(jsonb) rename to review_tracker_finance_v1; end if; end $$;
create or replace function public.review_tracker_finance(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a text:=p->>'action';u text:=p->>'unit';who text:=p->>'actor';adm boolean:=coalesce((p->>'admin')::boolean,false);access_role text;
 e jsonb;r public.review_tracker_finance_entries;d public.review_tracker_finance_days;result jsonb;j jsonb;item record;quantity numeric;inventory jsonb:='{}';ref text;balance numeric;day_state text;next_state text;day_value date;before_value jsonb;file_row public.review_tracker_finance_files;
begin
 if who is null or who='' then raise exception 'Actor required'; end if;
 if a='scopes' then return public.review_tracker_finance_v1(p); end if;
 select s.access into access_role from public.review_tracker_finance_scopes s where s.user_id=who and s.unit=u;
 if not adm and coalesce(access_role,'none') not in ('editor','viewer') then raise exception 'No finance access';end if;
 if a='read' then
  result:=public.review_tracker_finance_v1(p);
  if (select count(*) from public.review_tracker_finance_entries t where t.unit=u and t.day<=(p->>'to')::date and t.status='posted' and (t.entry->>'kind'='stock' or t.entry->>'category'='deposit'))>10000 then raise exception 'History exceeds report limit';end if;
  return result || jsonb_build_object('months',coalesce((select jsonb_agg(to_jsonb(m)) from public.review_tracker_finance_months m where m.unit=u and m.month between left(p->>'from',7) and left(p->>'to',7)),'[]'),'days',coalesce((select jsonb_agg(to_jsonb(v) order by v.day) from public.review_tracker_finance_days v where v.unit=u and v.day between (p->>'from')::date and (p->>'to')::date),'[]'),'history',coalesce((select jsonb_agg(t.entry||jsonb_build_object('id',t.id,'status',t.status) order by t.day,t.id) from public.review_tracker_finance_entries t where t.unit=u and t.day<=(p->>'to')::date and t.status='posted' and (t.entry->>'kind'='stock' or t.entry->>'category'='deposit')),'[]'),'previousDay',(select to_jsonb(v) from public.review_tracker_finance_days v where v.unit=u and v.day<(p->>'from')::date and v.status='closed' order by v.day desc limit 1),'files',coalesce((select jsonb_agg(to_jsonb(f)-'object_path') from public.review_tracker_finance_files f join public.review_tracker_finance_entries t on t.id=f.entry_id where f.unit=u and t.day between (p->>'from')::date and (p->>'to')::date),'[]'),'audit',coalesce((select jsonb_agg(to_jsonb(v) order by v.at desc,v.id desc) from (select id,at,actor,action,details from public.review_tracker_finance_audit v where v.unit=u order by v.at desc,v.id desc limit 100)v),'[]'));
 elsif a='file_read' then
  select * into file_row from public.review_tracker_finance_files f where f.id=(p->>'fileId')::uuid and f.unit=u;
  if file_row.id is null then raise exception 'File not found';end if;return to_jsonb(file_row);
 end if;
 if not adm and access_role<>'editor' then raise exception 'Read only';end if;
 insert into public.review_tracker_finance_mutex(unit) values(u) on conflict do nothing;
 perform 1 from public.review_tracker_finance_mutex where unit=u for update;
 if a='month_review' then
  if not adm or p->>'month' !~ '^\d{4}-\d{2}$' or p->>'status' not in ('locked','open') or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Admin month review required';end if;
  day_value:=((p->>'month')||'-01')::date;
  if p->>'status'='locked' and exists(select 1 from generate_series(day_value::timestamp,(day_value+interval '1 month -1 day')::timestamp,interval '1 day')v where not exists(select 1 from public.review_tracker_finance_days x where x.unit=u and x.day=v::date and x.status='closed')) then raise exception 'Chốt đủ các ngày trong tháng trước khi khóa tháng';end if;
  insert into public.review_tracker_finance_months(unit,month,status,actor,reason) values(u,p->>'month',p->>'status',who,p->>'reason') on conflict(unit,month) do update set status=excluded.status,actor=who,reason=excluded.reason,updated_at=now();
  insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,a,p-'admin');return jsonb_build_object('ok',true);
 end if;
 if a in ('edit','review','file_context','file_add') then
  select * into r from public.review_tracker_finance_entries t where t.unit=u and t.id=(p->>'id')::bigint for update;
  if r.id is null then raise exception 'Entry not found';end if;day_value:=r.day;
 elsif a='save' then day_value:=(p->'entry'->>'date')::date;
 elsif a in ('day_save','day_submit','day_review') then day_value:=(p->>'date')::date;
 elsif a='scope' then return public.review_tracker_finance_v1(p);
 else raise exception 'Unknown action';end if;
 if exists(select 1 from public.review_tracker_finance_months m where m.unit=u and m.month=to_char(day_value,'YYYY-MM') and m.status='locked') then raise exception 'Tháng đã khóa. Quản lý cần mở khóa tháng trước.';end if;
 select * into d from public.review_tracker_finance_days v where v.unit=u and v.day=day_value for update;
 if a<>'day_review' and exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day>day_value and v.status='closed') then raise exception 'Có ngày sau đã chốt. Mở lại từ ngày mới nhất trước.';end if;
 if a<>'day_review' and d.status in ('submitted','closed') then raise exception 'Ngày đã gửi hoặc đã chốt. Quản lý cần trả lại/mở lại trước khi sửa.';end if;
 if a in ('save','edit') then
  e:=(p->'entry')||jsonb_build_object('actorName',coalesce(r.entry->>'actorName',p->>'actorName',who));
  if not adm and e->>'kind' in ('revenue','expense') then raise exception 'Admin recognition required';end if;
  if e->>'kind' not in ('receipt','payment','revenue','expense','deposit_use','stock') or abs((e->>'amount')::numeric)>1000000000000 or (e->>'amount')::numeric=0 or length(trim(e->>'description')) not between 1 and 1000 then raise exception 'Invalid entry';end if;
  if a='edit' then
   if r.status not in ('draft','returned') or (not adm and r.actor<>who) then raise exception 'Chỉ được sửa bản chờ duyệt do mình nhập.';end if;
   if (e->>'date')::date<>r.day then raise exception 'Sửa trong cùng ngày; hủy và nhập lại nếu cần đổi ngày.';end if;
   before_value:=r.entry;
   update public.review_tracker_finance_entries set entry=e,status='draft',updated_at=now() where id=r.id;
   insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,'edit',jsonb_build_object('id',r.id,'before',before_value,'after',e));return jsonb_build_object('ok',true,'id',r.id);
  end if;
  if length(trim(coalesce(e->>'reference','')))>0 and length(trim(coalesce(e->>'duplicateReason','')))=0 and exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status<>'void' and t.request_id<>(e->>'requestId')::uuid and t.entry->>'reference'=e->>'reference' and t.entry->>'kind'=e->>'kind' and t.entry->>'amount'=e->>'amount') then raise exception 'Trùng ngày, chứng từ, loại và số tiền. Kiểm tra bản đã nhập hoặc ghi lý do trùng.';end if;
  insert into public.review_tracker_finance_entries(unit,day,actor,request_id,entry) values(u,day_value,who,(e->>'requestId')::uuid,e) on conflict(actor,request_id) do nothing returning * into r;
  if r.id is null then
   select * into r from public.review_tracker_finance_entries t where t.actor=who and t.request_id=(e->>'requestId')::uuid;
   if r.unit<>u or r.entry<>e then raise exception 'Idempotency key conflict';end if;
  else insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,'create',jsonb_build_object('id',r.id,'entry',e));end if;
  return jsonb_build_object('ok',true,'id',r.id,'status',r.status);
 elsif a in ('file_context','file_add') then
  if r.status not in ('draft','returned') or (not adm and r.actor<>who) then raise exception 'Chỉ đính kèm khi bản chờ duyệt thuộc mình.';end if;
  if (select count(*) from public.review_tracker_finance_files where entry_id=r.id)>=5 then raise exception 'Tối đa 5 chứng từ mỗi nghiệp vụ';end if;
  if a='file_context' then return jsonb_build_object('ok',true);end if;
  insert into public.review_tracker_finance_files(id,unit,entry_id,actor,name,mime,bytes,object_path) values((p->>'fileId')::uuid,u,r.id,who,p->>'name',p->>'mime',(p->>'bytes')::integer,p->>'path');
  insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,'attachment',jsonb_build_object('id',r.id,'fileId',p->>'fileId','name',p->>'name'));return jsonb_build_object('ok',true);
 elsif a='day_save' then
  if (select max(v.day) from public.review_tracker_finance_days v where v.unit=u and v.status='closed')>=day_value then raise exception 'Đã có ngày chốt bằng hoặc sau ngày này. Mở lại các ngày liên quan trước.';end if;
  insert into public.review_tracker_finance_days(unit,day,report,actor) values(u,day_value,p->'report',who) on conflict(unit,day) do update set report=excluded.report,actor=who,status='draft',reason=null,updated_at=now();
 elsif a='day_submit' then
  if exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day<day_value and v.status<>'closed') or exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day<day_value and t.status<>'void' and not exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day=t.day and v.status='closed')) then raise exception 'Còn báo cáo/nghiệp vụ ngày trước chưa chốt. Hoàn tất ngày trước để nối đúng tồn quỹ.';end if;
  if d.day is null or d.status not in ('draft','returned') then raise exception 'Lưu đối chiếu ngày trước khi gửi';end if;
  if exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status='returned') then raise exception 'Còn nghiệp vụ bị trả lại chưa sửa';end if;
  if not exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status<>'void') and length(trim(coalesce(d.report->>'note','')))=0 then raise exception 'Xác nhận không phát sinh trong ghi chú trước khi gửi';end if;
  -- Capture expected balances from all nonvoid movements; no client supplied totals trusted.
  result:='{}';
  for item in select key,value from jsonb_each(d.report->'opening') loop
   balance:=(item.value::text)::numeric;
   for j in select t.entry from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status<>'void' and t.entry->>'kind' in ('receipt','payment') loop
    select balance+coalesce(sum((v->>'amount')::numeric * case when j->>'kind'='receipt' then 1 else -1 end),0) into balance from jsonb_array_elements(case when jsonb_array_length(coalesce(j->'payments','[]'))>0 then j->'payments' else jsonb_build_array(jsonb_build_object('method',j->>'method','amount',j->'amount')) end)v where v->>'method'=item.key;
   end loop;
   result:=result||jsonb_build_object(item.key,balance);
   if balance<>(d.report->'counted'->>item.key)::numeric and length(trim(coalesce(d.report->>'note','')))=0 then raise exception 'Giải trình chênh lệch trước khi gửi';end if;
  end loop;
  -- Opening must agree with the latest earlier closed day when it exists.
  select v.report->'counted' into before_value from public.review_tracker_finance_days v where v.unit=u and v.day<day_value and v.status='closed' order by v.day desc limit 1;
  if before_value is not null and before_value<>d.report->'opening' then raise exception 'Tồn đầu phải khớp thực tế cuối ngày đã chốt gần nhất';end if;
  update public.review_tracker_finance_days set status='submitted',report=report||jsonb_build_object('expected',result,'submittedAt',now(),'submittedBy',who,'entryCount',(select count(*) from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status<>'void')),updated_at=now() where unit=u and day=day_value;
 elsif a='day_review' then
  if not adm or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Admin reason required';end if;
  next_state:=p->>'status';
  if not ((d.status='submitted' and next_state in ('returned','closed')) or (d.status='closed' and next_state='returned')) then raise exception 'Invalid day transition';end if;
  if next_state='returned' and exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day>day_value and v.status='closed') then raise exception 'Mở lại ngày chốt mới nhất trước';end if;
  if next_state='closed' then
   if exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day<day_value and v.status<>'closed') or exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day<day_value and t.status<>'void' and not exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day=t.day and v.status='closed')) then raise exception 'Còn ngày trước chưa chốt';end if;
   select v.report->'counted' into before_value from public.review_tracker_finance_days v where v.unit=u and v.day<day_value and v.status='closed' order by v.day desc limit 1;
   if before_value is not null and before_value<>d.report->'opening' then raise exception 'Tồn đầu đã thay đổi; trả lại để nhân viên đối chiếu lại';end if;

   if exists(select 1 from public.review_tracker_finance_days v where v.unit=u and v.day>day_value and v.status='closed') then raise exception 'Chốt theo thứ tự ngày';end if;
   if exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status='returned') then raise exception 'Còn nghiệp vụ cần sửa';end if;
   if exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day>day_value and t.status='posted' and t.entry->>'kind'='stock') and exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day=day_value and t.status='draft' and t.entry->>'kind'='stock') then raise exception 'Không ghi kho lùi trước mốc kho đã ghi sổ';end if;
   update public.review_tracker_finance_entries set status='posted',updated_at=now() where unit=u and day=day_value and status='draft';
  end if;
  update public.review_tracker_finance_days set status=next_state,reason=p->>'reason',updated_at=now() where unit=u and day=day_value;
 elsif a='review' then
  if not adm or length(trim(coalesce(p->>'reason','')))=0 or p->>'status' not in ('posted','returned','void') then raise exception 'Admin review required';end if;
  if r.status='void' or (p->>'status' in ('posted','returned') and r.status not in ('draft','returned')) then raise exception 'Invalid entry transition';end if;
  if r.entry->>'kind'='stock' and exists(select 1 from public.review_tracker_finance_entries t where t.unit=u and t.day>r.day and t.status='posted' and t.entry->>'kind'='stock') then raise exception 'Không sửa kho trước mốc đã ghi sổ';end if;
  update public.review_tracker_finance_entries set status=p->>'status',entry=entry||jsonb_build_object('reviewReason',p->>'reason','reviewedBy',who),updated_at=now() where id=r.id;
 end if;
 -- Validate the full posted inventory sequence, allowing no negative stock or unit mismatch.
 inventory:='{}';
 for item in select t.entry,t.id from public.review_tracker_finance_entries t where t.unit=u and t.status='posted' and t.entry->>'kind'='stock' order by t.day,t.id loop
  j:=item.entry->'stock';ref:=j->>'sku';e:=inventory->ref;
  if e is not null and e->>'unit'<>j->>'unit' then raise exception 'Mã hàng khác đơn vị tính';end if;
  if j->>'mode'='opening' and e is not null then raise exception 'Mỗi mã hàng chỉ có một tồn đầu';end if;
  quantity:=coalesce((e->>'quantity')::numeric,0);
  if j->>'mode' in ('opening','in') then quantity:=quantity+(j->>'quantity')::numeric;else quantity:=quantity-(j->>'quantity')::numeric;end if;
  if quantity<0 then raise exception 'Xuất vượt tồn kho: %',ref;end if;
  inventory:=jsonb_set(inventory,array[ref],jsonb_build_object('quantity',quantity,'unit',j->>'unit'));
 end loop;
 -- Validate deposits in chronological order, never borrowing a later receipt.
 inventory:='{}';
 for item in select t.entry from public.review_tracker_finance_entries t where t.unit=u and t.status='posted' and t.entry->>'category'='deposit' order by t.day,t.id loop
  j:=item.entry;ref:=coalesce(nullif(j->>'depositRef',''),nullif(j->>'bookingCode',''),nullif(j->>'reference',''));
  if ref is not null then
   balance:=coalesce((inventory->>ref)::numeric,0)+case when j->>'kind'='receipt' then (j->>'amount')::numeric when j->>'kind' in ('payment','deposit_use') then -(j->>'amount')::numeric else 0 end;
   if balance<0 then raise exception 'Sử dụng/hoàn cọc vượt số nhận tại thời điểm ghi nhận: %',ref;end if;
   inventory:=jsonb_set(inventory,array[ref],to_jsonb(balance));
  end if;
 end loop;
 insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,a,jsonb_build_object('id',p->>'id','date',day_value,'status',p->>'status','reason',p->>'reason','actorName',p->>'actorName'));
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.review_tracker_finance(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_finance(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
