-- Shared employee issue reports and admin review queue.
-- Apply after the relational and workspace reliability migrations.
begin;

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
  using (public.is_workspace_admin() or (public.current_workspace_role()='employee' and reporter_user_id=auth.uid()));
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

commit;
