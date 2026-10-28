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
  role text not null check (role in ('admin', 'employee', 'client')),
  display_name text,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_members add column if not exists must_change_password boolean not null default false;

create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

create or replace function public.current_workspace_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select role from public.workspace_members
      where user_id = auth.uid()
         or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      limit 1
    ),
    'employee'
  );
$$;

create or replace function public.is_workspace_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_workspace_role() = 'admin'; $$;

create or replace function public.is_internal_workspace_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_workspace_role() in ('admin', 'employee'); $$;

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
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
declare signed_in_email text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  signed_in_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if signed_in_email = '' then raise exception 'Your account needs a verified email address'; end if;
  if exists (select 1 from public.workspace_members where role = 'admin') then
    raise exception 'An administrator has already been configured';
  end if;
  update public.workspace_members
    set user_id = auth.uid(), role = 'admin',
        display_name = coalesce(display_name, auth.jwt() ->> 'user_name', auth.jwt() ->> 'name'),
        updated_at = now()
    where lower(email) = signed_in_email
    returning id into new_id;
  if new_id is null then
    insert into public.workspace_members (user_id, email, role, display_name)
    values (auth.uid(), signed_in_email, 'admin', coalesce(auth.jwt() ->> 'user_name', auth.jwt() ->> 'name'))
    returning id into new_id;
  end if;
  return new_id;
end;
$$;

create or replace function public.set_workspace_member_role(member_email text, member_role text, member_display_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
declare target_user_id uuid;
begin
  if not public.is_workspace_admin() then raise exception 'Only administrators can manage workspace roles'; end if;
  if member_role not in ('admin', 'employee', 'client') then raise exception 'Invalid workspace role'; end if;
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
  status text not null default 'NEW' check (status in ('NEW', 'QUALIFIED', 'PROPOSAL_SENT', 'ACCEPTED', 'CONVERTED', 'LOST', 'DISQUALIFIED')),
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
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
grant execute on function public.claim_initial_admin() to authenticated;
grant execute on function public.set_workspace_member_role(text, text, text) to authenticated;
grant execute on function public.clear_password_change_requirement() to authenticated;
grant execute on function public.current_workspace_role() to authenticated;
