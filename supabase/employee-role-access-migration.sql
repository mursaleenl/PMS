-- Employee role scope for assigned delivery work and read-only client data.
-- Apply after production-relational-migration.sql and workspace-reliability-migration.sql.
begin;

create or replace function public.employee_can_access_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_workspace_admin() or exists(
    select 1 from public.project_team_members t where t.project_id=p_project_id and t.user_id=auth.uid()
  ) or exists(
    select 1 from public.project_work_items w where w.project_id=p_project_id and w.assignee_user_id=auth.uid()
  );
$$;
revoke all on function public.employee_can_access_project(uuid) from public,anon;
grant execute on function public.employee_can_access_project(uuid) to authenticated;

-- Keep the clients policy from querying projects under their own RLS policies.
-- Project and task assignments are checked inside this definer function instead.
create or replace function public.employee_can_access_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.current_workspace_role() = 'employee' and exists(
    select 1 from public.projects p
    where p.client_id = p_client_id and public.employee_can_access_project(p.id)
  );
$$;
revoke all on function public.employee_can_access_client(uuid) from public,anon;
grant execute on function public.employee_can_access_client(uuid) to authenticated;

-- Resolve existing name-based assignments so employee project/task filtering is identity-based.
update public.project_team_members t set user_id=m.user_id
from public.workspace_members m
where t.user_id is null and m.user_id is not null and m.role='employee'
  and lower(trim(coalesce(t.name,''))) in (lower(trim(coalesce(m.display_name,''))),lower(trim(split_part(m.email,'@',1))));
update public.project_work_items w set assignee_user_id=m.user_id
from public.workspace_members m
where w.assignee_user_id is null and m.user_id is not null and m.role='employee'
  and lower(trim(coalesce(w.assignee_name,''))) in (lower(trim(coalesce(m.display_name,''))),lower(trim(split_part(m.email,'@',1))));

-- Remove the former employee-wide read/write policy from every workspace table.
do $$ declare table_name text;
begin
  foreach table_name in array array['clients','leads','proposals','proposal_follow_ups','proposal_events','projects','project_team_members','project_work_items','project_links','invoices','managed_projects','workspace_records','audit_events'] loop
    execute format('drop policy if exists "internal workspace access" on public.%I',table_name);
  end loop;
end $$;

-- Administrator full access; employees can read client records only.
do $$ declare table_name text;
begin
  foreach table_name in array array['clients','leads','proposals','proposal_follow_ups','proposal_events','invoices'] loop
    execute format('drop policy if exists "workspace administrators manage records" on public.%I',table_name);
    execute format('create policy "workspace administrators manage records" on public.%I for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin())',table_name);
    execute format('drop policy if exists "employees read commercial records" on public.%I',table_name);
  end loop;
  foreach table_name in array array['clients'] loop
    execute format('create policy "employees read commercial records" on public.%I for select to authenticated using (public.employee_can_access_client(id))',table_name);
  end loop;
  foreach table_name in array array['leads','proposals','proposal_follow_ups','proposal_events','invoices'] loop
    execute format('drop policy if exists "employees read commercial records" on public.%I',table_name);
  end loop;
  foreach table_name in array array['managed_projects','workspace_records','audit_events'] loop
    execute format('drop policy if exists "workspace administrators manage records" on public.%I',table_name);
    execute format('create policy "workspace administrators manage records" on public.%I for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin())',table_name);
  end loop;
end $$;

drop policy if exists "workspace administrators manage records" on public.projects;
create policy "workspace administrators manage records" on public.projects for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned projects" on public.projects;
create policy "employees read assigned projects" on public.projects for select to authenticated
  using (public.current_workspace_role()='employee' and public.employee_can_access_project(id));

drop policy if exists "workspace administrators manage records" on public.project_team_members;
create policy "workspace administrators manage records" on public.project_team_members for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned project team" on public.project_team_members;
create policy "employees read assigned project team" on public.project_team_members for select to authenticated
  using (public.current_workspace_role()='employee' and public.employee_can_access_project(project_id));

drop policy if exists "workspace administrators manage records" on public.project_work_items;
create policy "workspace administrators manage records" on public.project_work_items for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned project tasks" on public.project_work_items;
create policy "employees read assigned project tasks" on public.project_work_items for select to authenticated
  using (public.current_workspace_role()='employee' and public.employee_can_access_project(project_id));

drop policy if exists "workspace administrators manage records" on public.project_links;
create policy "workspace administrators manage records" on public.project_links for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned project links" on public.project_links;
create policy "employees read assigned project links" on public.project_links for select to authenticated
  using (public.current_workspace_role()='employee' and public.employee_can_access_project(project_id));

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
