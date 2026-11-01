-- Client portal: expose only associated projects, progress counts and team names.
-- Apply after workspace-reliability-migration.sql and employee-role-access-migration.sql.
begin;

-- Remove direct reads of internal and financial rows for client accounts.
drop policy if exists "clients read their account" on public.clients;
drop policy if exists "clients read their projects" on public.projects;
drop policy if exists "clients read their proposals" on public.proposals;
drop policy if exists "clients read their project work" on public.project_work_items;
drop policy if exists "clients read their project links" on public.project_links;

create or replace function public.read_client_projects()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.current_workspace_role() is distinct from 'client' then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'external_id',p.external_id,'title',p.title,'status',p.status,
      'total_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id),
      'completed_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id and w.status='DONE'),
      'team',coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'role',a.role) order by a.name,a.role) from (
        select coalesce(nullif(trim(t.name),''),nullif(trim(m.display_name),'')) as name,t.role
        from public.project_team_members t left join public.workspace_members m on m.user_id=t.user_id
        where t.project_id=p.id
        union
        select coalesce(nullif(trim(w.assignee_name),''),nullif(trim(m.display_name),'')), 'Task assignee'
        from public.project_work_items w left join public.workspace_members m on m.user_id=w.assignee_user_id
        where w.project_id=p.id and not exists (
          select 1 from public.project_team_members t where t.project_id=p.id and
            ((t.user_id is not null and t.user_id=w.assignee_user_id) or
             (nullif(trim(t.name),'') is not null and lower(trim(t.name))=lower(trim(w.assignee_name))))
        )
      ) a where a.name is not null),'[]'::jsonb)
    ) order by p.created_at desc,p.id)
    from public.projects p
    where exists(select 1 from public.clients c where c.id=p.client_id and c.client_user_id=auth.uid())
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.read_client_projects() from public,anon;
grant execute on function public.read_client_projects() to authenticated;
commit;
