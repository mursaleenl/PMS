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

-- ===== Section: realtime-refresh =====
-- Send only invalidations. Reads still use the app's existing RLS and API checks.
create or replace function public.emit_pms_refresh(p_topic text, p_event text)
returns void language plpgsql security definer set search_path=pg_catalog
as $$
declare
  seen jsonb := coalesce(nullif(current_setting('pms.refresh_signals',true),''),'{}')::jsonb;
  signal_key text := p_topic || '/' || p_event;
begin
  if p_topic is null or seen ? signal_key then return; end if;
  perform set_config('pms.refresh_signals',(seen || jsonb_build_object(signal_key,true))::text,true);
  perform realtime.send('{}'::jsonb,p_event,p_topic,true);
end;
$$;
revoke all on function public.emit_pms_refresh(text,text) from public,anon,authenticated;

create or replace function public.route_pms_refresh()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare
  before_row jsonb;
  after_row jsonb;
  item jsonb;
  target text;
  affected_project_id uuid;
begin
  if TG_OP <> 'INSERT' then before_row := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then after_row := to_jsonb(new); end if;
  if before_row - 'updated_at' is not distinct from after_row - 'updated_at' then return null; end if;

  if TG_TABLE_NAME in ('leads','proposals','proposal_follow_ups','invoices','managed_projects',
      'projects','project_team_members','project_work_items','project_links','general_tasks') then
    perform public.emit_pms_refresh('pms:managers','workspace');
  elsif TG_TABLE_NAME = 'workspace_members' then
    perform public.emit_pms_refresh('pms:admins','members');
  elsif TG_TABLE_NAME = 'workspace_reviews' then
    perform public.emit_pms_refresh('pms:admins','reviews');
  elsif TG_TABLE_NAME = 'invoice_payment_references' then
    perform public.emit_pms_refresh('pms:admins','payments');
  end if;

  -- Use both sides of a write so a reassignment or deletion invalidates old views too.
  foreach item in array array[before_row,after_row] loop
    if item is null then continue; end if;
    if TG_TABLE_NAME in ('projects','project_team_members','project_work_items','project_links') then
      affected_project_id := (case when TG_TABLE_NAME='projects' then item->>'id' else item->>'project_id' end)::uuid;
      for target in
        select t.user_id::text from public.project_team_members t where t.project_id=affected_project_id
        union select w.assignee_user_id::text from public.project_work_items w where w.project_id=affected_project_id
        union select a->>'userId' from public.project_work_items w
          cross join lateral jsonb_array_elements(w.assignees) a where w.project_id=affected_project_id
        union select item->>'user_id' where TG_TABLE_NAME='project_team_members'
        union select item->>'assignee_user_id' where TG_TABLE_NAME='project_work_items'
        union select a->>'userId' from jsonb_array_elements(coalesce(item->'assignees','[]')) a
      loop
        perform public.emit_pms_refresh('pms:user:' || target,'workspace');
      end loop;
    elsif TG_TABLE_NAME = 'general_tasks' then
      for target in
        select item->'task'->>'assigneeId'
        union select a->>'userId' from jsonb_array_elements(
          case when jsonb_typeof(item->'task'->'assignees')='array' then item->'task'->'assignees' else '[]'::jsonb end) a
      loop
        if target ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
          perform public.emit_pms_refresh('pms:user:' || lower(target),'workspace');
        end if;
      end loop;
    end if;

    if TG_TABLE_NAME in ('projects','project_clients','project_work_items') then
      if TG_TABLE_NAME='project_work_items' and TG_OP='UPDATE'
        and (before_row->'title',before_row->'status',before_row->'project_id',before_row->'created_at')
        is not distinct from (after_row->'title',after_row->'status',after_row->'project_id',after_row->'created_at') then
        continue;
      end if;
      affected_project_id := (case when TG_TABLE_NAME='projects' then item->>'id' else item->>'project_id' end)::uuid;
      for target in
        select c.client_user_id from public.project_clients pc join public.clients c on c.id=pc.client_id
          where pc.project_id=affected_project_id and TG_TABLE_NAME<>'project_clients'
        union select c.client_user_id from public.clients c where c.id=(item->>'client_id')::uuid
      loop
        perform public.emit_pms_refresh('pms:user:' || target,'client-projects');
      end loop;
    end if;

    if TG_TABLE_NAME = 'clients' then
      perform public.emit_pms_refresh('pms:user:' || (item->>'client_user_id'),'client-projects');
      perform public.emit_pms_refresh('pms:user:' || (item->>'client_user_id'),'client-records');
      perform public.emit_pms_refresh('pms:user:' || (item->>'client_user_id'),'payments');
    elsif (TG_TABLE_NAME='leads' and (item->>'status' in ('ACCEPTED','CONVERTED') or exists(
          select 1 from public.proposals p where p.lead_id=(item->>'id')::uuid and p.status<>'DRAFT')))
        or (TG_TABLE_NAME='proposals' and item->>'status' in ('SENT','ACCEPTED','DECLINED','CHANGES_REQUESTED','SUPERSEDED'))
        or (TG_TABLE_NAME='invoices' and item->>'status' in ('SENT','CONFIRMED_PAID')) then
      for target in
        select c.client_user_id from public.clients c
        where c.id=(item->>'client_id')::uuid or (item->>'client_id' is null and (
          c.id=(select l.client_id from public.leads l where l.id=(item->>'lead_id')::uuid)
          or c.id=(select p.client_id from public.projects p where p.id=(item->>'project_id')::uuid)))
      loop
        perform public.emit_pms_refresh('pms:user:' || target,'client-records');
      end loop;
    end if;

    case TG_TABLE_NAME
      when 'workspace_notifications' then
        perform public.emit_pms_refresh('pms:user:' || (item->>'recipient_id'),'notifications');
      when 'project_messages' then
        perform public.emit_pms_refresh('pms:conversation:' || (item->>'project_id'),'conversation');
      when 'workspace_reviews' then
        perform public.emit_pms_refresh('pms:user:' || (item->>'reporter_user_id'),'reviews');
      when 'invoice_payment_references' then
        perform public.emit_pms_refresh('pms:user:' || (item->>'submitted_by'),'payments');
      when 'invoices' then
        select r.submitted_by into target from public.invoice_payment_references r where r.invoice_id=(item->>'id')::uuid;
        if found then
          perform public.emit_pms_refresh('pms:user:' || target,'payments');
          perform public.emit_pms_refresh('pms:admins','payments');
        end if;
      when 'workspace_members' then
        target := item->>'user_id';
        if target is null then
          select u.id into target from auth.users u where lower(u.email)=lower(item->>'email') limit 1;
        end if;
        perform public.emit_pms_refresh('pms:user:' || target,'access');
      when 'users' then
        perform public.emit_pms_refresh('pms:user:' || (item->>'id'),'access');
      else null;
    end case;
  end loop;
  return null;
