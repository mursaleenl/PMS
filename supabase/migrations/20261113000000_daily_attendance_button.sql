-- Direct attendance button and one visit per office day.
-- Reapply the attendance section to preserve existing QR entry points and policies.
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

-- Included in canonical execution order below. Safe to rerun.
-- Office day boundaries use Asia/Kolkata; change attendance_settings before use.

create table if not exists public.attendance_settings (
 id boolean primary key default true check(id),
 office_name text not null default 'Main office',
 timezone text not null default 'Asia/Kolkata'
);
insert into public.attendance_settings(id) values(true) on conflict do nothing;
alter table public.attendance_settings enable row level security;
drop policy if exists "internal attendance settings" on public.attendance_settings;
create policy "internal attendance settings" on public.attendance_settings for select to authenticated using(public.is_internal_workspace_user());
grant select on public.attendance_settings to authenticated;

-- Tokens are only disclosed by the admin-only issuance function, never by SELECT.
create table if not exists public.attendance_challenges (
 token uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '60 seconds'
);
alter table public.attendance_challenges enable row level security;
revoke all on public.attendance_challenges from public,anon,authenticated;

create table if not exists public.attendance_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 work_date date not null,
 checked_in_at timestamptz not null,
 checked_out_at timestamptz,
 checkin_token uuid not null,
 checkout_token uuid,
 check(checked_out_at is null or checked_out_at>=checked_in_at),
 unique(user_id,checkin_token),unique(user_id,checkout_token)
);
create unique index if not exists attendance_one_open_session on public.attendance_sessions(user_id) where checked_out_at is null;
create index if not exists attendance_sessions_date on public.attendance_sessions(work_date,user_id);
alter table public.attendance_sessions enable row level security;
drop policy if exists "read attendance sessions" on public.attendance_sessions;
create policy "read attendance sessions" on public.attendance_sessions for select to authenticated
 using(public.is_internal_workspace_user() and (user_id=auth.uid() or public.is_workspace_admin()));
revoke all on public.attendance_sessions from public,anon,authenticated;
grant select on public.attendance_sessions to authenticated;

alter table public.attendance_records add column if not exists source text not null default 'manual' check(source in ('manual','qr'));

drop policy if exists "read team attendance" on public.attendance_records;
create policy "read team attendance" on public.attendance_records for select to authenticated
 using(public.is_internal_workspace_user() and (user_id=auth.uid() or public.is_workspace_admin()));
create or replace function public.validate_manual_attendance() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source='manual' and (new.notes is null or length(trim(new.notes))<3 or length(new.notes)>2000)
 then raise exception 'Enter an attendance reason (3–2000 characters).'; end if;
 return new;
end; $$;
drop trigger if exists attendance_manual_reason on public.attendance_records;
create trigger attendance_manual_reason before insert or update on public.attendance_records for each row execute function public.validate_manual_attendance();
revoke all on function public.validate_manual_attendance() from public,anon,authenticated;
create table if not exists public.attendance_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default clock_timestamp(),
 old_record jsonb,new_record jsonb
);
alter table public.attendance_audit enable row level security;
drop policy if exists "admin read attendance audit" on public.attendance_audit;
create policy "admin read attendance audit" on public.attendance_audit for select to authenticated using(public.is_workspace_admin());
revoke all on public.attendance_audit from public,anon,authenticated;
grant select on public.attendance_audit to authenticated;
create or replace function public.audit_attendance_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end; $$;
drop trigger if exists attendance_record_audit on public.attendance_records;
create trigger attendance_record_audit after insert or update or delete on public.attendance_records for each row execute function public.audit_attendance_record();
revoke all on function public.audit_attendance_record() from public,anon,authenticated;

create or replace function public.issue_attendance_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare challenge public.attendance_challenges; settings public.attendance_settings;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can display the office QR.'; end if;
 perform pg_advisory_xact_lock(418209);
 select * into settings from public.attendance_settings where id=true;
 delete from public.attendance_challenges where expires_at<clock_timestamp()-interval '1 day';
 select * into challenge from public.attendance_challenges where expires_at>clock_timestamp()+interval '10 seconds' order by created_at desc limit 1;
 if not found then insert into public.attendance_challenges default values returning * into challenge; end if;
 return jsonb_build_object('token',challenge.token,'expiresAt',challenge.expires_at,'serverTime',clock_timestamp(),'officeName',settings.office_name,'timezone',settings.timezone);
end; $$;

-- Record one daily visit for auth.uid(); the server supplies the date and timestamps.
-- An optional QR token keeps existing scan links working.
create or replace function public.record_attendance(p_action text,p_token uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); visit public.attendance_sessions; settings public.attendance_settings;
 stamp timestamptz; day date; hours numeric;
