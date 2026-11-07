-- PMS main database: the canonical schema, functions, policies, and updates.
-- Run all of this file in Supabase SQL Editor for a new or existing application database.
-- Existing application records are retained; retired lead stages and assigned project
-- statuses are normalized by the corresponding sections. Review custom schema changes
-- before applying to a database maintained outside this repository.
-- Supabase supplies auth.users, auth.uid(), auth.jwt(), and platform roles.
-- Keep sections in dependency order. Generate the empty-testing installer with:
-- node scripts/build-testing-database.cjs
begin;

-- ===== Section: foundation =====
-- VRKSpace Supabase foundation
-- Run once in Supabase SQL Editor. Safe to run again: tables, functions, indexes,
-- and policies are created idempotently.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Identity and three-tier access
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin', 'employee', 'project_manager', 'client')),
  display_name text,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_members drop constraint if exists workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check check (role in ('admin', 'employee', 'project_manager', 'client'));

alter table public.workspace_members add column if not exists must_change_password boolean not null default false;

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

create or replace function public.current_workspace_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.workspace_members where auth.uid() is not null and
  (user_id = auth.uid() or (user_id is null and lower(email) = lower(auth.jwt()->>'email')))
  order by (user_id = auth.uid()) desc nulls last limit 1; $$;

create or replace function public.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_workspace_role() = 'admin',false); $$;

create or replace function public.is_internal_workspace_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_workspace_role() in ('admin', 'employee', 'project_manager'),false); $$;

-- Operational access below administrator; does not grant user/role administration.
create or replace function public.can_manage_workspace()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_workspace_role() in ('admin','project_manager'),false); $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.claim_initial_admin()
returns uuid language plpgsql security definer set search_path = public
as $$ begin raise exception 'Administrator setup requires the server administrator endpoint'; end; $$;
revoke all on function public.claim_initial_admin() from public, anon, authenticated;

create or replace function public.set_workspace_member_role(member_email text, member_role text, member_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
declare target_user_id uuid;
begin
  if not coalesce(public.is_workspace_admin(),false) then raise exception 'Only administrators can manage workspace roles'; end if;
  if member_role not in ('admin', 'employee', 'project_manager', 'client') then raise exception 'Invalid workspace role'; end if;
  select id into target_user_id from auth.users where lower(email) = lower(member_email) limit 1;
  insert into public.workspace_members (user_id, email, role, display_name)
  values (target_user_id, lower(member_email), member_role, member_display_name)
  on conflict (email) do update set user_id = excluded.user_id, role = excluded.role, display_name = excluded.display_name, updated_at = now()
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.clear_password_change_requirement()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  update public.workspace_members
    set must_change_password = false, updated_at = now()
    where user_id = auth.uid()
       or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
end;
$$;

-- -----------------------------------------------------------------------------
-- Clients and lead pipeline
-- -----------------------------------------------------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  country text,
  timezone text,
  client_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  client_id uuid references public.clients(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  full_name text not null,
  designation text,
  company_name text,
  company_website text,
  email text not null,
  phone text,
  country text,
  timezone text,
  services text[] not null default '{}',
  industry text,
  description text,
  reference_links text,
  budget_range text,
  budget_shared boolean not null default false,
  budget_note text,
  urgency text not null default 'Standard' check (urgency in ('Standard', 'Rush')),
  source text,
  acquisition_source text,
  operating_company text check (operating_company in ('Evecture', 'Servn')),
  status text not null default 'NEW' check (status in ('NEW', 'PROPOSAL_SENT', 'ACCEPTED', 'CONVERTED', 'LOST')),
  first_contact_at timestamptz,
  disqualification_reason text,
  qualification jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  acceptance_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_client_id_idx on public.leads(client_id);
create index if not exists leads_email_idx on public.leads(lower(email));

-- Fields retained by the browser-first UI and now stored relationally.
alter table public.leads add column if not exists qualification_note text;
alter table public.leads add column if not exists acceptance_document_name text;
alter table public.leads add column if not exists acceptance_document_data_url text;

-- -----------------------------------------------------------------------------
-- Proposals and client decisions
-- -----------------------------------------------------------------------------

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  version integer not null default 1,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'CHANGES_REQUESTED', 'SUPERSEDED')),
  share_token text unique,
  proposal_title text not null,
  project_title text,
  prepared_by text,
  executive_summary text,
  background text,
  challenge text,
  approach text,
  objectives text,
  scope_included text,
  scope_excluded text,
  deliverables text,
  timeline text,
  quoted_amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  billing_structure text not null default 'Fixed' check (billing_structure in ('Fixed', 'Hourly', 'Retainer')),
  revision_rounds integer not null default 0,
  deposit_percent numeric(5,2) not null default 0 check (deposit_percent between 0 and 100),
  payment_terms text,
  payment_schedule text,
  approval_process text,
  client_requirements text,
  assumptions text,
  software_process_model text,
  process_activities text,
  budget_breakdown text,
  system_architecture text,
  risk_assessment text,
  resources text,
  technical_specifications text,
  timeline_deliverables text,
  conclusion text,
  about_us text,
  how_we_work text,
  recent_work text,
  testimonial text,
  change_request_policy text,
  intellectual_property text,
  warranty_support text,
  cancellation_policy text,
  expiry_date date,
  final_follow_up_date date,
  sent_at timestamptz,
  viewed_at timestamptz,
  responded_at timestamptz,
  response_name text,
  response_note text,
  attachment_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, version)
);

create index if not exists proposals_lead_id_idx on public.proposals(lead_id, version desc);
create index if not exists proposals_status_idx on public.proposals(status);

alter table public.proposals add column if not exists document_name text;
alter table public.proposals add column if not exists document_data_url text;