end;
$$;
revoke all on function public.route_pms_refresh() from public,anon,authenticated;

do $realtime$
declare table_name text;
begin
  -- Plain PostgreSQL schema checks can run without the Supabase Realtime extension.
  if to_regclass('realtime.messages') is null then return; end if;

  drop policy if exists "pms receive refresh signals" on realtime.messages;
  create policy "pms receive refresh signals" on realtime.messages for select to authenticated
    using (extension='broadcast' and topic=(select realtime.topic()) and case
      when (select realtime.topic())='pms:managers' then (select public.can_manage_workspace())
      when (select realtime.topic())='pms:admins' then (select public.is_workspace_admin())
      when (select realtime.topic()) ~ '^pms:conversation:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        exists(select 1 from public.projects p where p.id=split_part((select realtime.topic()),':',3)::uuid)
        or public.client_can_access_project(split_part((select realtime.topic()),':',3)::uuid)
      else (select realtime.topic())='pms:user:' || (select auth.uid())::text
    end);

  foreach table_name in array array['leads','proposals','proposal_follow_ups','invoices','managed_projects',
    'projects','project_team_members','project_work_items','project_links','general_tasks','project_clients','clients',
    'workspace_reviews','workspace_members','invoice_payment_references','workspace_notifications','project_messages']
  loop
    execute format('drop trigger if exists pms_refresh on public.%I',table_name);
    execute format('create trigger pms_refresh after insert or update or delete on public.%I
      for each row execute function public.route_pms_refresh()',table_name);
  end loop;

  drop trigger if exists pms_access_refresh on auth.users;
  create trigger pms_access_refresh after update of raw_app_meta_data on auth.users
    for each row when (old.raw_app_meta_data->'access_changed_at' is distinct from new.raw_app_meta_data->'access_changed_at')
    execute function public.route_pms_refresh();
end;
$realtime$;
