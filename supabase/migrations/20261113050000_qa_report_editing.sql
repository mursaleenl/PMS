-- Allow admins and project managers to edit QA content without changing authorship or linked tasks.
begin;

create or replace function public.edit_qa_report(p_report_id uuid,p_kind text,p_title text,p_details text,p_project_external_id text default null,p_image_data_url text default null,p_image_name text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare report public.qa_reports; project_uuid uuid; image_value text=nullif(p_image_data_url,''); image_filename text=nullif(trim(p_image_name),'');
begin
  if not coalesce(public.can_manage_workspace(),false) then raise exception 'Only administrators and project managers can edit QA reports' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-graph-write',0));
  select * into report from public.qa_reports where id=p_report_id for update;
  if not found then raise exception 'The report no longer exists'; end if;
  if p_kind is null or p_kind not in ('BUG','CHANGE','IMPROVEMENT') then raise exception 'Choose Bug, Change, or Improvement'; end if;
  if p_title is null or length(trim(p_title)) not between 1 and 1000 or p_details is null or length(trim(p_details)) not between 1 and 5000 then raise exception 'Enter a title (up to 1000 characters) and details (up to 5000 characters)'; end if;
  if nullif(p_project_external_id,'') is not null then
    select id into project_uuid from public.projects where external_id=p_project_external_id;
    if project_uuid is null then raise exception 'Choose an available project'; end if;
  end if;
  if (report.task_id is not null or report.general_task_id is not null) and report.project_id is distinct from project_uuid then raise exception 'The project cannot change while the report is linked to a task'; end if;
  if not public.valid_compressed_image(image_value,358400) then raise exception 'Choose a compressed PNG, JPG, or WebP image up to 350 KB'; end if;
  if image_value is null then image_filename=null; end if;
  if image_filename is not null and length(image_filename)>200 then raise exception 'Image names must be at most 200 characters'; end if;
  update public.qa_reports set kind=p_kind,title=trim(p_title),details=trim(p_details),project_id=project_uuid,image_data_url=image_value,image_name=image_filename where id=p_report_id;
end;
$$;
revoke all on function public.edit_qa_report(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.edit_qa_report(uuid,text,text,text,text,text,text) to authenticated;

commit;