create table if not exists public.proposal_follow_ups (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  label text not null,
  due_at timestamptz not null,
  logged_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  event_type text not null check (event_type in ('SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CHANGES_REQUESTED')),
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Projects, team, tasks, and post-sale plans
-- -----------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  lead_id uuid references public.leads(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  proposal_id uuid references public.proposals(id) on delete set null,
  title text not null,
  client_company text,
  client_name text,
  client_email text,
  operating_company text check (operating_company in ('Evecture', 'Servn')),
  services text[] not null default '{}',
  classification text not null default 'New Client' check (classification in ('New Client', 'Repeat Client', 'Referral')),
  start_date date,
  billing_structure text not null default 'Fixed' check (billing_structure in ('Fixed', 'Hourly', 'Retainer')),
  contracted_value numeric(14,2) not null default 0,
  currency text not null default 'USD',
  deposit_amount numeric(14,2),
  deposit_status text check (deposit_status in ('CONFIRMED_PAID')),
  scope_included text,
  scope_excluded text,
  assumptions text,
  revision_rounds integer not null default 0,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ON_TRACK', 'COMPLETED', 'AMC')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists logo_data_url text;
alter table public.projects drop constraint if exists projects_logo_check;
alter table public.projects add constraint projects_logo_check check (logo_data_url is null or (length(logo_data_url) <= 700000 and logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
alter table public.projects add column if not exists objectives text;
alter table public.projects add column if not exists deliverables text;
alter table public.projects add column if not exists target_date date;
alter table public.projects add column if not exists priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent'));
alter table public.projects drop constraint if exists projects_target_date_check;
alter table public.projects add constraint projects_target_date_check check (target_date is null or start_date is null or target_date >= start_date);

alter table public.projects add column if not exists project_type text not null default 'client'
  check (project_type in ('client', 'internal'));


create table if not exists public.project_team_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null,
  name text,
  allocation_percent numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.project_work_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('FEATURE_DEV', 'CLIENT_FEEDBACK_TODO', 'QA_BUG')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_name text,
  priority text not null default 'P3' check (priority in ('P1', 'P2', 'P3', 'P4')),
  estimated_hours numeric(8,2) not null default 0,
  logged_hours numeric(8,2) not null default 0,
  status text not null default 'TO_DO' check (status in ('TO_DO', 'IN_PROGRESS', 'BLOCKED', 'UNDER_REVIEW', 'DONE')),
  blocker_reason text,
  proof jsonb not null default '{}'::jsonb,
  review_notes text,
  revision_requested boolean not null default false,
  timer_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects add column if not exists signed_contract_name text;
alter table public.projects add column if not exists signed_contract_data_url text;
alter table public.projects drop constraint if exists internal_projects_no_sales;
alter table public.projects add constraint internal_projects_no_sales check (
  project_type <> 'internal' or (lead_id is null and client_id is null and proposal_id is null
    and client_company is null and client_name is null and client_email is null
    and contracted_value=0 and deposit_amount is null and deposit_status is null
    and signed_contract_name is null and signed_contract_data_url is null and status <> 'AMC')
);
alter table public.project_work_items add column if not exists external_id text;
create unique index if not exists project_work_items_external_id_idx
  on public.project_work_items(project_id, external_id)
  where external_id is not null;

create table if not exists public.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  link_type text not null check (link_type in ('staging', 'repository', 'design', 'other')),
  url text not null,
  unique (project_id, link_type)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  lead_id uuid references public.leads(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  operating_company text check (operating_company in ('Evecture', 'Servn')),
  bill_to text,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  subtotal numeric(14,2) not null default 0,
  gst_enabled boolean not null default false,
  gst_rate numeric(5,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  issue_date date not null default current_date,
  due_date date,
  contract_value numeric(14,2) not null default 0,
  deposit_percent numeric(5,2) not null default 0 check (deposit_percent between 0 and 100),
  deposit_amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  payment_terms text,
  payment_instructions text,
  external_payment_link text,
  status text not null default 'GENERATED' check (status in ('GENERATED', 'SENT', 'CONFIRMED_PAID')),
  sent_at timestamptz,
  transaction_reference text,
  confirmed_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.managed_projects (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  source_project_id uuid references public.projects(id) on delete set null,
  project_title text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_company text,
  model text not null check (model in ('Annual maintenance', 'Continuous retainer', 'Direct-sold software', 'Ad-hoc support')),
  management_amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  billing_cycle text not null check (billing_cycle in ('Monthly', 'Quarterly', 'Annual', 'One-time')),
  period_start date not null,
  period_end date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'ENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Compatibility sync for the current browser-first screens
-- -----------------------------------------------------------------------------

create table if not exists public.workspace_records (
  id uuid primary key default gen_random_uuid(),
  collection text not null check (collection in ('leads', 'projects', 'management', 'postSaleOperations')),
  record_id text not null,
  sort_order integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (collection, record_id)
);

create index if not exists workspace_records_collection_order_idx on public.workspace_records(collection, sort_order);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Updated-at helper
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$ begin new.updated_at = now(); return new; end; $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','workspace_members','clients','leads','proposals','projects','project_work_items','invoices','managed_projects','workspace_records'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', table_name);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute procedure public.touch_updated_at()', table_name);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_follow_ups enable row level security;
alter table public.proposal_events enable row level security;
alter table public.projects enable row level security;
alter table public.project_team_members enable row level security;
alter table public.project_work_items enable row level security;
alter table public.project_links enable row level security;
alter table public.invoices enable row level security;
alter table public.managed_projects enable row level security;
alter table public.workspace_records enable row level security;
alter table public.audit_events enable row level security;

-- Profiles and membership are visible to the signed-in user; only admins can see all members.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_workspace_admin());
drop policy if exists "members read membership" on public.workspace_members;
create policy "members read membership" on public.workspace_members for select to authenticated using (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) or public.is_workspace_admin());

-- Internal data is available only to Administrators and Employees.
do $$
declare table_name text;
begin
  foreach table_name in array array['clients','leads','proposals','proposal_follow_ups','proposal_events','projects','project_team_members','project_work_items','project_links','invoices','managed_projects','workspace_records','audit_events'] loop
    execute format('drop policy if exists "internal workspace access" on public.%I', table_name);
    execute format('create policy "internal workspace access" on public.%I for all to authenticated using (public.is_internal_workspace_user()) with check (public.is_internal_workspace_user())', table_name);
  end loop;
end $$;

-- A Client can only read the records linked to their client account.
drop policy if exists "clients read their account" on public.clients;
create policy "clients read their account" on public.clients for select to authenticated using (client_user_id = auth.uid());
drop policy if exists "clients read their projects" on public.projects;
create policy "clients read their projects" on public.projects for select to authenticated using (client_id in (select id from public.clients where client_user_id = auth.uid()));
drop policy if exists "clients read their proposals" on public.proposals;
create policy "clients read their proposals" on public.proposals for select to authenticated using (client_id in (select id from public.clients where client_user_id = auth.uid()) and status in ('SENT', 'ACCEPTED', 'DECLINED', 'CHANGES_REQUESTED'));
drop policy if exists "clients read their project work" on public.project_work_items;
create policy "clients read their project work" on public.project_work_items for select to authenticated using (project_id in (select id from public.projects where client_id in (select id from public.clients where client_user_id = auth.uid())));
drop policy if exists "clients read their project links" on public.project_links;
create policy "clients read their project links" on public.project_links for select to authenticated using (project_id in (select id from public.projects where client_id in (select id from public.clients where client_user_id = auth.uid())));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on function public.claim_initial_admin() from public,anon,authenticated;
revoke all on function public.set_workspace_member_role(text,text,text) from public,anon;
grant execute on function public.set_workspace_member_role(text, text, text) to authenticated;
grant execute on function public.clear_password_change_requirement() to authenticated;
grant execute on function public.current_workspace_role() to authenticated;

-- ===== Section: workspace-reliability =====
-- Included in canonical execution order below. Safe to rerun.
-- Existing data is preserved. All workspace graph writes use one atomic RPC.

create or replace function public.current_workspace_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.workspace_members where auth.uid() is not null and
  (user_id = auth.uid() or (user_id is null and lower(email) = lower(auth.jwt()->>'email')))
  order by (user_id = auth.uid()) desc nulls last limit 1; $$;

create or replace function public.is_workspace_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_workspace_role()='admin',false); $$;
create or replace function public.is_internal_workspace_user()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_workspace_role() in ('admin','employee','project_manager'),false); $$;
revoke all on function public.set_workspace_member_role(text,text,text) from public,anon;
grant execute on function public.set_workspace_member_role(text,text,text) to authenticated;

create unique index if not exists workspace_members_unique_user_idx on public.workspace_members(user_id) where user_id is not null;
create or replace function public.keep_workspace_admin()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  if old.role='admin' and (tg_op='DELETE' or new.role<>'admin') then
    perform pg_advisory_xact_lock(hashtextextended('workspace-admin-bootstrap',0));
    if not exists(select 1 from public.workspace_members where role='admin' and id<>old.id) then
      raise exception 'The workspace must keep at least one administrator';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists workspace_keep_admin on public.workspace_members;
create trigger workspace_keep_admin before update or delete on public.workspace_members for each row execute function public.keep_workspace_admin();

create or replace function public.claim_initial_admin()
returns uuid language plpgsql security definer set search_path = public
as $$ begin raise exception 'Administrator setup requires the server administrator endpoint'; end; $$;
revoke all on function public.claim_initial_admin() from public, anon, authenticated;

-- Only the server may bootstrap, after checking its configured admin email.
create or replace function public.bootstrap_workspace_admin(p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public
as $$ declare result uuid; account_email text;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-admin-bootstrap',0));
  if exists(select 1 from public.workspace_members where role = 'admin') then raise exception 'An administrator already exists'; end if;
  select lower(email) into account_email from auth.users where id=p_user_id and email_confirmed_at is not null;
  if account_email is null then raise exception 'Verified account required'; end if;
  insert into public.workspace_members(user_id,email,role) values(p_user_id,account_email,'admin')
    on conflict(email) do update set role='admin',user_id=excluded.user_id returning id into result;
  return result;
end; $$;
revoke all on function public.bootstrap_workspace_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_workspace_admin(uuid) to service_role;

alter table public.leads add column if not exists revision bigint not null default 0;
alter table public.projects add column if not exists revision bigint not null default 0;
alter table public.managed_projects add column if not exists revision bigint not null default 0;
alter table public.invoices add column if not exists revision bigint not null default 0;
alter table public.invoices add column if not exists client_name text;
alter table public.invoices add column if not exists client_email text;
update public.leads set external_id=id::text where external_id is null;
update public.projects set external_id=id::text where external_id is null;
update public.managed_projects set external_id=id::text where external_id is null;
update public.project_work_items set external_id=id::text where external_id is null;
-- Classify legacy deposits only once; rerunning must not reclassify new invoices.
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='is_deposit') then
    alter table public.invoices add column is_deposit boolean not null default false;
    update public.invoices i set is_deposit=true where i.deposit_amount>0 and (
      (i.deposit_percent>0 and i.deposit_percent<100)
      or (i.lead_id is not null and i.project_id is null and not exists(select 1 from public.invoices earlier where earlier.lead_id=i.lead_id and earlier.created_at<i.created_at))
      or (i.project_id is not null and exists(select 1 from public.projects p where p.id=i.project_id and p.deposit_amount=i.deposit_amount)
        and not exists(select 1 from public.invoices earlier where earlier.project_id=i.project_id and earlier.created_at<i.created_at))
    );
  end if;
end; $$;
update public.clients c set client_user_id=u.id from auth.users u
  where c.client_user_id is null and lower(c.email)=lower(u.email) and u.email_confirmed_at is not null;
update public.proposals p set client_id=l.client_id from public.leads l where p.lead_id=l.id and p.client_id is null and l.client_id is not null;

create table if not exists public.workspace_number_counters (counter_key text primary key, last_value bigint not null);
alter table public.workspace_number_counters enable row level security;
revoke all on public.workspace_number_counters from anon, authenticated;
create or replace function public.reserve_workspace_number(p_kind text,p_company text default 'Evecture')
returns text language plpgsql security definer set search_path = public
as $$ declare prefix text; max_existing bigint; allocated bigint; counter text; yr text=extract(year from current_date)::text;
begin
  if not coalesce(public.is_internal_workspace_user(),false) then raise exception 'Workspace membership required'; end if;
  if p_kind not in ('project','invoice','retainer') or p_company not in ('Evecture','Servn') then raise exception 'Invalid number request'; end if;
  prefix := case when p_kind='project' then 'EVE-'||yr||'-' when p_kind='retainer' then 'RET-'||yr||'-' else (case when p_company='Servn' then 'SER' else 'EVE' end)||'-INV-'||yr||'-' end;
  counter := p_kind||':'||prefix;
  perform pg_advisory_xact_lock(hashtextextended(counter,0));
  if p_kind='project' then
    select coalesce(max(substring(external_id from length(prefix)+1)::bigint),0) into max_existing from public.projects where external_id ~ ('^'||prefix||'[0-9]+$');
  elsif p_kind='retainer' then
    select coalesce(max(substring(external_id from length(prefix)+1)::bigint),0) into max_existing from public.managed_projects where external_id ~ ('^'||prefix||'[0-9]+$');
  else
    select coalesce(max(substring(invoice_number from length(prefix)+1)::bigint),0) into max_existing from public.invoices where invoice_number ~ ('^'||prefix||'[0-9]+$');
  end if;
  insert into public.workspace_number_counters values(counter,max_existing+1)
    on conflict(counter_key) do update set last_value=greatest(workspace_number_counters.last_value,max_existing)+1 returning last_value into allocated;
  return prefix||lpad(allocated::text,greatest(3,length(allocated::text)),'0');
end; $$;
revoke all on function public.reserve_workspace_number(text,text) from public, anon;
grant execute on function public.reserve_workspace_number(text,text) to authenticated;

-- Internal helper: preserves defaults on insert and immutable identifiers on update.
create or replace function public.workspace_upsert_row(p_table text,p_row jsonb,p_conflict text default 'id')
returns uuid language plpgsql set search_path = public
as $$ declare cols text; vals text; updates text; result uuid;
begin
  if p_table not in ('clients','leads','projects','proposals','proposal_follow_ups','project_team_members','project_work_items','project_links','managed_projects','invoices') then raise exception 'Invalid table'; end if;
  select string_agg(format('%I',key),',' order by key), string_agg(format('r.%I',key),',' order by key),
    string_agg(format('%I=excluded.%I',key,key),',' order by key) filter(where key not in ('id','created_at','created_by'))
    into cols,vals,updates from jsonb_object_keys(p_row) key
    where exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p_table and c.column_name=key);
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict (%s) do update set %s returning id',p_table,cols,vals,p_table,p_conflict,updates) using p_row into result;
  return result;
end; $$;
revoke all on function public.workspace_upsert_row(text,jsonb,text) from public, anon, authenticated;

create or replace function public.workspace_client(p_company text,p_name text,p_email text)
returns uuid language plpgsql set search_path = public
as $$ declare result uuid; account uuid;
begin
  select id into account from auth.users where lower(email)=lower(p_email) and email_confirmed_at is not null limit 1;
  select id into result from public.clients where lower(company_name)=lower(p_company) and lower(coalesce(email,''))=lower(coalesce(p_email,'')) order by created_at limit 1;
  if result is null then
    insert into public.clients(company_name,contact_name,email,client_user_id) values(coalesce(nullif(p_company,''),p_name,'Client'),p_name,p_email,account) returning id into result;
  else
    update public.clients set contact_name=coalesce(nullif(p_name,''),contact_name), client_user_id=coalesce(client_user_id,account) where id=result;
  end if;
  return result;
end; $$;
revoke all on function public.workspace_client(text,text,text) from public, anon, authenticated;

create table if not exists public.workspace_mutations (
  request_id uuid primary key, actor_id uuid not null references auth.users(id) on delete cascade,
  payload_hash text not null, result jsonb not null, created_at timestamptz not null default now()
);
create index if not exists workspace_mutations_created_idx on public.workspace_mutations(created_at);
alter table public.workspace_mutations enable row level security;
revoke all on public.workspace_mutations from anon,authenticated;

create or replace function public.employee_project_task_update_allowed(p_project_id uuid, p_data jsonb)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare existing_row jsonb; item jsonb; old_item jsonb; field_name text; row_id uuid; mutable_field boolean;
  current_lead_external text; current_lead_internal uuid;
begin
  if jsonb_typeof(p_data->'row') <> 'object' then return false; end if;
  select to_jsonb(p) into existing_row from public.projects p where p.id=p_project_id;
  if existing_row is null then return false; end if;
  select l.external_id,p.lead_id into current_lead_external,current_lead_internal from public.projects p left join public.leads l on l.id=p.lead_id where p.id=p_project_id;
  if coalesce(p_data->>'leadId','') not in (coalesce(current_lead_external,''),coalesce(current_lead_internal::text,'')) then return false; end if;
  for field_name in select jsonb_object_keys(p_data->'row') loop
    if field_name='created_at' then
      if (p_data->'row'->>field_name)::timestamptz is distinct from (existing_row->>field_name)::timestamptz then return false; end if;
    elsif field_name in ('logo_data_url','objectives','deliverables','target_date','client_company','client_name','client_email','operating_company','start_date','scope_included','scope_excluded','assumptions','signed_contract_name','signed_contract_data_url') then
      if nullif(p_data->'row'->>field_name,'') is distinct from nullif(existing_row->>field_name,'') then return false; end if;
    elsif (p_data->'row'->field_name) is distinct from (existing_row->field_name) then return false; end if;
  end loop;
  if jsonb_array_length(coalesce(p_data->'team','[]'::jsonb)) <> (select count(*) from public.project_team_members where project_id=p_project_id)
    or (select count(*) from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb)) where value->>'link_type'<>'staging') <> (select count(*) from public.project_links where project_id=p_project_id and link_type<>'staging')
    or (select count(*) from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb)) where value->>'link_type'='staging') > 1
    or jsonb_array_length(coalesce(p_data->'workItems','[]'::jsonb)) <> (select count(*) from public.project_work_items where project_id=p_project_id)
    or (select count(distinct value) from jsonb_array_elements(coalesce(p_data->'team','[]'::jsonb))) <> jsonb_array_length(coalesce(p_data->'team','[]'::jsonb))
    or (select count(distinct value->>'link_type') from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb))) <> jsonb_array_length(coalesce(p_data->'links','[]'::jsonb))
    or (select count(distinct value->>'external_id') from jsonb_array_elements(coalesce(p_data->'workItems','[]'::jsonb))) <> jsonb_array_length(coalesce(p_data->'workItems','[]'::jsonb)) then return false; end if;
  for item in select value from jsonb_array_elements(coalesce(p_data->'team','[]'::jsonb)) loop
    if not exists(select 1 from public.project_team_members t where t.project_id=p_project_id and t.role=item->>'role'
      and nullif(t.name,'') is not distinct from nullif(item->>'name','')
      and t.user_id is not distinct from nullif(item->>'user_id','')::uuid
      and t.allocation_percent is not distinct from (item->>'allocation_percent')::numeric) then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_data->'links','[]'::jsonb)) loop
    if item->>'link_type'='staging' then
      if nullif(item->>'url','') is null or item->>'url' !~* '^https?://' then return false; end if;
    elsif not exists(select 1 from public.project_links l where l.project_id=p_project_id and l.link_type=item->>'link_type' and l.url=item->>'url') then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_data->'workItems','[]'::jsonb)) loop
    select to_jsonb(w),w.id into old_item,row_id from public.project_work_items w where w.project_id=p_project_id and w.external_id=item->>'external_id';
    if old_item is null then return false; end if;
    for field_name in select jsonb_object_keys(item) loop
      mutable_field := field_name in ('status','logged_hours','blocker_reason','proof','review_notes','revision_requested','timer_started_at');
      if mutable_field and (select assignee_user_id from public.project_work_items where id=row_id) = auth.uid() then
        continue;
      end if;
      if field_name='created_at' then
        if (item->>field_name)::timestamptz is distinct from (old_item->>field_name)::timestamptz then return false; end if;
      elsif field_name='assignee_name' then
        if nullif(item->>field_name,'') is distinct from nullif(old_item->>field_name,'') then return false; end if;
      elsif (item->field_name) is distinct from (old_item->field_name) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function public.employee_project_task_update_allowed(uuid,jsonb) from public,anon,authenticated;

