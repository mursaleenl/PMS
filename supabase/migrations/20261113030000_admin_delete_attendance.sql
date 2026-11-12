-- Delete a visit as an admin and keep its audit snapshot and derived daily hours.
create or replace function public.delete_attendance_session(p_session uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare visit public.attendance_sessions; hours numeric;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can delete attendance.'; end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 then raise exception 'Enter a deletion reason (3–2000 characters).'; end if;
 select * into visit from public.attendance_sessions where id=p_session;
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(visit.user_id::text,418210));
 select * into visit from public.attendance_sessions where id=p_session for update;
 if not found then return; end if;
 insert into public.attendance_audit(actor_id,old_record,new_record)
 values(auth.uid(),to_jsonb(visit),jsonb_build_object('action','deleted','id',visit.id,'user_id',visit.user_id,'work_date',visit.work_date,'reason',trim(p_reason)));
 delete from public.attendance_sessions where id=visit.id;
 if exists(select 1 from public.attendance_sessions where user_id=visit.user_id and work_date=visit.work_date) then
  select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=visit.user_id and work_date=visit.work_date and checked_out_at is not null;
  update public.attendance_records set hours_logged=least(round(hours,2),24),updated_at=clock_timestamp()
   where user_id=visit.user_id and work_date=visit.work_date and source='qr';
 else
  delete from public.attendance_records where user_id=visit.user_id and work_date=visit.work_date and source='qr';
 end if;
end; $$;
revoke all on function public.delete_attendance_session(uuid,text) from public,anon,authenticated;
grant execute on function public.delete_attendance_session(uuid,text) to authenticated;

