import {supabase} from "@/lib/supabase";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
export type QaKind="BUG"|"CHANGE"|"IMPROVEMENT";
export const qaKindLabels:Record<QaKind,string>={BUG:"Bug",CHANGE:"Change",IMPROVEMENT:"Improvement"};
export type QaReport={id:string;kind:QaKind;title:string;details:string;created_by:string;created_at:string;image_data_url?:string|null;image_name?:string|null;project_id:string|null;task_id:string|null;project:{external_id:string}|null;task:{external_id:string;status:string;assignee_name:string}|null};
function databaseError(error:{code?:string;message:string}){
 return new Error(["42P01","PGRST202","PGRST205","PGRST200"].includes(error.code||"")?"QA setup is incomplete. Apply the updated database SQL in Supabase.":error.message);
}
export async function readQaReports():Promise<QaReport[]>{
 if(!supabase)throw new Error("Database is not configured.");
 const reports:QaReport[]=[];
 for(let offset=0;;offset+=200){
  const {data,error}=await supabase.from("qa_reports").select("*,project:projects(external_id),task:project_work_items(external_id,status,assignee_name),general_task:general_tasks(external_id,task)").order("created_at",{ascending:false}).order("id").range(offset,offset+199);
  if(error)throw databaseError(error);
  reports.push(...(data as unknown as QaReport[]??[]));if((data?.length??0)<200)return reports.map(report=>{const general=(report as unknown as {general_task?:{external_id:string;task:{status:string;assignee:string}}}).general_task;return {...report,task:report.task||(general?{external_id:general.external_id,status:general.task.status,assignee_name:general.task.assignee}:null)};});
 }
}
export async function saveQaReport(input:{id:string;kind:QaKind;title:string;details:string;projectId:string;imageDataUrl?:string;imageName?:string}){
 if(!supabase)throw new Error("Database is not configured.");
 await flushWorkspaceChanges();
 const {error}=await supabase.rpc("submit_qa_report",{p_id:input.id,p_kind:input.kind,p_title:input.title.trim(),p_details:input.details.trim(),p_project_external_id:input.projectId||null,p_assignee_id:null,p_image_data_url:input.imageDataUrl||null,p_image_name:input.imageName||null});
 if(error)throw databaseError(error);
 window.dispatchEvent(new Event("focus"));
}