drop function if exists public.save_workspace_changes(jsonb);
create or replace function public.save_workspace_changes(p_changes jsonb, p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path = public
as $$ declare
  change jsonb; data jsonb; payload jsonb; item jsonb; child jsonb; root_id uuid; child_id uuid; proposal_id_value uuid;
  client_id_value uuid; lead_id_value uuid; project_id_value uuid; existing_revision bigint; expected bigint;
  table_name text; key_name text; collection_name text; external_key text; kept uuid[]; follow_kept uuid[];
  output jsonb='{}'::jsonb; replay public.workspace_mutations;
begin
  if not coalesce(public.is_internal_workspace_user(),false) then raise exception 'Workspace membership required'; end if;
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>1000 then raise exception 'Invalid change batch'; end if;
  -- One graph operation at a time; row revisions reject stale sessions rather than overwriting them.
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into replay from public.workspace_mutations where request_id=p_request_id;
  if found then
    if replay.actor_id<>auth.uid() or replay.payload_hash<>md5(p_changes::text) then raise exception 'Invalid save request identifier'; end if;
    return replay.result;
  end if;

  for change in select value from jsonb_array_elements(p_changes) order by case value->>'collection' when 'leads' then 1 when 'projects' then 2 when 'management' then 3 when 'invoices' then 4 else 5 end loop
    collection_name=change->>'collection'; external_key=change->>'id';
    table_name=case collection_name when 'leads' then 'leads' when 'projects' then 'projects' when 'management' then 'managed_projects' when 'invoices' then 'invoices' end;
    if table_name is null or external_key is null then raise exception 'Invalid collection or record'; end if;
    key_name=case when collection_name='invoices' then 'invoice_number' else 'external_id' end;
    expected=(change->>'expectedRevision')::bigint;
    root_id=null; existing_revision=null;
    execute format('select id,revision from public.%I where %I=$1 for update',table_name,key_name) using external_key into root_id,existing_revision;
    if (root_id is not null and (expected is null or expected<>existing_revision)) or (root_id is null and expected is not null) then
      raise exception 'CONFLICT: % was changed or deleted in another session. Reload the latest data.',external_key using errcode='40001';
    end if;
    if not public.can_manage_workspace() then
      if collection_name<>'projects' or change->>'operation'<>'save' or root_id is null
        or not exists(select 1 from public.projects p where p.id=root_id and (
          exists(select 1 from public.project_team_members t where t.project_id=p.id and t.user_id=auth.uid())
          or exists(select 1 from public.project_work_items w where w.project_id=p.id and w.assignee_user_id=auth.uid())
        )) or not public.employee_project_task_update_allowed(root_id,change->'data') then
        raise exception 'Employees can update only their own assigned task progress.';
      end if;
    end if;
    if change->>'operation'='delete' then
      if collection_name='projects' and not public.can_manage_workspace() then raise exception 'Only administrators can delete projects'; end if;
      execute format('delete from public.%I where id=$1',table_name) using root_id;
      output=output||jsonb_build_object(collection_name||':'||external_key,-1);
      continue;
    end if;
    if change->>'operation'<>'save' then raise exception 'Invalid operation'; end if;
    data=change->'data'; payload=(data->'row')-'id'-'revision'-'created_by';
    root_id=coalesce(root_id,gen_random_uuid());
    payload=payload||jsonb_build_object('id',root_id,key_name,external_key,'revision',coalesce(existing_revision,-1)+1);
    if collection_name='leads' then
      client_id_value=public.workspace_client(coalesce(payload->>'company_name',payload->>'full_name'),payload->>'full_name',payload->>'email');
      payload=payload||jsonb_build_object('client_id',client_id_value,'created_by',auth.uid());
    elsif collection_name='projects' then
      if public.can_manage_workspace() then
        if payload->>'project_type' = 'internal' then
          if nullif(data->>'leadId','') is not null then raise exception 'Internal projects cannot be linked to leads'; end if;
          lead_id_value=null; proposal_id_value=null; client_id_value=null;
        else
        select id into lead_id_value from public.leads where external_id=data->>'leadId';
        if nullif(data->>'leadId','') is not null and lead_id_value is null then raise exception 'Linked lead does not exist'; end if;
        select id into proposal_id_value from public.proposals where lead_id=lead_id_value and version=(data->>'proposalVersion')::integer;
        client_id_value=public.workspace_client(coalesce(payload->>'client_company',payload->>'client_name'),payload->>'client_name',payload->>'client_email');
        end if;
      else
        select lead_id,proposal_id,client_id into lead_id_value,proposal_id_value,client_id_value from public.projects where id=root_id;
      end if;
      payload=(payload-'deposit_amount'-'deposit_status')||jsonb_build_object('lead_id',lead_id_value,'proposal_id',proposal_id_value,'client_id',client_id_value);
    elsif collection_name='management' then
      select id into project_id_value from public.projects where external_id=data->>'sourceProjectId';
      if nullif(data->>'sourceProjectId','') is not null and project_id_value is null then raise exception 'Linked project does not exist'; end if;
      payload=payload||jsonb_build_object('source_project_id',project_id_value);
    elsif collection_name='invoices' then
      select id into lead_id_value from public.leads where external_id=data->>'leadId';
      select id into project_id_value from public.projects where external_id=data->>'projectId';
      if (nullif(data->>'leadId','') is not null and lead_id_value is null) or (nullif(data->>'projectId','') is not null and project_id_value is null) then raise exception 'Linked invoice account does not exist'; end if;
      if (payload->>'total')::numeric < 0 or (payload->>'gst_rate')::numeric not between 0 and 100 or (payload->>'quantity')::numeric<=0
        or (payload->>'unit_price')::numeric<0
        or round((payload->>'quantity')::numeric*(payload->>'unit_price')::numeric,2)<>(payload->>'subtotal')::numeric
        or (payload->>'gst_amount')::numeric<>(case when (payload->>'gst_enabled')::boolean then round((payload->>'subtotal')::numeric*(payload->>'gst_rate')::numeric/100,2) else 0 end)
        or (payload->>'total')::numeric<>round((payload->>'subtotal')::numeric+(payload->>'gst_amount')::numeric,2)
        or (payload->>'due_date')::date<(payload->>'issue_date')::date
      then raise exception 'Invalid invoice amounts, tax or dates'; end if;
      if project_id_value is not null then
        if (payload->>'is_deposit')::boolean and exists(select 1 from public.projects where id=project_id_value and currency is distinct from payload->>'currency') then raise exception 'Deposit currency must match the project'; end if;
        if lead_id_value is not null and exists(select 1 from public.projects where id=project_id_value and lead_id is distinct from lead_id_value) then raise exception 'Invoice lead must match its project'; end if;
        select client_id,coalesce(lead_id_value,lead_id) into client_id_value,lead_id_value from public.projects where id=project_id_value;
      elsif lead_id_value is not null then select client_id into client_id_value from public.leads where id=lead_id_value;
      else client_id_value=public.workspace_client(payload->>'bill_to',payload->>'client_name',payload->>'client_email'); end if;
      payload=payload||jsonb_build_object('lead_id',lead_id_value,'project_id',project_id_value,'client_id',client_id_value);
    end if;
    perform public.workspace_upsert_row(table_name,payload,key_name);
    output=output||jsonb_build_object(collection_name||':'||external_key,coalesce(existing_revision,-1)+1);

    if collection_name='leads' then
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'proposals','[]')) loop
        select id into child_id from public.proposals where lead_id=root_id and version=(item->'row'->>'version')::integer;
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('proposals',((item->'row')-'id')||jsonb_build_object('id',child_id,'lead_id',root_id,'client_id',client_id_value));
        follow_kept='{}';
        for child in select value from jsonb_array_elements(coalesce(item->'followUps','[]')) loop
          select id into proposal_id_value from public.proposal_follow_ups where proposal_id=child_id and label=child->>'label' limit 1;
          proposal_id_value=coalesce(proposal_id_value,gen_random_uuid()); follow_kept=array_append(follow_kept,proposal_id_value);
          perform public.workspace_upsert_row('proposal_follow_ups',child||jsonb_build_object('id',proposal_id_value,'proposal_id',child_id));
        end loop;
        delete from public.proposal_follow_ups where proposal_id=child_id and not(id=any(follow_kept));
      end loop;
      delete from public.proposals where lead_id=root_id and not(id=any(kept));
    elsif collection_name='projects' then
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'team','[]')) loop
        select id into child_id from public.project_team_members where project_id=root_id and role=item->>'role' and name is not distinct from item->>'name' limit 1;
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('project_team_members',item||jsonb_build_object('id',child_id,'project_id',root_id));
      end loop;
      delete from public.project_team_members where project_id=root_id and not(id=any(kept));
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'workItems','[]')) loop
        select id into child_id from public.project_work_items where project_id=root_id and external_id=item->>'external_id';
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('project_work_items',item||jsonb_build_object('id',child_id,'project_id',root_id));
      end loop;
      delete from public.project_work_items where project_id=root_id and not(id=any(kept));
      kept='{}';
      for item in select value from jsonb_array_elements(coalesce(data->'links','[]')) loop
        if item->>'url' !~* '^https?://' then raise exception 'Project links must use http or https'; end if;
        select id into child_id from public.project_links where project_id=root_id and link_type=item->>'link_type';
        child_id=coalesce(child_id,gen_random_uuid()); kept=array_append(kept,child_id);
        perform public.workspace_upsert_row('project_links',item||jsonb_build_object('id',child_id,'project_id',root_id));
      end loop;
      delete from public.project_links where project_id=root_id and not(id=any(kept));
    end if;
  end loop;
  insert into public.workspace_mutations(request_id,actor_id,payload_hash,result) values(p_request_id,auth.uid(),md5(p_changes::text),output);
  delete from public.workspace_mutations where created_at<now()-interval '30 days';
  return output;
