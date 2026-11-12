-- Admins and project managers are eligible to manage projects.
-- Retain assignments when switching between these eligible workspace roles.
create or replace function public.validate_project_manager_assignment()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'Project Manager' and not exists (
    select 1 from public.workspace_members m
    where m.user_id = new.user_id and m.role in ('admin','project_manager')
  ) then
    raise exception 'Only administrators and users with the Project Manager role can be assigned as project manager';
  end if;
  return new;
end;
$$;

create or replace function public.clear_ineligible_project_manager()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.project_team_members where user_id = old.user_id and role = 'Project Manager';
    return old;
  end if;
  if old.role in ('admin','project_manager') and (new.role not in ('admin','project_manager') or new.user_id is distinct from old.user_id) then
    delete from public.project_team_members where user_id = old.user_id and role = 'Project Manager';
  end if;
  return new;
end;
$$;
