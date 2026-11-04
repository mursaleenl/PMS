-- Retire qualification stages without deleting leads or attached documents.
begin;

lock table public.leads in share row exclusive mode;
update public.leads
set status = case when status = 'QUALIFIED' then 'NEW' else 'LOST' end,
    revision = revision + 1
where status in ('QUALIFIED', 'DISQUALIFIED');

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('NEW', 'PROPOSAL_SENT', 'ACCEPTED', 'CONVERTED', 'LOST'));

commit;
