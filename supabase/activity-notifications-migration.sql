begin;
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
commit;