end; $$;
revoke all on function public.save_workspace_changes(jsonb,uuid) from public, anon;
grant execute on function public.save_workspace_changes(jsonb,uuid) to authenticated;
-- Block direct graph writes, which would bypass revision checks and transactions.
revoke insert,update,delete on public.clients,public.leads,public.proposals,public.proposal_follow_ups,public.proposal_events,public.projects,public.project_team_members,public.project_work_items,public.project_links,public.managed_projects,public.invoices from authenticated;

-- Token possession grants access only to this proposal's public fields.
create or replace function public.read_shared_proposal(p_token text)
returns jsonb language plpgsql security definer set search_path = public
as $$ declare proposal public.proposals; lead public.leads;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into proposal from public.proposals where share_token=p_token and status in ('SENT','ACCEPTED','DECLINED','CHANGES_REQUESTED');
  if not found then raise exception 'Proposal unavailable'; end if;
  select * into lead from public.leads where id=proposal.lead_id;
  if proposal.status='SENT' and proposal.viewed_at is null then
    update public.proposals set viewed_at=now() where id=proposal.id returning * into proposal;
    update public.leads set revision=revision+1 where id=lead.id;
  end if;
  return jsonb_build_object('proposal',to_jsonb(proposal)-'created_by'-'client_id'-'attachment_path',
    'lead',jsonb_build_object('id',lead.external_id,'fullName',lead.full_name,'companyName',lead.company_name,'description',null,'email',null,'phone',null));
