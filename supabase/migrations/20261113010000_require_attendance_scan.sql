-- Require the existing QR scan flow for check-in and checkout.
create or replace function public.record_attendance(p_action text,p_token uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); visit public.attendance_sessions; settings public.attendance_settings;
 stamp timestamptz; day date; hours numeric;
begin
 if actor is null or not public.is_internal_workspace_user() then raise exception 'Employee workspace access required.'; end if;
 if p_action is null or p_action not in ('check_in','check_out') then raise exception 'Choose check in or check out.'; end if;
 if p_token is null then raise exception 'Scan the current office QR to record attendance.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,418210));
 stamp:=clock_timestamp();
 -- Retrying the same explicit action cannot open or close another session.
 select * into visit from public.attendance_sessions where user_id=actor and
  ((p_action='check_in' and checkin_token=p_token) or (p_action='check_out' and checkout_token=p_token));
 if found then return to_jsonb(visit); end if;
 if not exists(select 1 from public.attendance_challenges where token=p_token and expires_at>stamp) then raise exception 'QR expired. Scan the current office QR and try again.'; end if;

 select * into settings from public.attendance_settings where id=true;
 day:=(stamp at time zone settings.timezone)::date;
 select * into visit from public.attendance_sessions where user_id=actor and checked_out_at is null for update;
 if p_action='check_in' then
  if found then raise exception 'You already have an open visit. Check out before checking in again.'; end if;
  if exists(select 1 from public.attendance_sessions where user_id=actor and work_date=day) then raise exception 'You have already checked in and out today.'; end if;
  insert into public.attendance_sessions(user_id,work_date,checked_in_at,checkin_token) values(actor,day,stamp,p_token) returning * into visit;
 else
  if not found then raise exception 'You are not checked in.'; end if;
  -- A forgotten checkout must be corrected by an admin, never counted as overnight work.
  if visit.work_date<>day then raise exception 'Missing checkout from a previous day. Ask an administrator to close the visit.'; end if;
  update public.attendance_sessions set checked_out_at=stamp,checkout_token=p_token where id=visit.id returning * into visit;
 end if;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=actor and work_date=day and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,source,updated_at)
 values(actor,day,'PRESENT',least(round(hours,2),24),'qr',stamp)
 on conflict(user_id,work_date) do update set status='PRESENT',hours_logged=excluded.hours_logged,updated_at=stamp
 where attendance_records.source='qr'; -- Preserve deliberate admin corrections.
 return to_jsonb(visit);
end; $$;

revoke all on function public.record_attendance(text,uuid) from public,anon,authenticated;
