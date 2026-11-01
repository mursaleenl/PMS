-- Apply after schema.sql (new projects) or production-relational-migration.sql.
-- Existing data is preserved. All workspace graph writes use one atomic RPC.
begin;

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
as $$ select coalesce(public.current_workspace_role() in ('admin','employee'),false); $$;
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
update public.proposals p set client_id=l.client_id from public.leads l where p.lead_id=l.id and p.client_id is null;

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
    elsif field_name in ('client_company','client_name','client_email','operating_company','start_date','scope_included','scope_excluded','assumptions','signed_contract_name','signed_contract_data_url') then
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
    if not public.is_workspace_admin() then
      if collection_name<>'projects' or change->>'operation'<>'save' or root_id is null
        or not exists(select 1 from public.projects p where p.id=root_id and (
          exists(select 1 from public.project_team_members t where t.project_id=p.id and t.user_id=auth.uid())
          or exists(select 1 from public.project_work_items w where w.project_id=p.id and w.assignee_user_id=auth.uid())
        )) or not public.employee_project_task_update_allowed(root_id,change->'data') then
        raise exception 'Employees can update only their own assigned task progress.';
      end if;
    end if;
    if change->>'operation'='delete' then
      if collection_name='projects' and not public.is_workspace_admin() then raise exception 'Only administrators can delete projects'; end if;
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
      if public.is_workspace_admin() then
        select id into lead_id_value from public.leads where external_id=data->>'leadId';
        if nullif(data->>'leadId','') is not null and lead_id_value is null then raise exception 'Linked lead does not exist'; end if;
        select id into proposal_id_value from public.proposals where lead_id=lead_id_value and version=(data->>'proposalVersion')::integer;
        client_id_value=public.workspace_client(coalesce(payload->>'client_company',payload->>'client_name'),payload->>'client_name',payload->>'client_email');
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
commit;