end; $$;
create or replace function public.respond_shared_proposal(p_token text,p_response text,p_name text,p_note text)
returns void language plpgsql security definer set search_path = public
as $$ declare proposal public.proposals;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into proposal from public.proposals where share_token=p_token for update;
  if not found or proposal.status<>'SENT' then raise exception 'This proposal is no longer open for responses'; end if;
  if p_response not in ('ACCEPTED','DECLINED','CHANGES_REQUESTED') then raise exception 'Invalid response'; end if;
  if proposal.expiry_date < (now() at time zone 'UTC')::date then raise exception 'This proposal has expired. Request an updated version.'; end if;
  if (p_response='ACCEPTED' and length(trim(coalesce(p_name,'')))=0) or (p_response<>'ACCEPTED' and length(trim(coalesce(p_note,'')))=0) then raise exception 'Response details are required'; end if;
  if length(coalesce(p_name,''))>200 or length(coalesce(p_note,''))>10000 then raise exception 'Response is too long'; end if;
  update public.proposals set status=p_response,responded_at=now(),response_name=nullif(trim(p_name),''),response_note=nullif(trim(p_note),'') where id=proposal.id;
  update public.leads set status=case p_response when 'ACCEPTED' then 'ACCEPTED' when 'DECLINED' then 'LOST' else 'PROPOSAL_SENT' end,
    accepted_at=case when p_response='ACCEPTED' then now() else accepted_at end,
    acceptance_name=case when p_response='ACCEPTED' then trim(p_name) else acceptance_name end,
    disqualification_reason=case when p_response='DECLINED' then 'Client declined: '||trim(p_note) else disqualification_reason end,revision=revision+1 where id=proposal.lead_id;
  insert into public.proposal_events(proposal_id,event_type,note) values(proposal.id,p_response,concat_ws(': ',nullif(p_name,''),nullif(p_note,''))); 
end; $$;
revoke all on function public.read_shared_proposal(text),public.respond_shared_proposal(text,text,text,text) from public,anon,authenticated;
grant execute on function public.read_shared_proposal(text),public.respond_shared_proposal(text,text,text,text) to service_role;

drop policy if exists "clients read their account" on public.clients;
create policy "clients read their account" on public.clients for select to authenticated using(public.current_workspace_role()='client' and client_user_id=auth.uid());
-- Real attendance records: no generated attendance or fabricated hours.
create table if not exists public.attendance_records(
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default current_date,status text not null check(status in ('PRESENT','REMOTE','HALF_DAY','ON_LEAVE','ABSENT')),
  hours_logged numeric(5,2) not null default 0 check(hours_logged between 0 and 24),notes text,
  updated_at timestamptz not null default now(),unique(user_id,work_date)
);
alter table public.attendance_records enable row level security;
drop policy if exists "read team attendance" on public.attendance_records;
create policy "read team attendance" on public.attendance_records for select to authenticated using(public.is_internal_workspace_user());
drop policy if exists "admin manage attendance" on public.attendance_records;
create policy "admin manage attendance" on public.attendance_records for all to authenticated using(public.is_workspace_admin()) with check(public.is_workspace_admin());
grant select,insert,update,delete on public.attendance_records to authenticated;
create table if not exists public.project_messages(
  id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
  sender_id uuid not null references auth.users(id),sender_name text not null,body text not null check(length(trim(body)) between 1 and 5000),created_at timestamptz not null default now()
);
create index if not exists project_messages_project_idx on public.project_messages(project_id,created_at);
alter table public.project_messages enable row level security;
drop policy if exists "project participants read messages" on public.project_messages;
create policy "project participants read messages" on public.project_messages for select to authenticated using (
  public.is_internal_workspace_user() or project_id in(select p.id from public.projects p join public.clients c on c.id=p.client_id where c.client_user_id=auth.uid())
);
drop policy if exists "project participants send messages" on public.project_messages;
create policy "project participants send messages" on public.project_messages for insert to authenticated with check (
  sender_id=auth.uid() and (public.is_internal_workspace_user() or project_id in(select p.id from public.projects p join public.clients c on c.id=p.client_id where c.client_user_id=auth.uid()))
);
grant select,insert on public.project_messages to authenticated;
create or replace function public.workspace_schema_version()
returns integer language sql stable as $$ select 1; $$;
revoke all on function public.workspace_schema_version() from public,anon;
grant execute on function public.workspace_schema_version() to authenticated;

