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

-- ===== Section: project-lead-access-boundary =====
-- The directory also identifies installations that enforce explicit client selection.
create or replace function public.project_lead_client_directory()
returns jsonb language sql stable set search_path=public
as $$ select public.project_creation_clients(); $$;
revoke all on function public.project_lead_client_directory() from public,anon;
grant execute on function public.project_lead_client_directory() to authenticated;

create or replace function public.resolve_lead_client(p_lead_id uuid,p_data jsonb)
returns uuid language plpgsql set search_path=public
as $$
declare
  selected_client uuid=nullif(p_data->>'clientId','')::uuid;
  saved_client uuid;
  details jsonb=p_data->'row';
begin
  select client_id into saved_client from public.leads where id=p_lead_id;
  if found then
    if selected_client is not null and selected_client is distinct from saved_client then
      raise exception 'Lead client cannot be reassigned through lead details';
    end if;
    return saved_client;
  end if;
  if selected_client is not null then
    if not exists(select 1 from public.clients where id=selected_client) then
      raise exception 'Selected client does not exist';
    end if;
    return selected_client;
  end if;
  if nullif(btrim(details->>'full_name'),'') is null then return null; end if;
  insert into public.clients(company_name,contact_name,email,phone,website,country,timezone,require_explicit_portal_link)
  values(coalesce(nullif(btrim(details->>'company_name'),''),btrim(details->>'full_name')),
    btrim(details->>'full_name'),nullif(btrim(details->>'email'),''),
    details->>'phone',details->>'company_website',details->>'country',details->>'timezone',true)
  returning id into saved_client;
  return saved_client;
end;
$$;
revoke all on function public.resolve_lead_client(uuid,jsonb) from public,anon,authenticated;

-- Allow account removal to clear the foreign key without permitting implicit grants.
create or replace function public.protect_explicit_client_portal_link()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.require_explicit_portal_link and new.client_user_id is not null then
    if TG_OP='INSERT' then new.client_user_id=null;
    else new.client_user_id=old.client_user_id; end if;
  end if;
  return new;
end;
$$;

