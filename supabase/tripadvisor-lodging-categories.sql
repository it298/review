-- Add Tripadvisor's lodging ranking groups without changing existing observations.
-- Run after tripadvisor-ranking.sql and manual-summary.sql. Safe to repeat.
begin;
alter table public.review_tracker_directory_sources drop constraint if exists review_tracker_directory_rank_check;
alter table public.review_tracker_directory_sources add constraint review_tracker_directory_rank_check check(
 (rank_position is null and rank_total is null and rank_category is null and rank_area is null and rank_captured_at is null)
 or (source='tripadvisor' and rank_position is not null and rank_position>=1 and rank_total is not null and rank_total>=rank_position and rank_category is not null and rank_category in ('hotel','restaurant','attraction','b_and_b','specialty_lodging') and rank_area is not null and length(rank_area) between 1 and 160 and rank_captured_at is not null));
alter table public.review_tracker_source_history drop constraint if exists review_tracker_history_rank_check;
alter table public.review_tracker_source_history add constraint review_tracker_history_rank_check check(
 rank_position is null or (rank_position>=1 and rank_total is not null and rank_total>=rank_position and rank_category is not null and rank_category in ('hotel','restaurant','attraction','b_and_b','specialty_lodging') and rank_area is not null and length(rank_area) between 1 and 160 and rank_captured_at is not null));
do $migration$
declare signature text; definition text;
begin
 foreach signature in array array['public.review_tracker_manual_summary_ingest(jsonb)','public.review_tracker_public_summary_ingest(jsonb)'] loop
  if to_regprocedure(signature) is null then raise exception 'Required function missing: %',signature;end if;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  if position('(''hotel'',''restaurant'',''attraction'')' in definition)>0 then
   definition:=replace(definition,'(''hotel'',''restaurant'',''attraction'')','(''hotel'',''restaurant'',''attraction'',''b_and_b'',''specialty_lodging'')');
   execute definition;
  elsif position('''b_and_b''' in definition)=0 or position('''specialty_lodging''' in definition)=0 then
   raise exception 'Unrecognized rank validation in %',signature;
  end if;
 end loop;
end;$migration$;
commit;