-- ===== Section: employee-role-access =====
-- Employee role scope for assigned delivery work and read-only client data.
-- Included in canonical execution order below. Safe to rerun.

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
  select public.current_workspace_role() in ('employee','project_manager') and exists(
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
  using (public.current_workspace_role() in ('employee','project_manager') and public.employee_can_access_project(id));

drop policy if exists "workspace administrators manage records" on public.project_team_members;
create policy "workspace administrators manage records" on public.project_team_members for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned project team" on public.project_team_members;
create policy "employees read assigned project team" on public.project_team_members for select to authenticated
  using (public.current_workspace_role() in ('employee','project_manager') and public.employee_can_access_project(project_id));

drop policy if exists "workspace administrators manage records" on public.project_work_items;
create policy "workspace administrators manage records" on public.project_work_items for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned project tasks" on public.project_work_items;
create policy "employees read assigned project tasks" on public.project_work_items for select to authenticated
  using (public.current_workspace_role() in ('employee','project_manager') and public.employee_can_access_project(project_id));

drop policy if exists "workspace administrators manage records" on public.project_links;
create policy "workspace administrators manage records" on public.project_links for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "employees read assigned project links" on public.project_links;
create policy "employees read assigned project links" on public.project_links for select to authenticated
  using (public.current_workspace_role() in ('employee','project_manager') and public.employee_can_access_project(project_id));

-- Message access follows the same project visibility as the delivery workspace.
drop policy if exists "project participants read messages" on public.project_messages;
create policy "project participants read messages" on public.project_messages
  for select to authenticated
  using (exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists "project participants send messages" on public.project_messages;
create policy "project participants send messages" on public.project_messages
  for insert to authenticated
  with check (sender_id=auth.uid() and exists(select 1 from public.projects p where p.id=project_id));

-- ===== Section: employee-client-rls-fix =====
-- Break the clients -> projects -> project_work_items -> clients RLS cycle.
-- Included in canonical execution order below. Safe to rerun.

create or replace function public.employee_can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_workspace_role() in ('employee','project_manager') and exists (
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

-- ===== Section: reviews =====
-- Shared employee issue reports and admin review queue.
-- Included in canonical execution order below. Safe to rerun.

create table if not exists public.workspace_reviews (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_name text not null,
  reporter_email text,
  title text not null check (char_length(trim(title)) between 3 and 180),
  report_type text not null check (report_type in ('BUG','ISSUE')),
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','URGENT')),
  description text not null check (char_length(trim(description)) between 8 and 5000),
  page_path text,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','RESOLVED')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_reviews_created_idx on public.workspace_reviews(created_at desc);
create index if not exists workspace_reviews_reporter_idx on public.workspace_reviews(reporter_user_id,created_at desc);
create index if not exists workspace_reviews_status_idx on public.workspace_reviews(status,created_at desc);

create or replace function public.set_workspace_review_reporter()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.reporter_user_id := auth.uid();
  -- Submission fields cannot impersonate an administrator response.
  new.status := 'OPEN';
  new.admin_note := null;
  select coalesce(nullif(display_name,''),split_part(email,'@',1)),email
    into new.reporter_name,new.reporter_email
    from public.workspace_members
    where user_id=auth.uid() or lower(email)=lower(coalesce(auth.jwt()->>'email',''))
    order by (user_id=auth.uid()) desc
    limit 1;
  if new.reporter_name is null then
    new.reporter_name := coalesce(auth.jwt()->>'email','Workspace user');
    new.reporter_email := auth.jwt()->>'email';
  end if;
  return new;
end; $$;
revoke all on function public.set_workspace_review_reporter() from public,anon,authenticated;
drop trigger if exists set_workspace_review_reporter on public.workspace_reviews;
create trigger set_workspace_review_reporter before insert on public.workspace_reviews
  for each row execute procedure public.set_workspace_review_reporter();

alter table public.workspace_reviews enable row level security;
drop policy if exists "workspace reviews read own or admin" on public.workspace_reviews;
create policy "workspace reviews read own or admin" on public.workspace_reviews for select to authenticated
  using (public.is_workspace_admin() or (public.current_workspace_role() in ('employee','project_manager') and reporter_user_id=auth.uid()));
drop policy if exists "workspace members submit reviews" on public.workspace_reviews;
create policy "workspace members submit reviews" on public.workspace_reviews for insert to authenticated
  with check (public.is_internal_workspace_user() and reporter_user_id=auth.uid());
drop policy if exists "workspace admins update reviews" on public.workspace_reviews;
create policy "workspace admins update reviews" on public.workspace_reviews for update to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());
drop policy if exists "workspace admins delete reviews" on public.workspace_reviews;
create policy "workspace admins delete reviews" on public.workspace_reviews for delete to authenticated
  using (public.is_workspace_admin());

drop trigger if exists touch_workspace_reviews_updated_at on public.workspace_reviews;
create trigger touch_workspace_reviews_updated_at before update on public.workspace_reviews
  for each row execute procedure public.touch_updated_at();

grant select,insert,update,delete on public.workspace_reviews to authenticated;
revoke all on public.workspace_reviews from anon;

-- ===== Section: qr-attendance =====
-- Included in canonical execution order below. Safe to rerun.
-- Office day boundaries use Asia/Kolkata; change attendance_settings before use.

create table if not exists public.attendance_settings (
 id boolean primary key default true check(id),
 office_name text not null default 'Main office',
 timezone text not null default 'Asia/Kolkata'
);
insert into public.attendance_settings(id) values(true) on conflict do nothing;
alter table public.attendance_settings enable row level security;
drop policy if exists "internal attendance settings" on public.attendance_settings;
create policy "internal attendance settings" on public.attendance_settings for select to authenticated using(public.is_internal_workspace_user());
grant select on public.attendance_settings to authenticated;

-- Tokens are only disclosed by the admin-only issuance function, never by SELECT.
create table if not exists public.attendance_challenges (
 token uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '60 seconds'
);
alter table public.attendance_challenges enable row level security;
revoke all on public.attendance_challenges from public,anon,authenticated;

create table if not exists public.attendance_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 work_date date not null,
 checked_in_at timestamptz not null,
 checked_out_at timestamptz,
 checkin_token uuid not null,
 checkout_token uuid,
 check(checked_out_at is null or checked_out_at>=checked_in_at),
 unique(user_id,checkin_token),unique(user_id,checkout_token)
);
create unique index if not exists attendance_one_open_session on public.attendance_sessions(user_id) where checked_out_at is null;
create index if not exists attendance_sessions_date on public.attendance_sessions(work_date,user_id);
alter table public.attendance_sessions enable row level security;
drop policy if exists "read attendance sessions" on public.attendance_sessions;
create policy "read attendance sessions" on public.attendance_sessions for select to authenticated
 using(public.is_internal_workspace_user() and (user_id=auth.uid() or public.is_workspace_admin()));
revoke all on public.attendance_sessions from public,anon,authenticated;
grant select on public.attendance_sessions to authenticated;

alter table public.attendance_records add column if not exists source text not null default 'manual' check(source in ('manual','qr'));

drop policy if exists "read team attendance" on public.attendance_records;
create policy "read team attendance" on public.attendance_records for select to authenticated
 using(public.is_internal_workspace_user() and (user_id=auth.uid() or public.is_workspace_admin()));
create or replace function public.validate_manual_attendance() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source='manual' and (new.notes is null or length(trim(new.notes))<3 or length(new.notes)>2000)
 then raise exception 'Enter an attendance reason (3–2000 characters).'; end if;
 return new;
end; $$;
drop trigger if exists attendance_manual_reason on public.attendance_records;
create trigger attendance_manual_reason before insert or update on public.attendance_records for each row execute function public.validate_manual_attendance();
revoke all on function public.validate_manual_attendance() from public,anon,authenticated;
create table if not exists public.attendance_audit (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default clock_timestamp(),
 old_record jsonb,new_record jsonb
);
alter table public.attendance_audit enable row level security;
drop policy if exists "admin read attendance audit" on public.attendance_audit;
create policy "admin read attendance audit" on public.attendance_audit for select to authenticated using(public.is_workspace_admin());
revoke all on public.attendance_audit from public,anon,authenticated;
grant select on public.attendance_audit to authenticated;
create or replace function public.audit_attendance_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end; $$;
drop trigger if exists attendance_record_audit on public.attendance_records;
create trigger attendance_record_audit after insert or update or delete on public.attendance_records for each row execute function public.audit_attendance_record();
revoke all on function public.audit_attendance_record() from public,anon,authenticated;

create or replace function public.issue_attendance_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare challenge public.attendance_challenges; settings public.attendance_settings;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can display the office QR.'; end if;
 perform pg_advisory_xact_lock(418209);
 select * into settings from public.attendance_settings where id=true;
 delete from public.attendance_challenges where expires_at<clock_timestamp()-interval '1 day';
 select * into challenge from public.attendance_challenges where expires_at>clock_timestamp()+interval '10 seconds' order by created_at desc limit 1;
 if not found then insert into public.attendance_challenges default values returning * into challenge; end if;
 return jsonb_build_object('token',challenge.token,'expiresAt',challenge.expires_at,'serverTime',clock_timestamp(),'officeName',settings.office_name,'timezone',settings.timezone);
end; $$;

-- Privileged only to validate the QR and write for auth.uid(); no client user ID/time accepted.
create or replace function public.scan_attendance(p_token uuid,p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); visit public.attendance_sessions; settings public.attendance_settings;
 stamp timestamptz; day date; hours numeric;
begin
 if actor is null or not public.is_internal_workspace_user() then raise exception 'Employee workspace access required.'; end if;
 if p_action is null or p_action not in ('check_in','check_out') then raise exception 'Choose check in or check out.'; end if;
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

-- Close a forgotten visit with explicit, audited admin-supplied departure time.
create or replace function public.correct_attendance_checkout(p_session uuid,p_checkout timestamptz,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare visit public.attendance_sessions; settings public.attendance_settings; hours numeric;
begin
 if auth.uid() is null or not public.is_workspace_admin() then raise exception 'Only administrators can correct attendance.'; end if;
 if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>2000 then raise exception 'Enter a correction reason (3–2000 characters).'; end if;
 select * into visit from public.attendance_sessions where id=p_session;
 if not found then raise exception 'Visit not found.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(visit.user_id::text,418210));
 select * into visit from public.attendance_sessions where id=p_session for update;
 select * into settings from public.attendance_settings where id=true;
 if p_checkout is null or p_checkout<visit.checked_in_at or p_checkout>clock_timestamp() or (p_checkout at time zone settings.timezone)::date<>visit.work_date then raise exception 'Departure must be on the visit date, after arrival, and not in the future.'; end if;
 if exists(select 1 from public.attendance_sessions other where other.user_id=visit.user_id and other.id<>visit.id
   and other.checked_in_at<p_checkout and coalesce(other.checked_out_at,'infinity'::timestamptz)>visit.checked_in_at)
 then raise exception 'Departure overlaps another visit. Choose a time before the next arrival.'; end if;
 insert into public.attendance_audit(actor_id,old_record,new_record) values(auth.uid(),to_jsonb(visit),to_jsonb(visit)||jsonb_build_object('checked_out_at',p_checkout,'reason',trim(p_reason)));
 update public.attendance_sessions set checked_out_at=p_checkout where id=visit.id;
 select coalesce(sum(extract(epoch from (checked_out_at-checked_in_at))/3600),0) into hours from public.attendance_sessions where user_id=visit.user_id and work_date=visit.work_date and checked_out_at is not null;
 insert into public.attendance_records(user_id,work_date,status,hours_logged,notes,source,updated_at) values(visit.user_id,visit.work_date,'PRESENT',least(round(hours,2),24),trim(p_reason),'qr',clock_timestamp())
 on conflict(user_id,work_date) do update set hours_logged=excluded.hours_logged,updated_at=excluded.updated_at where attendance_records.source='qr';
end; $$;
revoke all on function public.issue_attendance_challenge(),public.scan_attendance(uuid,text),public.correct_attendance_checkout(uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.issue_attendance_challenge(),public.scan_attendance(uuid,text),public.correct_attendance_checkout(uuid,timestamptz,text) to authenticated;

-- ===== Section: client-portal-access =====
-- Client portal: expose only associated projects, progress counts and team names.
-- Included in canonical execution order below. Safe to rerun.

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
      'id',p.id,'external_id',p.external_id,'title',p.title,'logo_data_url',p.logo_data_url,'client_company',coalesce(nullif(trim(p.client_company),''),(select c.company_name from public.clients c where c.id=p.client_id)),'status',p.status,
      'details',jsonb_build_object('services',p.services,'start_date',p.start_date,'scope_included',p.scope_included,'scope_excluded',p.scope_excluded,'assumptions',p.assumptions),
      'total_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id),
      'completed_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id and w.status='DONE')
    ) order by p.created_at desc,p.id)
    from public.projects p
    where exists(select 1 from public.clients c where c.id=p.client_id and c.client_user_id=auth.uid())
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.read_client_projects() from public,anon;
grant execute on function public.read_client_projects() to authenticated;

-- ===== Section: project-status =====
-- Add On track and AMC to the project lifecycle without changing existing statuses.

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('ACTIVE','ON_TRACK','COMPLETED','AMC'));

-- ===== Section: project-assignment-status =====
-- Included in canonical execution order below. Safe to rerun.

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

-- ===== Section: activity-notifications =====
create table if not exists public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('LEAD','TASK','PROJECT')),
  title text not null, message text not null, link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists workspace_notifications_recipient_idx on public.workspace_notifications(recipient_id,created_at desc);
