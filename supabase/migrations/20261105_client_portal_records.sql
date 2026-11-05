begin;
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
