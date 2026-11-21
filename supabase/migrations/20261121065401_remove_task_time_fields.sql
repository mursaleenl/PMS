-- Generated from supabase/main-database.sql. Review and commit this file.
-- Immutable migration: make later changes in a new migration.

-- ===== Section: migration-locks =====
-- Take the strongest locks first, before RLS/trigger updates can acquire them out of order.
-- NOWAIT prevents waiting for a reader/writer while holding locks that it needs.
do $migration_locks$
declare table_name text;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('workspace-graph-write',0)) then
    raise exception 'Workspace is busy. No schema changes were applied.'
      using errcode='55P03',hint='Wait for workspace saves to finish, then rerun the complete database file.';
  end if;
  begin
  -- The foundation also replaces a trigger on auth.users and creates user foreign keys.
  table_name='auth.users';
  lock table auth.users in access exclusive mode nowait;
  for table_name in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relname=any(array[
      'attendance_audit','attendance_challenges','attendance_records','attendance_sessions',
      'attendance_settings','audit_events','clients','general_tasks',
      'invoice_payment_references','invoices','leads','managed_projects',
      'profiles','project_clients','project_links','project_messages',
      'project_team_members','project_work_items','projects','proposal_events',
      'proposal_follow_ups','proposals','qa_reports','workspace_members',
      'workspace_mutations','workspace_notifications','workspace_number_counters','workspace_records',
      'workspace_reviews'
    ]) order by c.relname
  loop
    execute format('lock table public.%I in access exclusive mode nowait',table_name);
  end loop;
exception when lock_not_available then
  raise exception 'Database update could not lock %. No schema changes were applied.',table_name
    using errcode='55P03',hint='Close workspace and Supabase Table Editor tabs, wait for active requests to finish, then rerun the complete database file.';
  end;
end;
$migration_locks$;

-- ===== Section: remove-task-time-fields =====
-- Keep meaningful historical values outside CRM-accessible relations.
create schema if not exists pms_archive;
revoke all on schema pms_archive from public,anon,authenticated,service_role;
create table if not exists pms_archive.task_time_history (
  task_source text not null check (task_source in ('project','general')),
  task_id uuid not null,
  task_external_id text not null,
  time_values jsonb not null,
  primary key (task_source,task_id)
);
revoke all on table pms_archive.task_time_history from public,anon,authenticated,service_role;

insert into pms_archive.task_time_history(task_source,task_id,task_external_id,time_values)
select 'project',w.id,w.external_id,details.data
from public.project_work_items w
cross join lateral (
  select jsonb_object_agg(key,value) as data
  from jsonb_each(to_jsonb(w)) where key in ('estimated_hours','logged_hours','timer_started_at')
    and value not in ('null'::jsonb,'0'::jsonb,'""'::jsonb,'"0"'::jsonb)
) details
where details.data is not null
on conflict do nothing;

insert into pms_archive.task_time_history(task_source,task_id,task_external_id,time_values)
select 'general',t.id,t.external_id,details.data
from public.general_tasks t
cross join lateral (
  select jsonb_object_agg(key,value) as data
  from jsonb_each(t.task) where key in ('estimatedHours','loggedHours','timerStartedAt')
    and value not in ('null'::jsonb,'0'::jsonb,'""'::jsonb,'"0"'::jsonb)
) details
where details.data is not null
on conflict do nothing;

drop trigger if exists preserve_project_task_time_history on public.project_work_items;
drop function if exists public.preserve_project_task_time_history();
drop trigger if exists preserve_general_task_time_history on public.general_tasks;
drop function if exists public.preserve_general_task_time_history();

-- Ignore obsolete timing keys sent by earlier app builds.
create or replace function public.strip_general_task_time_fields()
returns trigger language plpgsql set search_path=public
as $$
begin
  new.task=new.task-array['estimatedHours','loggedHours','timerStartedAt'];
  return new;
end;
$$;
revoke all on function public.strip_general_task_time_fields() from public,anon,authenticated;
drop trigger if exists strip_general_task_time_fields on public.general_tasks;
create trigger strip_general_task_time_fields before insert or update on public.general_tasks
for each row execute function public.strip_general_task_time_fields();

update public.general_tasks set
  task=task-array['estimatedHours','loggedHours','timerStartedAt'],
  revision=revision+1
where task ?| array['estimatedHours','loggedHours','timerStartedAt'];

do $upgrade$
declare definition text;
begin
  select pg_get_functiondef('public.employee_project_task_update_allowed(uuid,jsonb)'::regprocedure) into definition;
  definition=replace(definition,$old$select value from jsonb_array_elements(p_data->'workItems') loop$old$,
    $new$select value-array['estimated_hours','logged_hours','timer_started_at'] from jsonb_array_elements(p_data->'workItems') loop$new$);
  definition=replace(definition,$old$,'estimated_hours','logged_hours'$old$,'');
  definition=replace(definition,$old$,'timer_started_at','created_at'$old$,$new$,'created_at'$new$);
  definition=replace(definition,$old$      or coalesce((item->>'logged_hours')::numeric,0)<>0
      or coalesce((item->>'estimated_hours')::numeric,0)<0
$old$,'');
  definition=replace(definition,$old$      or nullif(item->>'timer_started_at','') is not null
$old$,'');
  execute definition;

  select pg_get_functiondef('public.employee_existing_task_update_allowed(uuid,jsonb)'::regprocedure) into definition;
  definition=replace(definition,$old$'status','logged_hours','blocker_reason','proof','review_notes','revision_requested','timer_started_at'$old$,
    $new$'status','blocker_reason','proof','review_notes','revision_requested'$new$);
  execute definition;

  select pg_get_functiondef('public.employee_general_task_save_allowed(uuid,jsonb)'::regprocedure) into definition;
  definition=replace(definition,$old$      and coalesce((p_task->>'loggedHours')::numeric,0)=0 and nullif(p_task->>'timerStartedAt','') is null
$old$,'');
  execute definition;

  select pg_get_functiondef('public.assign_qa_report(uuid,text,uuid)'::regprocedure) into definition;
  definition=replace(definition,$old$,'estimatedHours',0,'loggedHours',0$old$,'');
  definition=replace(definition,'priority,estimated_hours,logged_hours,status','priority,status');
  definition=replace(definition,$old$'P3',0,0,'TO_DO'$old$,$new$'P3','TO_DO'$new$);
  execute definition;
end;
$upgrade$;

alter table public.project_work_items
  drop column if exists estimated_hours,
  drop column if exists logged_hours,
  drop column if exists timer_started_at;
