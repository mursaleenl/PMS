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

-- ===== Section: retire-task-time-tracking =====
-- Retain historical values while preventing new time tracking through older writers.
create or replace function public.preserve_project_task_time_history()
returns trigger language plpgsql set search_path=public
as $$
begin
  if TG_OP='INSERT' then
    new.estimated_hours=0;
    new.logged_hours=0;
    new.timer_started_at=null;
  else
    new.estimated_hours=old.estimated_hours;
    new.logged_hours=old.logged_hours;
    new.timer_started_at=old.timer_started_at;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_project_task_time_history() from public,anon,authenticated;
drop trigger if exists preserve_project_task_time_history on public.project_work_items;
create trigger preserve_project_task_time_history before insert or update on public.project_work_items
for each row execute function public.preserve_project_task_time_history();

create or replace function public.preserve_general_task_time_history()
returns trigger language plpgsql set search_path=public
as $$
declare
  keys text[]=array['estimatedHours','loggedHours','timerStartedAt'];
  history jsonb;
begin
  new.task=new.task-keys;
  if TG_OP='UPDATE' then
    select jsonb_object_agg(key,value) into history from jsonb_each(old.task) where key=any(keys);
    new.task=new.task||coalesce(history,'{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_general_task_time_history() from public,anon,authenticated;
drop trigger if exists preserve_general_task_time_history on public.general_tasks;
create trigger preserve_general_task_time_history before insert or update on public.general_tasks
for each row execute function public.preserve_general_task_time_history();

do $upgrade$
declare definition text;
begin
  select pg_get_functiondef('public.employee_project_task_update_allowed(uuid,jsonb)'::regprocedure) into definition;
  definition=replace(definition,$old$(item->>'logged_hours')::numeric is distinct from 0$old$,$new$coalesce((item->>'logged_hours')::numeric,0)<>0$new$);
  definition=replace(definition,$old$coalesce((item->>'estimated_hours')::numeric,-1)<0$old$,$new$coalesce((item->>'estimated_hours')::numeric,0)<0$new$);
  execute definition;

  select pg_get_functiondef('public.employee_general_task_save_allowed(uuid,jsonb)'::regprocedure) into definition;
  definition=replace(definition,$old$(p_task->>'loggedHours')::numeric=0$old$,$new$coalesce((p_task->>'loggedHours')::numeric,0)=0$new$);
  definition=replace(definition,$old$'status','loggedHours','blockerReason'$old$,$new$'status','estimatedHours','loggedHours','blockerReason'$new$);
  execute definition;

  select pg_get_functiondef('public.validate_general_task()'::regprocedure) into definition;
  definition=replace(definition,$old$    or coalesce((data->>'estimatedHours')::numeric,-1)<0 or coalesce((data->>'loggedHours')::numeric,-1)<0
$old$,'');
  execute definition;

  select pg_get_functiondef('public.read_client_projects()'::regprocedure) into definition;
  definition=replace(definition,$old$,'assumptions',p.assumptions),
      'total_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id),
      'completed_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id and w.status='DONE')
$old$,$new$,'assumptions',p.assumptions)
$new$);
  execute definition;
end;
$upgrade$;