-- A portal account linked by an administrator remains protected from subsequent
-- email-based provisioning, including in older application versions.
create or replace function public.link_client_portal_account(p_client_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null or not coalesce(public.is_workspace_admin(),false) then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if not exists(select 1 from public.workspace_members where user_id=p_user_id and role='client') then
    raise exception 'Choose a client portal account';
  end if;
  update public.clients set require_explicit_portal_link=false,client_user_id=p_user_id where id=p_client_id;
  if not found then raise exception 'Client does not exist'; end if;
  update public.clients set require_explicit_portal_link=true where id=p_client_id;
end;
$$;

create or replace function public.sync_project_clients()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  participant jsonb;
  participant_id uuid;
begin
  if TG_OP='INSERT' and new.client_id is null and new.additional_clients='[]'::jsonb then return new; end if;
  if TG_OP='UPDATE' and new.additional_clients is not distinct from old.additional_clients and new.client_id is not distinct from old.client_id then return new; end if;
  if not public.can_manage_workspace() then
    raise exception 'Only project managers and administrators can change project clients' using errcode='42501';
  end if;
  delete from public.project_clients where project_id=new.id;
  if new.client_id is not null then insert into public.project_clients values(new.id,new.client_id); end if;
  for participant in select value from jsonb_array_elements(new.additional_clients) loop
    if jsonb_typeof(participant)<>'object' or coalesce(nullif(btrim(participant->>'name'),''),nullif(btrim(participant->>'companyName'),'')) is null then
      raise exception 'Each project client needs a contact or company name';
    end if;
    participant_id=nullif(participant->>'clientId','')::uuid;
    if participant_id is not null then
      if not exists(select 1 from public.clients where id=participant_id) then
        raise exception 'Selected project client does not exist';
      end if;
      insert into public.project_clients values(new.id,participant_id) on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$;

-- Keep historical contact text. Only an explicitly selected client ID grants access.
delete from public.project_clients pc using public.projects p
where pc.project_id=p.id and pc.client_id is distinct from p.client_id
  and not exists(select 1 from jsonb_array_elements(p.additional_clients) c where c->>'clientId'=pc.client_id::text);

-- Backfill delivery fields once for older projects with a verified common client.
-- Project-authored details take precedence over the legacy enquiry values.
update public.projects p set
  title=case when nullif(btrim(coalesce(p.enquiry_details->>'projectName',l.project_name)),'') is not null
    and (btrim(p.title) ~* '^(untitled project|none|n/a)?$'
      or btrim(p.title) ~* '^(branding|website|e-commerce|ui/ux|crm|custom request|multiple)([[:space:]]*(,|&|[+]|and)[[:space:]]*(branding|website|e-commerce|ui/ux|crm|custom request|multiple))*$'
      or lower(btrim(p.title)) in (lower(btrim(p.client_company)||' Delivery'),lower(btrim(p.client_name)||' Delivery')))
    then btrim(coalesce(p.enquiry_details->>'projectName',l.project_name)) else p.title end,
  operating_company=coalesce(p.operating_company,l.operating_company),
  enquiry_details=jsonb_strip_nulls(jsonb_build_object(
    'projectName',l.project_name,'phone',l.phone,'designation',l.designation,'companyWebsite',l.company_website,
    'country',l.country,'timezone',l.timezone,'industry',l.industry,'description',l.description,
    'referenceLinks',l.reference_links,'urgency',l.urgency
  ))||p.enquiry_details||'{"projectNameOverride":true}'::jsonb,
  revision=p.revision+1
from public.leads l
where l.id=p.lead_id and l.client_id=p.client_id
  and p.enquiry_details->>'projectNameOverride' is distinct from 'true';

do $upgrade$
declare
  definition text;
  old_lines text;
  new_lines text;
begin
  select pg_get_functiondef('public.save_workspace_changes(jsonb,uuid)'::regprocedure) into definition;
  if position('public.resolve_lead_client(root_id,data)' in definition)>0 then return; end if;

  old_lines=$old$client_id_value=public.workspace_client(coalesce(payload->>'company_name',payload->>'full_name'),payload->>'full_name',payload->>'email');$old$;
  if position(old_lines in definition)=0 then raise exception 'Unsupported lead writer'; end if;
  definition=replace(definition,old_lines,'client_id_value=public.resolve_lead_client(root_id,data);');

  old_lines=$old$        else
        select id into lead_id_value from public.leads where external_id=data->>'leadId';
        if nullif(data->>'leadId','') is not null and lead_id_value is null then raise exception 'Linked lead does not exist'; end if;
        select id into proposal_id_value from public.proposals where lead_id=lead_id_value and version=(data->>'proposalVersion')::integer;
        client_id_value=public.resolve_project_client(root_id,data,lead_id_value);
        end if;$old$;
  new_lines=$new$        else
          select lead_id,proposal_id into lead_id_value,proposal_id_value from public.projects where id=root_id;
          if not found then
            select id into lead_id_value from public.leads where external_id=data->>'leadId';
            if nullif(data->>'leadId','') is not null and lead_id_value is null then raise exception 'Linked lead does not exist'; end if;
            if lead_id_value is not null and exists(select 1 from public.projects where lead_id=lead_id_value) then
              raise exception 'This lead already has a project';
            end if;
            select id into proposal_id_value from public.proposals where lead_id=lead_id_value and version=(data->>'proposalVersion')::integer;
          end if;
          client_id_value=public.resolve_project_client(root_id,data,lead_id_value);
        end if;$new$;
  if position(old_lines in definition)=0 then raise exception 'Unsupported project writer'; end if;
  definition=replace(definition,old_lines,new_lines);

  old_lines=$old$select client_id,coalesce(lead_id_value,lead_id) into client_id_value,lead_id_value from public.projects where id=project_id_value;$old$;
  if position(old_lines in definition)=0 then raise exception 'Unsupported invoice writer'; end if;
  definition=replace(definition,old_lines,'select client_id into client_id_value from public.projects where id=project_id_value;');

  old_lines=$old$    if (root_id is not null and (expected is null or expected<>existing_revision))$old$;
  new_lines=$new$    if not public.can_manage_workspace() and collection_name<>'generalTasks'
        and (collection_name<>'projects' or root_id is null or not public.employee_can_access_project(root_id)) then
      raise exception 'Employees can update only their own assigned task progress.' using errcode='42501';
    end if;
    if (root_id is not null and (expected is null or expected<>existing_revision))$new$;
  if position(old_lines in definition)=0 then raise exception 'Unsupported workspace writer'; end if;
  execute replace(definition,old_lines,new_lines);
end;
$upgrade$;

-- Directory selections and legacy contact labels use separate matching rules.
create or replace function public.delete_project_lead_client_profile(
  p_client_id uuid,p_project_ids text[],p_lead_ids text[],p_managed_ids text[],p_name text,p_companies text[],p_email text
)
returns integer language plpgsql security definer set search_path=public
as $$
declare
  project public.projects;
  participants jsonb;
  primary_matches boolean;
  changed integer=0;
  count_changed integer;
begin
  if not public.can_manage_workspace() then
    raise exception 'Only administrators and project managers can delete clients' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  for project in select * from public.projects where external_id=any(p_project_ids) for update loop
    primary_matches=case when p_client_id is not null then p_client_id is not distinct from project.client_id
      else project.client_id is null and public.client_profile_matches(project.client_name,project.client_company,project.client_email,p_name,p_companies,p_email) end;
    select coalesce(jsonb_agg(item order by position),'[]'::jsonb) into participants
    from jsonb_array_elements(project.additional_clients) with ordinality as x(item,position)
    where not coalesce(case when p_client_id is not null then item->>'clientId'=p_client_id::text
      else nullif(item->>'clientId','') is null and public.client_profile_matches(item->>'name',item->>'companyName',item->>'email',p_name,p_companies,p_email) end,false);
    if (primary_matches and project.enquiry_details->>'clientDeleted' is distinct from 'true')
        or participants is distinct from project.additional_clients then
      update public.projects set
        enquiry_details=case when primary_matches then enquiry_details||'{"clientDeleted":true}'::jsonb else enquiry_details end,
        additional_clients=participants,revision=revision+1 where id=project.id;
      changed=changed+1;
    end if;
  end loop;
  update public.leads set qualification=coalesce(qualification,'{}'::jsonb)||'{"clientDeleted":true}'::jsonb,revision=revision+1
  where external_id=any(p_lead_ids) and qualification->>'clientDeleted' is distinct from 'true'
    and case when p_client_id is not null then client_id=p_client_id
      else client_id is null and public.client_profile_matches(full_name,company_name,email,p_name,p_companies,p_email) end;
  get diagnostics count_changed=row_count;
  changed=changed+count_changed;
  update public.managed_projects m set client_details=coalesce(client_details,'{}'::jsonb)||'{"deleted":true}'::jsonb,revision=revision+1
  where external_id=any(p_managed_ids) and client_details->>'deleted' is distinct from 'true'
    and case when p_client_id is not null then exists(select 1 from public.projects p where p.id=m.source_project_id and p.client_id=p_client_id)
      else not exists(select 1 from public.projects p where p.id=m.source_project_id and p.client_id is not null)
        and public.client_profile_matches(client_details->>'name',client_company,client_details->>'email',p_name,p_companies,p_email) end;
  get diagnostics count_changed=row_count;
  if changed+count_changed=0 then raise exception 'The client has changed or is already deleted. Refresh the client list.'; end if;
  return changed+count_changed;
end;
$$;
revoke all on function public.delete_project_lead_client_profile(uuid,text[],text[],text[],text,text[],text) from public,anon;
grant execute on function public.delete_project_lead_client_profile(uuid,text[],text[],text[],text,text[],text) to authenticated;
