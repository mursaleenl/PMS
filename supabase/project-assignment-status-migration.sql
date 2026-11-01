-- Apply after project-status-migration.sql. Safe to rerun.
begin;
create or replace function public.project_status_after_task_assignment()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (new.assignee_user_id is not null or nullif(trim(new.assignee_name),'') is not null)
    and (tg_op='INSERT' or new.assignee_user_id is distinct from old.assignee_user_id
      or new.assignee_name is distinct from old.assignee_name
      or new.project_id is distinct from old.project_id) then
    update public.projects set status='ON_TRACK' where id=new.project_id and status='ACTIVE';
  end if;
  return new;
end;
$$;
revoke all on function public.project_status_after_task_assignment() from public,anon,authenticated;
drop trigger if exists project_status_after_task_assignment on public.project_work_items;
create trigger project_status_after_task_assignment
  after insert or update of assignee_user_id,assignee_name,project_id on public.project_work_items
  for each row execute function public.project_status_after_task_assignment();

-- Bring existing active projects with assigned work into the same state.
update public.projects p set status='ON_TRACK',revision=revision+1
where p.status='ACTIVE' and exists (
  select 1 from public.project_work_items w where w.project_id=p.id
    and (w.assignee_user_id is not null or nullif(trim(w.assignee_name),'') is not null)
);
commit;
