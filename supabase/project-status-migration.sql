-- Add On track and AMC to the project lifecycle without changing existing statuses.
begin;
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('ACTIVE','ON_TRACK','COMPLETED','AMC'));
commit;
