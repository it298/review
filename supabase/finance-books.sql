-- Apply after finance-module.sql and finance-workflow.sql. Re-runnable.
begin;
alter table public.review_tracker_finance_scopes drop constraint if exists review_tracker_finance_scopes_access_check;
alter table public.review_tracker_finance_scopes add constraint review_tracker_finance_scopes_access_check check(access in ('editor','viewer','manager','none'));
create table if not exists public.review_tracker_finance_books(id uuid primary key,unit text not null,type text not null,day date not null,reference text not null,data jsonb not null,actor text not null,status text not null default 'draft' check(status in ('draft','returned','posted','void')),version integer not null default 1,entry_ids jsonb not null default '[]',reason text,updated_at timestamptz not null default now());
create index if not exists finance_books_unit_day on public.review_tracker_finance_books(unit,day);
create index if not exists finance_cash_reference on public.review_tracker_finance_entries(unit,(entry->>'reference'),day);
create unique index if not exists finance_book_reference on public.review_tracker_finance_books(unit,type,reference) where status='posted';
alter table public.review_tracker_finance_books enable row level security;
revoke all on public.review_tracker_finance_books from public,anon,authenticated;
grant select,insert,update on public.review_tracker_finance_books to service_role;
grant delete on public.review_tracker_finance_files to service_role;
do $$ begin if to_regprocedure('public.review_tracker_finance_v2(jsonb)') is null then alter function public.review_tracker_finance(jsonb) rename to review_tracker_finance_v2;end if;end $$;
create or replace function public.review_tracker_finance(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 a text:=p->>'action';u text:=p->>'unit';who text:=p->>'actor';adm boolean:=coalesce((p->>'admin')::boolean,false);access_role text;
 b public.review_tracker_finance_books;f public.review_tracker_finance_files;r public.review_tracker_finance_entries;
 j jsonb;v jsonb;res jsonb;ids jsonb:='[]';n integer:=0;q numeric;paid numeric;expected jsonb;previous jsonb;d date;
begin
 if coalesce(who,'')='' then raise exception 'Actor required';end if;
 select s.access into access_role from public.review_tracker_finance_scopes s where s.user_id=who and s.unit=u;
 if a='scopes' then return public.review_tracker_finance_v2(p);end if;
 if not adm and coalesce(access_role,'none') not in ('editor','viewer') then raise exception 'No finance access';end if;
 if a='scope' then
  if not adm or p->>'access' not in ('editor','viewer','manager','none') then raise exception 'Admin required';end if;
  insert into public.review_tracker_finance_scopes(user_id,unit,access) values(p->>'userId',u,p->>'access') on conflict(user_id,unit) do update set access=excluded.access;
  insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,a,p-'admin');return jsonb_build_object('ok',true);
 end if;
 if a='books_read' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.day desc,x.updated_at desc),'[]') into res from public.review_tracker_finance_books x
  where x.unit=u and x.day<=(p->>'to')::date and (adm or x.type in ('shift','invoice','stocktake','product')) and
  (case when p ? 'id' then x.id=(p->>'id')::uuid else
   x.day>=coalesce((p->>'from')::date,'1900-01-01'::date) or x.type='product' and x.status='posted' or
   x.type='allocation' and x.status='posted' and (x.day+(((x.data->'data'->>'months')::integer-1)*interval '1 month'))::date>=coalesce((p->>'from')::date,'1900-01-01'::date) or
   adm and x.status='posted' and x.type in ('invoice','stay','receivable','payable') and
   (x.data->'data'->>'total')::numeric<>coalesce((select sum((entry->>'amount')::numeric) from public.review_tracker_finance_entries e where e.unit=u and e.status='posted' and e.day<=(p->>'to')::date and e.entry->>'reference'=x.reference and e.entry->>'category'<>'deposit' and e.entry->>'kind'=case when x.type='payable' then 'payment' else 'receipt' end),0)
  end);
  if jsonb_array_length(res)>5000 then raise exception 'Sổ vượt 5000 phiếu; chọn khoảng ngày ngắn hơn';end if;
  return jsonb_build_object('books',res,'matches',case when adm and not p ? 'id' then coalesce((select jsonb_agg(entry||jsonb_build_object('id',id,'status',status)) from public.review_tracker_finance_entries e where unit=u and status='posted' and day<=(p->>'to')::date and entry->>'kind' in ('receipt','payment') and exists(select 1 from jsonb_array_elements(res)x where x->>'status'='posted' and x->>'reference'=e.entry->>'reference' and x->>'type' in ('invoice','stay','receivable','payable'))),'[]') else '[]'::jsonb end);
 end if;
 if a='file_read' then
  res:=public.review_tracker_finance_v2(p);
  if not adm and exists(select 1 from public.review_tracker_finance_entries where id=(res->>'entry_id')::bigint and entry->>'kind' in ('revenue','expense')) then raise exception 'Chứng từ thuộc báo cáo quản lý';end if;
  return res;
 end if;
 if a not in ('books_save','books_review','file_remove','save','edit','review','day_submit','day_review') then return public.review_tracker_finance_v2(p);end if;
 if not adm and access_role<>'editor' then raise exception 'Read only';end if;
 insert into public.review_tracker_finance_mutex(unit) values(u) on conflict do nothing;
 perform 1 from public.review_tracker_finance_mutex where unit=u for update;
 if a='file_remove' then
  select * into f from public.review_tracker_finance_files where unit=u and id=(p->>'fileId')::uuid;
  select * into r from public.review_tracker_finance_entries where unit=u and id=f.entry_id;
  if f.id is null or r.status not in ('draft','returned') or (not adm and r.actor<>who) then raise exception 'Chỉ gỡ chứng từ khỏi bản chờ duyệt của mình';end if;
  if exists(select 1 from public.review_tracker_finance_days where unit=u and day>=r.day and status in ('submitted','closed')) or exists(select 1 from public.review_tracker_finance_months where unit=u and month=to_char(r.day,'YYYY-MM') and status='locked') then raise exception 'Ngày hoặc tháng đã khóa';end if;
  delete from public.review_tracker_finance_files where id=f.id;
  insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,a,to_jsonb(f)||jsonb_build_object('reason',p->>'reason'));
  return jsonb_build_object('ok',true);
 end if;
 if a in ('edit','review') then
  select * into r from public.review_tracker_finance_entries where unit=u and id=(p->>'id')::bigint;
  if exists(select 1 from public.review_tracker_finance_books x where x.unit=u and x.type='shift' and x.status='posted' and x.data->'data'->'entryIds' ? r.id::text) then raise exception 'Nghiệp vụ đã bàn giao; mở lại ca trước khi sửa';end if;
  if r.entry ? 'bookId' and not coalesce((p->>'internalBook')::boolean,false) then raise exception 'Xử lý cả phiếu liên kết trong Sổ nghiệp vụ mở rộng';end if;
 end if;
 if a='day_submit' and exists(select 1 from public.review_tracker_finance_books where unit=u and day=(p->>'date')::date and type in ('shift','invoice','stocktake') and status in ('draft','returned')) then raise exception 'Còn phiếu ca, hóa đơn hoặc kiểm kê chưa được duyệt';end if;
 if a in ('save','edit') and exists(select 1 from public.review_tracker_finance_books x where x.unit=u and x.status='posted' and x.reference=p->'entry'->>'reference' and ((x.type in ('invoice','stay') and p->'entry'->>'kind'='revenue') or (x.type in ('payroll','allocation') and (p->'entry'->>'kind'='expense' or coalesce((p->'entry'->>'recognizeExpense')::boolean,false))))) then raise exception 'Chi phí / doanh thu đã được ghi nhận từ phiếu liên kết; không nhập lặp';end if;
 if a not in ('books_save','books_review') then
  res:=public.review_tracker_finance_v2(p);
  -- A cash entry is matched once to an exact, unique debt reference, excluding deposits.
  for b in select * from public.review_tracker_finance_books where unit=u and status='posted' and type in ('invoice','stay','receivable','payable') loop
   select coalesce(sum((entry->>'amount')::numeric),0) into paid from public.review_tracker_finance_entries where unit=u and status='posted' and entry->>'reference'=b.reference and entry->>'kind'=case when b.type='payable' then 'payment' else 'receipt' end and entry->>'category'<>'deposit';
   if paid<0 or paid>(b.data->'data'->>'total')::numeric then raise exception 'Tiền đối soát vượt công nợ phiếu %',b.reference;end if;
  end loop;
  return res;
 end if;
 select * into b from public.review_tracker_finance_books where unit=u and id=(p->>'id')::uuid for update;
 if a='books_save' then
  j:=p->'book';d:=(j->>'date')::date;
  if not adm and j->>'type' not in ('shift','invoice','stocktake') then raise exception 'Chỉ quản lý lập sổ này';end if;
  if b.id is not null and b.data=j and b.status='draft' then return to_jsonb(b);end if;
  if b.id is not null and (b.status not in ('draft','returned') or (not adm and b.actor<>who) or b.version<>coalesce((p->>'version')::integer,0)) then raise exception 'Phiếu đã thay đổi hoặc không còn được sửa. Tải lại sổ.';end if;
  if exists(select 1 from public.review_tracker_finance_books where id=(p->>'id')::uuid and unit<>u) then raise exception 'Phiếu không thuộc cơ sở';end if;
  if b.id is not null and b.day<>d then raise exception 'Giữ nguyên ngày phiếu khi sửa';end if;
  if exists(select 1 from public.review_tracker_finance_days where unit=u and day>=d and status in ('submitted','closed')) or exists(select 1 from public.review_tracker_finance_months where unit=u and month=to_char(d,'YYYY-MM') and status='locked') then raise exception 'Ngày hoặc kỳ đã khóa';end if;
  insert into public.review_tracker_finance_books(id,unit,type,day,reference,data,actor) values((j->>'id')::uuid,u,j->>'type',d,j->>'reference',j,who) on conflict(id) do update set type=excluded.type,reference=excluded.reference,data=excluded.data,status='draft',version=review_tracker_finance_books.version+1,updated_at=now() where review_tracker_finance_books.unit=excluded.unit returning * into b;
  if b.id is null then raise exception 'Phiếu không thuộc cơ sở';end if;
 else
  if not adm or b.id is null or b.version<>coalesce((p->>'version')::integer,0) or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Cần quyền quản lý, lý do và phiên bản phiếu hiện tại';end if;
  if p->>'status' not in ('posted','returned','void') or b.status='void' or (p->>'status' in ('posted','returned') and b.status not in ('draft','returned')) then raise exception 'Trạng thái phiếu không hợp lệ';end if;
  if exists(select 1 from public.review_tracker_finance_days where unit=u and day>=b.day and status in ('submitted','closed')) or exists(select 1 from public.review_tracker_finance_months where unit=u and month=to_char(b.day,'YYYY-MM') and status='locked') then raise exception 'Ngày hoặc kỳ đã khóa';end if;
  if p->>'status'='posted' then
   if b.data<>p->'plan'->'book' then raise exception 'Phiếu đã thay đổi; tính lại trước khi duyệt';end if;
   if exists(select 1 from public.review_tracker_finance_books where unit=u and id<>b.id and type=b.type and reference=b.reference and status='posted') then raise exception 'Đã có phiếu cùng mã được ghi sổ';end if;
   if b.type in ('invoice','stay','receivable','payable') and exists(select 1 from public.review_tracker_finance_books where unit=u and id<>b.id and status='posted' and reference=b.reference and type in ('invoice','stay','receivable','payable')) then raise exception 'Mã đối soát công nợ đã được sử dụng';end if;
   if b.type in ('invoice','stay','payroll','allocation') and exists(select 1 from public.review_tracker_finance_entries e where e.unit=u and e.status='posted' and e.entry->>'reference'=b.reference and not e.entry ? 'bookId' and (e.entry->>'kind' in ('revenue','expense') or coalesce((e.entry->>'recognizeExpense')::boolean,false) or b.type='invoice' and (b.data->'data'->>'paid')::numeric>0 and e.entry->>'kind'='receipt' and e.entry->>'category'<>'deposit')) then raise exception 'Đã có khoản ghi sổ cùng mã; đối soát để tránh ghi nhận hai lần';end if;
   if b.type='product' and exists(select 1 from public.review_tracker_finance_books where unit=u and id<>b.id and type='product' and status='posted' and data->'data'->>'sku'=b.data->'data'->>'sku') then raise exception 'Mã hàng đã có trong danh mục';end if;
   if b.type='stocktake' then
    for j in select value from jsonb_array_elements(p->'plan'->'baseline') loop
     select coalesce(sum((entry->'stock'->>'quantity')::numeric*case when entry->'stock'->>'mode' in ('in','opening') then 1 else -1 end),0) into q from public.review_tracker_finance_entries where unit=u and status='posted' and day<=b.day and entry->>'kind'='stock' and entry->'stock'->>'sku'=j->>'sku';
     if abs(q-(j->>'quantity')::numeric)>0.00000001 then raise exception 'Tồn kho đã thay đổi. Tải lại kiểm kê trước khi duyệt';end if;
    end loop;
   end if;
   if b.type='shift' then
    if exists(select 1 from public.review_tracker_finance_books where unit=u and type='shift' and status='posted' and day>b.day) then raise exception 'Có ca ngày sau đã duyệt; mở lại ca mới nhất trước';end if;
    expected:=b.data->'data'->'opening';
    for j in select value from jsonb_array_elements(b.data->'data'->'entryIds') loop
     select * into r from public.review_tracker_finance_entries where unit=u and day=b.day and id=(j#>>'{}')::bigint and status<>'void';
     if r.id is null then raise exception 'Nghiệp vụ ca không hợp lệ';end if;
     if r.entry->>'kind' in ('receipt','payment') then
      for v in select value from jsonb_array_elements(case when jsonb_array_length(coalesce(r.entry->'payments','[]'))>0 then r.entry->'payments' else jsonb_build_array(jsonb_build_object('method',r.entry->>'method','amount',r.entry->'amount')) end) loop
       expected:=jsonb_set(expected,array[v->>'method'],to_jsonb((expected->>(v->>'method'))::numeric+(v->>'amount')::numeric*case when r.entry->>'kind'='receipt' then 1 else -1 end));
      end loop;
     end if;
    end loop;
    if expected<>b.data->'data'->'counted' and length(trim(coalesce(b.data->>'note','')))=0 then raise exception 'Giải trình chênh lệch ca';end if;
    if exists(select 1 from jsonb_array_elements_text(b.data->'data'->'entryIds')i where not exists(select 1 from public.review_tracker_finance_entries where unit=u and day=b.day and status<>'void' and id=i::bigint and entry->>'kind' in ('receipt','payment','deposit_use','stock'))) then raise exception 'Có nghiệp vụ ca không hợp lệ';end if;
    if exists(select 1 from public.review_tracker_finance_books x,jsonb_array_elements_text(x.data->'data'->'entryIds')i where x.unit=u and x.type='shift' and x.status='posted' and i in(select jsonb_array_elements_text(b.data->'data'->'entryIds'))) then raise exception 'Nghiệp vụ đã bàn giao ở ca khác';end if;
    select data->'data'->'counted' into previous from public.review_tracker_finance_books where unit=u and type='shift' and status='posted' and day<=b.day order by day desc,updated_at desc limit 1;
    if previous is not null and previous<>b.data->'data'->'opening' then raise exception 'Tồn đầu ca phải khớp tồn cuối ca đã duyệt gần nhất';end if;
   end if;
   for j in select value from jsonb_array_elements(p->'plan'->'entries') loop
    n:=n+1;j:=j||jsonb_build_object('requestId',md5(b.id::text||':'||n::text)::uuid,'bookId',b.id);
    v:=public.review_tracker_finance_v2(p||jsonb_build_object('action','save','entry',j));
    perform public.review_tracker_finance_v2(p||jsonb_build_object('action','review','id',v->>'id','status','posted'));
    ids:=ids||jsonb_build_array(v->'id');
   end loop;
   if b.type='shift' then
    for j in select value from jsonb_array_elements(b.data->'data'->'entryIds') loop
     select * into r from public.review_tracker_finance_entries where unit=u and id=(j#>>'{}')::bigint;
     if r.status<>'posted' then raise exception 'Duyệt các nghiệp vụ của ca trước khi duyệt bàn giao';end if;
    end loop;
   end if;
  elsif p->>'status'='void' and b.status='posted' then
   if exists(select 1 from public.review_tracker_finance_books x,jsonb_array_elements_text(x.data->'data'->'entryIds')i where x.unit=u and x.type='shift' and x.status='posted' and b.entry_ids @> jsonb_build_array(i::bigint)) then raise exception 'Phiếu đã bàn giao trong ca; hủy bàn giao ca trước';end if;
   if b.type='shift' and exists(select 1 from public.review_tracker_finance_books where unit=u and type='shift' and status='posted' and updated_at>b.updated_at) then raise exception 'Mở lại ca mới nhất trước';end if;
   for j in select value from jsonb_array_elements(b.entry_ids) with ordinality v(value,ord) order by ord desc loop
    perform public.review_tracker_finance_v2(p||jsonb_build_object('action','review','id',j,'status','void'));
   end loop;
  end if;
  update public.review_tracker_finance_books set status=p->>'status',entry_ids=case when p->>'status'='posted' then ids else entry_ids end,reason=p->>'reason',version=version+1,updated_at=now() where id=b.id returning * into b;
 end if;
 for v in select to_jsonb(x) from public.review_tracker_finance_books x where x.unit=u and x.status='posted' and x.type in ('invoice','stay','receivable','payable') loop
  select coalesce(sum((entry->>'amount')::numeric),0) into paid from public.review_tracker_finance_entries where unit=u and status='posted' and entry->>'reference'=v->>'reference' and entry->>'kind'=case when v->>'type'='payable' then 'payment' else 'receipt' end and entry->>'category'<>'deposit';
  if paid<0 or paid>(v->'data'->'data'->>'total')::numeric then raise exception 'Tiền đối soát vượt công nợ phiếu %',v->>'reference';end if;
 end loop;
 insert into public.review_tracker_finance_audit(actor,unit,action,details) values(who,u,a,jsonb_build_object('id',b.id,'type',b.type,'status',b.status,'version',b.version,'reason',p->>'reason','actorName',p->>'actorName'));
 return to_jsonb(b);
end;
$$;
revoke all on function public.review_tracker_finance(jsonb) from public,anon,authenticated;
grant execute on function public.review_tracker_finance(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