alter table public.workspace_notifications enable row level security;
drop policy if exists "recipient reads" on public.workspace_notifications;
create policy "recipient reads" on public.workspace_notifications for select to authenticated using(recipient_id=auth.uid());
drop policy if exists "recipient updates" on public.workspace_notifications;
create policy "recipient updates" on public.workspace_notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
drop policy if exists "recipient dismisses" on public.workspace_notifications;
create policy "recipient dismisses" on public.workspace_notifications for delete to authenticated using(recipient_id=auth.uid());
grant select,delete on public.workspace_notifications to authenticated;
grant update(read) on public.workspace_notifications to authenticated;

-- Audit history is written by triggers, never by browser callers.
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='audit_events' loop
    execute format('drop policy %I on public.audit_events',p.policyname);
  end loop;
end $$;
create policy "admins read audit" on public.audit_events for select to authenticated using(public.is_workspace_admin());
revoke insert,update,delete on public.audit_events from authenticated;
grant select on public.audit_events to authenticated;

create or replace function public.record_workspace_activity() returns trigger
language plpgsql security definer set search_path=public as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; changed text[]; project_row public.projects;
begin
  if TG_OP <> 'INSERT' then before_row=to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then after_row=to_jsonb(new); end if;
  if TG_OP='UPDATE' and (before_row - 'updated_at' - 'revision')=(after_row - 'updated_at' - 'revision') then return new; end if;
  row_data=coalesce(after_row,before_row);
  select array_agg(key order by key) into changed from jsonb_object_keys(row_data) key
    where key not in ('updated_at','revision') and before_row->key is distinct from after_row->key;
  insert into public.audit_events(actor_user_id,entity_type,entity_id,action,metadata)
    values(auth.uid(),TG_TABLE_NAME,(row_data->>'id')::uuid,TG_OP,jsonb_build_object(
      'label',coalesce(row_data->>'title',row_data->>'full_name',row_data->>'display_name',row_data->>'email',row_data->>'id'),
      'fields',changed,'previous_status',before_row->>'status','status',after_row->>'status',
      'previous_role',before_row->>'role','role',after_row->>'role'));
  if TG_TABLE_NAME='leads' and TG_OP='INSERT' then
    insert into public.workspace_notifications(recipient_id,type,title,message,link)
      select distinct user_id,'LEAD','New lead',row_data->>'full_name','/requests#'||coalesce(row_data->>'external_id',row_data->>'id')
      from public.workspace_members where role='admin' and user_id is not null;
  elsif TG_TABLE_NAME='project_work_items' and TG_OP<>'DELETE'
    and after_row->>'assignee_user_id' is not null
    and (TG_OP='INSERT' or before_row->>'assignee_user_id' is distinct from after_row->>'assignee_user_id') then
    insert into public.workspace_notifications(recipient_id,type,title,message,link)
      values((after_row->>'assignee_user_id')::uuid,'TASK','Task assigned to you',after_row->>'title','/work');
  elsif TG_TABLE_NAME='projects' and TG_OP='UPDATE' and before_row->>'status' is distinct from after_row->>'status' then
    insert into public.workspace_notifications(recipient_id,type,title,message,link)
      select recipients.user_id,'PROJECT','Project status changed',new.title||': '||new.status,
        case when exists(select 1 from public.workspace_members m where m.user_id=recipients.user_id and m.role='client') then '/client/projects' else '/projects/'||coalesce(new.external_id,new.id::text) end
      from (
        select user_id from public.project_team_members where project_id=new.id
        union select assignee_user_id from public.project_work_items where project_id=new.id
        union select client_user_id from public.clients where id=new.client_id
      ) recipients where recipients.user_id is not null;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.record_workspace_activity() from public;
do $$ declare t text; begin
  foreach t in array array['workspace_members','leads','projects','project_team_members','project_work_items','clients','proposals','invoices','managed_projects'] loop
    execute format('drop trigger if exists workspace_activity on public.%I',t);
    execute format('create trigger workspace_activity after insert or update or delete on public.%I for each row execute function public.record_workspace_activity()',t);
  end loop;
end $$;

-- ===== Section: client-project-tasks =====
-- Client portal: expose only associated projects, progress counts and team names.
-- Included in canonical execution order below. Safe to rerun.

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
      'id',p.id,'external_id',p.external_id,'title',p.title,'logo_data_url',p.logo_data_url,'client_company',coalesce(nullif(trim(p.client_company),''),(select c.company_name from public.clients c where c.id=p.client_id)),'status',p.status,
      'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'status',w.status) order by w.created_at,w.id) from public.project_work_items w where w.project_id=p.id),'[]'::jsonb),
      'details',jsonb_build_object('services',p.services,'start_date',p.start_date,'scope_included',p.scope_included,'scope_excluded',p.scope_excluded,'assumptions',p.assumptions),
      'total_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id),
      'completed_tasks',(select count(*) from public.project_work_items w where w.project_id=p.id and w.status='DONE')
    ) order by p.created_at desc,p.id)
    from public.projects p
    where exists(select 1 from public.clients c where c.id=p.client_id and c.client_user_id=auth.uid())
  ),'[]'::jsonb);
end;
$$;
revoke all on function public.read_client_projects() from public,anon;
grant execute on function public.read_client_projects() to authenticated;

-- ===== Section: remove-lead-qualification =====
-- Retire qualification stages without deleting leads or attached documents.

lock table public.leads in share row exclusive mode;
update public.leads
set status = case when status = 'QUALIFIED' then 'NEW' else 'LOST' end,
    revision = revision + 1
where status in ('QUALIFIED', 'DISQUALIFIED');

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('NEW', 'PROPOSAL_SENT', 'ACCEPTED', 'CONVERTED', 'LOST'));