begin
 if actor is null or not public.is_internal_workspace_user() then raise exception 'Employee workspace access required.'; end if;
 if p_action is null or p_action not in ('check_in','check_out') then raise exception 'Choose check in or check out.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,418210));
 stamp:=clock_timestamp();
 -- Retrying the same explicit action cannot open or close another session.
 select * into visit from public.attendance_sessions where user_id=actor and
  ((p_action='check_in' and checkin_token=p_token) or (p_action='check_out' and checkout_token=p_token));
 if found then return to_jsonb(visit); end if;
 if p_token is not null and not exists(select 1 from public.attendance_challenges where token=p_token and expires_at>stamp) then raise exception 'QR expired. Scan the current office QR and try again.'; end if;

 select * into settings from public.attendance_settings where id=true;
 day:=(stamp at time zone settings.timezone)::date;
 select * into visit from public.attendance_sessions where user_id=actor and checked_out_at is null for update;
 if p_action='check_in' then
  if found then
   if p_token is null and visit.work_date=day then return to_jsonb(visit); end if;
   raise exception 'You already have an open visit. Check out before checking in again.';
  end if;
  if exists(select 1 from public.attendance_sessions where user_id=actor and work_date=day) then raise exception 'You have already checked in and out today.'; end if;
  insert into public.attendance_sessions(user_id,work_date,checked_in_at,checkin_token) values(actor,day,stamp,coalesce(p_token,gen_random_uuid())) returning * into visit;
 else
  if not found then
   if p_token is null then
    select * into visit from public.attendance_sessions where user_id=actor and work_date=day and checked_out_at is not null order by checked_in_at desc limit 1;
    if found then return to_jsonb(visit); end if;
   end if;
   raise exception 'You are not checked in.';
  end if;
  -- A forgotten checkout must be corrected by an admin, never counted as overnight work.
  if visit.work_date<>day then raise exception 'Missing checkout from a previous day. Ask an administrator to close the visit.'; end if;
  update public.attendance_sessions set checked_out_at=stamp,checkout_token=coalesce(p_token,gen_random_uuid()) where id=visit.id returning * into visit;
 end if;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=actor and work_date=day and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,source,updated_at)
 values(actor,day,'PRESENT',least(round(hours,2),24),'qr',stamp)
 on conflict(user_id,work_date) do update set status='PRESENT',hours_logged=excluded.hours_logged,updated_at=stamp
 where attendance_records.source='qr'; -- Preserve deliberate admin corrections.
 return to_jsonb(visit);
end; $$;

-- Existing QR entry point retains token validation and retry receipts.
create or replace function public.scan_attendance(p_token uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_token is null then raise exception 'Scan the current office QR and try again.'; end if;
 return public.record_attendance(p_action,p_token);
end; $$;
revoke all on function public.record_attendance(text,uuid) from public,anon,authenticated;
grant execute on function public.record_attendance(text,uuid) to authenticated;

-- Close a forgotten visit with explicit, audited admin-supplied departure time.
create or replace function public.correct_attendance_checkout(p_session uuid,p_checkout timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare visit public.attendance_sessions; settings public.attendance_settings; hours numeric;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can correct attendance.'; end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 then raise exception 'Enter a correction reason (3–2000 characters).'; end if;
 select * into visit from public.attendance_sessions where id=p_session;
 if not found then raise exception 'Visit not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(visit.user_id::text,418210));
 select * into visit from public.attendance_sessions where id=p_session for update;
 select * into settings from public.attendance_settings where id=true;
 if p_checkout is null or p_checkout<visit.checked_in_at or p_checkout>clock_timestamp() or (p_checkout at time zone settings.timezone)::date<>visit.work_date then raise exception 'Departure must be on the visit date, after arrival, and not in the future.'; end if;
 if exists(select 1 from public.attendance_sessions other where other.user_id=visit.user_id and other.id<>visit.id
   and other.checked_in_at<p_checkout and coalesce(other.checked_out_at,'infinity'::timestamptz)>visit.checked_in_at)
 then raise exception 'Departure overlaps another visit. Choose a time before the next arrival.'; end if;
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),to_jsonb(visit),to_jsonb(visit)||jsonb_build_object('checked_out_at',p_checkout,'reason',trim(p_reason)));
 update public.attendance_sessions set checked_out_at=p_checkout where id=visit.id;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=visit.user_id and work_date=visit.work_date and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,notes,source,updated_at) values(visit.user_id,visit.work_date,'PRESENT',least(round(hours,2),24),trim(p_reason),'qr',clock_timestamp())
 on conflict(user_id,work_date) do update set hours_logged=excluded.hours_logged,updated_at=excluded.updated_at where attendance_records.source='qr';
end; $$;
revoke all on function public.issue_attendance_challenge(),public.scan_attendance(uuid,text),public.correct_attendance_checkout(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.issue_attendance_challenge(),public.scan_attendance(uuid,text),public.correct_attendance_checkout(uuid,timestamptz,text) to authenticated;
