-- Break the clients -> projects -> project_work_items -> clients RLS cycle.
-- Apply after employee-role-access-migration.sql. Safe to rerun.
begin;

create or replace function public.employee_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_workspace_role() = 'employee' and exists (
    select 1
    from public.projects p
    where p.client_id = p_client_id
      and public.employee_can_access_project(p.id)
  );
$$;

revoke all on function public.employee_can_access_client(uuid) from public, anon;
grant execute on function public.employee_can_access_client(uuid) to authenticated;

drop policy if exists "employees read commercial records" on public.clients;
create policy "employees read commercial records" on public.clients
  for select to authenticated
  using (public.employee_can_access_client(id));

-- Message access follows the same project visibility as the delivery workspace.
drop policy if exists "project participants read messages" on public.project_messages;
create policy "project participants read messages" on public.project_messages
  for select to authenticated
  using (exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists "project participants send messages" on public.project_messages;
create policy "project participants send messages" on public.project_messages
  for insert to authenticated
  with check (sender_id=auth.uid() and exists(select 1 from public.projects p where p.id=project_id));

commit;