-- ===== Section: client-portal-records =====
-- Explicit client-safe projections; account ownership always comes from auth.uid().
create or replace function public.read_client_records()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if auth.uid() is null or public.current_workspace_role() is distinct from 'client' then
    raise exception 'Client access required' using errcode = '42501';
  end if;
  with accounts as (select id from public.clients where client_user_id=auth.uid()),
  shared_proposals as (
    select p.* from public.proposals p where p.status in ('SENT','ACCEPTED','DECLINED','CHANGES_REQUESTED','SUPERSEDED')
    and (p.client_id in (select id from accounts) or (p.client_id is null and exists(select 1 from public.leads l where l.id=p.lead_id and l.client_id in(select id from accounts))))
  ), issued_invoices as (
    select i.* from public.invoices i where i.status in ('SENT','CONFIRMED_PAID')
    and (i.client_id in(select id from accounts) or (i.client_id is null and (
      exists(select 1 from public.projects p where p.id=i.project_id and p.client_id in(select id from accounts))
      or exists(select 1 from public.leads l where l.id=i.lead_id and l.client_id in(select id from accounts)))))
  ), documents as (
    select p.id, p.document_name as name, p.document_data_url as url, 'Proposal'::text as kind
    from shared_proposals p where nullif(p.document_name,'') is not null and nullif(p.document_data_url,'') is not null
    union all
    select l.id,l.acceptance_document_name,l.acceptance_document_data_url,'Acceptance'
    from public.leads l where l.client_id in(select id from accounts) and l.status in('ACCEPTED','CONVERTED')
    and nullif(l.acceptance_document_name,'') is not null and nullif(l.acceptance_document_data_url,'') is not null
  )
  select jsonb_build_object(
    'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',proposal_title,'project_title',project_title,'client_name',(select coalesce(nullif(l.company_name,''),l.full_name) from public.leads l where l.id=lead_id),'version',version,'status',status,'accepted_by',coalesce(response_name,(select l.acceptance_name from public.leads l where l.id=lead_id)),'accepted_at',coalesce(responded_at,(select l.accepted_at from public.leads l where l.id=lead_id)),'review_path',case when status <> 'SUPERSEDED' and share_token is not null then '/proposal/'||share_token else null end,'expiry_date',expiry_date,'amount',quoted_amount,'currency',currency,'scope',scope_included,'deliverables',deliverables,'timeline',timeline,'payment_terms',payment_terms) order by created_at desc,id) from shared_proposals),'[]'::jsonb),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',invoice_number,'transaction_reference',transaction_reference,'bill_to',bill_to,'operating_company',operating_company,'gst_enabled',gst_enabled,'contract_value',contract_value,'deposit_amount',deposit_amount,'quantity',quantity,'unit_price',unit_price,'subtotal',subtotal,'gst_amount',gst_amount,'gst_rate',gst_rate,'confirmed_paid_at',confirmed_paid_at,'description',description,'status',status,'total',total,'currency',currency,'issue_date',issue_date,'due_date',due_date,'payment_terms',payment_terms,'payment_instructions',payment_instructions) order by created_at desc,id) from issued_invoices),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'url',url,'kind',kind) order by kind,name,id) from documents),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.read_client_records() from public,anon;
grant execute on function public.read_client_records() to authenticated;

commit;
begin;
-- Separate client reports from administrator-confirmed invoice payment fields.
create table if not exists public.invoice_payment_references (
  invoice_id uuid primary key references public.invoices(id) on delete cascade,
  reference text not null check (length(trim(reference)) between 0 and 200),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now()
);
alter table public.invoice_payment_references drop constraint if exists invoice_payment_references_reference_check;
alter table public.invoice_payment_references add constraint invoice_payment_references_reference_check check (length(trim(reference)) <= 200);
alter table public.invoice_payment_references enable row level security;
drop policy if exists "read own payment references or admin" on public.invoice_payment_references;
create policy "read own payment references or admin" on public.invoice_payment_references
for select to authenticated using (
  public.current_workspace_role()='admin' or submitted_by=auth.uid()
);
grant select on public.invoice_payment_references to authenticated;
revoke insert,update,delete on public.invoice_payment_references from authenticated,anon;
create or replace function public.submit_invoice_payment_reference(p_invoice_id uuid,p_reference text)
returns void language plpgsql security definer set search_path=public as $$
declare inv public.invoices;
begin
  if auth.uid() is null or public.current_workspace_role() is distinct from 'client' then
    raise exception 'Client access required' using errcode='42501';
  end if;
  if length(trim(coalesce(p_reference,''))) > 200 then
    raise exception 'Enter a payment reference of up to 200 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select i.* into inv from public.invoices i where i.id=p_invoice_id and (
    exists(select 1 from public.clients c where c.id=i.client_id and c.client_user_id=auth.uid())
    or (i.client_id is null and (
      exists(select 1 from public.projects p join public.clients c on c.id=p.client_id where p.id=i.project_id and c.client_user_id=auth.uid())
      or exists(select 1 from public.leads l join public.clients c on c.id=l.client_id where l.id=i.lead_id and c.client_user_id=auth.uid())
    ))) for update;
  if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
  if inv.status<>'SENT' then raise exception 'This invoice is not awaiting payment'; end if;
  insert into public.invoice_payment_references(invoice_id,reference,submitted_by)
    values(inv.id,trim(coalesce(p_reference,'')),auth.uid())
    on conflict(invoice_id) do update set reference=excluded.reference,submitted_by=excluded.submitted_by,submitted_at=now();
end $$;
revoke all on function public.submit_invoice_payment_reference(uuid,text) from public,anon;
grant execute on function public.submit_invoice_payment_reference(uuid,text) to authenticated;

-- ===== Section: project-manager-role =====
-- Enforce role eligibility for all new or changed manager assignments.
create or replace function public.validate_project_manager_assignment()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'Project Manager' and not exists (
    select 1 from public.workspace_members m
    where m.user_id = new.user_id and m.role = 'project_manager'
  ) then
    raise exception 'Only users with the Project Manager role can be assigned as project manager';
  end if;
  return new;
end;
$$;
drop trigger if exists validate_project_manager_assignment on public.project_team_members;
create trigger validate_project_manager_assignment
before insert or update on public.project_team_members
for each row execute function public.validate_project_manager_assignment();

-- A role change must not leave an ineligible user assigned as project manager.
create or replace function public.clear_ineligible_project_manager()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.project_team_members where user_id = old.user_id and role = 'Project Manager';
    return old;
  end if;
  if old.role = 'project_manager' and (new.role <> 'project_manager' or new.user_id is distinct from old.user_id) then
    delete from public.project_team_members where user_id = old.user_id and role = 'Project Manager';
  end if;
  return new;
end;
$$;
drop trigger if exists clear_ineligible_project_manager on public.workspace_members;
create trigger clear_ineligible_project_manager after update of role, user_id on public.workspace_members
for each row execute function public.clear_ineligible_project_manager();
drop trigger if exists clear_deleted_project_manager on public.workspace_members;
create trigger clear_deleted_project_manager after delete on public.workspace_members
for each row execute function public.clear_ineligible_project_manager();

-- Retain users' access tiers; clear legacy assignments that no longer qualify.
delete from public.project_team_members t where t.role = 'Project Manager'
  and not exists (select 1 from public.workspace_members m where m.user_id=t.user_id and m.role='project_manager');


-- ===== Section: internal-project-commercial-guards =====
create or replace function public.reject_internal_project_commercial_link()
returns trigger language plpgsql security definer set search_path = public
as $$
declare target_id uuid;
begin
  if TG_TABLE_NAME = 'invoices' then target_id=new.project_id;
  else target_id=new.source_project_id; end if;
  if exists(select 1 from public.projects where id=target_id and project_type='internal') then
    raise exception 'Internal projects cannot have invoices or retainer plans';
  end if;
  return new;
end;
$$;
drop trigger if exists reject_internal_project_invoice on public.invoices;
create trigger reject_internal_project_invoice before insert or update on public.invoices
for each row execute function public.reject_internal_project_commercial_link();
drop trigger if exists reject_internal_project_retainer on public.managed_projects;
create trigger reject_internal_project_retainer before insert or update on public.managed_projects
for each row execute function public.reject_internal_project_commercial_link();

create or replace function public.prevent_project_type_change()
returns trigger language plpgsql set search_path = public
as $$ begin
  if new.project_type is distinct from old.project_type then
    raise exception 'Project type cannot be changed after creation';
  end if;
  return new;
end; $$;
drop trigger if exists prevent_project_type_change on public.projects;
create trigger prevent_project_type_change before update of project_type on public.projects
for each row execute function public.prevent_project_type_change();


-- ===== Section: project-manager-operational-access =====
-- Managers may handle the sales-to-delivery workflow; identity administration stays admin-only.
do $$ declare table_name text;
begin
  foreach table_name in array array['clients','leads','proposals','proposal_follow_ups','proposal_events','projects','project_team_members','project_work_items','project_links','invoices','managed_projects'] loop
    execute format('drop policy if exists "project managers operational access" on public.%I',table_name);
    execute format('create policy "project managers operational access" on public.%I for all to authenticated using (public.current_workspace_role()=''project_manager'') with check (public.current_workspace_role()=''project_manager'')',table_name);
  end loop;
end $$;

commit;
