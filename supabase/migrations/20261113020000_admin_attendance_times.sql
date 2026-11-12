-- Allow administrators to correct arrival and departure with an audited reason.
-- Admin corrections keep the original office date, daily limits and full audit history.
create or replace function public.correct_attendance_session(p_session uuid,p_checkin timestamptz,p_checkout timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare visit public.attendance_sessions; settings public.attendance_settings; hours numeric;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can correct attendance.'; end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 then raise exception 'Enter a correction reason (3–2000 characters).'; end if;
 select * into visit from public.attendance_sessions where id=p_session;
 if not found then raise exception 'Visit not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(visit.user_id::text,418210));
 select * into visit from public.attendance_sessions where id=p_session for update;
 select * into settings from public.attendance_settings where id=true;
 if p_checkin is null or p_checkin>clock_timestamp() or (p_checkin at time zone settings.timezone)::date<>visit.work_date then raise exception 'Arrival must be on the visit date and not in the future.'; end if;
 if visit.checked_out_at is not null and p_checkout is null then raise exception 'Departure is required for a completed visit.'; end if;
 if p_checkout is not null and (p_checkout<p_checkin or p_checkout>clock_timestamp() or (p_checkout at time zone settings.timezone)::date<>visit.work_date) then raise exception 'Departure must be on the visit date, after arrival, and not in the future.'; end if;
 if exists(select 1 from public.attendance_sessions other where other.user_id=visit.user_id and other.id<>visit.id
   and other.checked_in_at<coalesce(p_checkout,'infinity'::timestamptz) and coalesce(other.checked_out_at,'infinity'::timestamptz)>p_checkin)
 then raise exception 'Attendance times overlap another visit.'; end if;
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),to_jsonb(visit),to_jsonb(visit)||jsonb_build_object('checked_in_at',p_checkin,'checked_out_at',p_checkout,'reason',trim(p_reason)));
 update public.attendance_sessions set checked_in_at=p_checkin,checked_out_at=p_checkout where id=visit.id;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=visit.user_id and work_date=visit.work_date and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,notes,source,updated_at) values(visit.user_id,visit.work_date,'PRESENT',least(round(hours,2),24),trim(p_reason),'qr',clock_timestamp())
 on conflict(user_id,work_date) do update set hours_logged=excluded.hours_logged,updated_at=excluded.updated_at where attendance_records.source='qr';
end; $$;
revoke all on function public.correct_attendance_session(uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.correct_attendance_session(uuid,timestamptz,timestamptz,text) to authenticated;

