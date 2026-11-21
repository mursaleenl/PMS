-- Deploy the existing independent-project-clients SQL before the access-boundary upgrade.

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

-- ===== Section: independent-project-clients =====
-- New client projects use explicit IDs; text edits never change portal ownership.
-- Legacy client-account links are preserved, not rematched or removed.
alter table public.clients add column if not exists require_explicit_portal_link boolean not null default false;

create or replace function public.protect_explicit_client_portal_link()
returns trigger language plpgsql set search_path=public
as $$
begin
  if new.require_explicit_portal_link then
    if TG_OP='INSERT' then new.client_user_id=null;
    else new.client_user_id=old.client_user_id; end if;
  end if;
  return new;
end; $$;
revoke all on function public.protect_explicit_client_portal_link() from public,anon,authenticated;
drop trigger if exists protect_explicit_client_portal_link on public.clients;
create trigger protect_explicit_client_portal_link before insert or update on public.clients
for each row execute function public.protect_explicit_client_portal_link();

-- Explicit administrator action is required to grant a newly created client
-- portal access. Email matching, including older provisioning code, cannot do it.
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
end; $$;
revoke all on function public.link_client_portal_account(uuid,uuid) from public,anon;
grant execute on function public.link_client_portal_account(uuid,uuid) to authenticated;

-- This directory also gates the new form on installations with the safe writer.
create or replace function public.project_creation_clients()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or not coalesce(public.can_manage_workspace(),false) then
    raise exception 'Project creation access required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'clientId',id,'portalLinked',client_user_id is not null,'name',coalesce(contact_name,''),'companyName',company_name,'email',coalesce(email,''),
    'contactDetails',jsonb_build_object('phone',phone,'companyWebsite',website,'country',country,'timezone',timezone)
  ) order by company_name,id) from public.clients),'[]'::jsonb);
end; $$;
revoke all on function public.project_creation_clients() from public,anon;
grant execute on function public.project_creation_clients() to authenticated;

create or replace function public.resolve_project_client(p_project_id uuid,p_data jsonb,p_lead_id uuid)
returns uuid language plpgsql set search_path=public
as $$ declare existing_client uuid; selected_client uuid; lead_client uuid; details jsonb=p_data->'row';
begin
  if auth.uid() is null or not coalesce(public.can_manage_workspace(),false) then
    raise exception 'Project creation access required' using errcode='42501';
  end if;
  selected_client=nullif(p_data->>'clientId','')::uuid;
  select client_id into existing_client from public.projects where id=p_project_id;
  if found then
    if selected_client is not null and selected_client is distinct from existing_client then
      raise exception 'Project client cannot be reassigned through project details';
    end if;
    return existing_client;
  end if;
  if p_lead_id is not null then select client_id into lead_client from public.leads where id=p_lead_id; end if;
  if selected_client is not null then
    if not exists(select 1 from public.clients where id=selected_client) then raise exception 'Selected client does not exist'; end if;
    if p_data->>'clientSelection'='new' then raise exception 'New clients cannot reuse a client ID'; end if;
    if p_lead_id is not null and selected_client is distinct from lead_client then raise exception 'Selected client does not match the originating lead'; end if;
    return selected_client;
  end if;
  if p_lead_id is not null then
    if p_data->>'clientSelection'='new' then raise exception 'New client projects cannot reuse a lead'; end if;
    return lead_client;
  end if;
  if p_data->>'clientSelection' is distinct from 'new' then raise exception 'Select an existing client or create a new client'; end if;
  if nullif(btrim(details->>'client_name'),'') is null then raise exception 'Client name is required'; end if;
  -- A new identity is intentionally separate even when its name/email matches
  -- another client. Granting access requires a later explicit account link.
  insert into public.clients(company_name,contact_name,email,phone,website,country,timezone,require_explicit_portal_link)
  values(coalesce(nullif(btrim(details->>'client_company'),''),btrim(details->>'client_name')),
    btrim(details->>'client_name'),nullif(btrim(details->>'client_email'),''),
    details->'enquiry_details'->>'phone',details->'enquiry_details'->>'companyWebsite',
    details->'enquiry_details'->>'country',details->'enquiry_details'->>'timezone',true)
  returning id into selected_client;
  return selected_client;
end; $$;
revoke all on function public.resolve_project_client(uuid,jsonb,uuid) from public,anon,authenticated;

-- Upgrade only the project relationship resolution. Preserve all installed
-- revision, assignment, idempotency and employee write checks in the graph RPC.
do $$ declare definition text; old_call text; new_call text;
begin
  select pg_get_functiondef('public.save_workspace_changes(jsonb,uuid)'::regprocedure) into definition;
  old_call='client_id_value=public.workspace_client(coalesce(payload->>''client_company'',payload->>''client_name''),payload->>''client_name'',payload->>''client_email'');';
  new_call='client_id_value=public.resolve_project_client(root_id,data,lead_id_value);';
  if position(old_call in definition)>0 then execute replace(definition,old_call,new_call);
  elsif position(new_call in definition)=0 then raise exception 'Project writer is incompatible with the independence update'; end if;
end; $$;
