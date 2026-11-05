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
commit;
