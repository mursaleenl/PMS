"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {CalendarPicker} from "@/app/_components/calendar-picker";
import {X} from "lucide-react";
import {useAssignableUsers} from "@/lib/assignees";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {isProjectAssignedToUser,getProjectDisplayTitle,getProjectClientLabel,type Project,type ProjectWorkItem} from "@/lib/projects";
import {prepareTaskDispatch,persistTaskDispatch,type TaskDispatch} from "@/lib/task-dispatch";
import {TaskTargetPicker} from "@/app/_components/task-target-picker";
export function AssignTaskDialog({projects,onClose}:{projects:Project[];onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef<TaskDispatch[]|null>(null),busyRef=useRef(false);
 const {users,loading}=useAssignableUsers();
 const {role,user,members}=useWorkspaceAuth();
 const selfService=role==="employee";
 const selfName=members.find(member=>member.user_id===user?.id)?.display_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"";
 const allowedProjects=selfService?projects.filter(project=>isProjectAssignedToUser(project,user?.id,selfName)):projects;
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [selectedProjects,setSelectedProjects]=useState<Set<string>>(()=>new Set()),[selectedAssignees,setSelectedAssignees]=useState<Set<string>>(()=>new Set());
 useEffect(()=>{const node=dialog.current;node?.showModal();return ()=>node?.close();},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busyRef.current)return;
  const data=new FormData(event.currentTarget);busyRef.current=true;setBusy(true);setError("");
  try{
   if(role!=="admin"&&role!=="project_manager"&&role!=="employee")throw new Error("Task creation is not available for this role.");
   if(!pending.current)pending.current=prepareTaskDispatch({projectIds:[...selectedProjects],assignees:selfService?[{name:selfName,userId:user?.id}]:users.filter(person=>person.id&&selectedAssignees.has(person.id)).map(person=>({name:person.name,userId:person.id})),title:String(data.get("title")||""),description:String(data.get("description")||""),deadline:String(data.get("deadline")||""),kind:String(data.get("kind")) as ProjectWorkItem["kind"],priority:String(data.get("priority")) as ProjectWorkItem["priority"],estimatedHours:Number(data.get("estimatedHours")||0)});
   if(pending.current.some(item=>!allowedProjects.some(project=>project.id===item.projectId)))throw new Error("Select available projects.");
   await persistTaskDispatch(pending.current,{selfService});onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not assign the task.");}
  finally{busyRef.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="assign-task-dialog" aria-labelledby="assign-task-title" onCancel={event=>{if(busyRef.current)event.preventDefault();else onClose();}}>
  <header><h2 id="assign-task-title">{selfService?"Create task":"Assign task"}</h2><button className="icon-button" type="button" aria-label="Close task form" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  <p>{selfService?"Create a task for yourself in your assigned projects.":"Assign work to one or more people across selected projects."}</p>
  <form onSubmit={submit}><fieldset disabled={busy||Boolean(pending.current)}>
   <TaskTargetPicker label="Projects" options={allowedProjects.map(project=>({id:project.id,label:getProjectDisplayTitle(project),detail:getProjectClientLabel(project)}))} selected={selectedProjects} onChange={setSelectedProjects}/>
   <label className="field required">Task title<textarea name="title" required rows={3} maxLength={1000} placeholder="Describe the work to be done"/></label>
   <label className="field">Description<textarea name="description" rows={4} maxLength={5000} placeholder="Add requirements and the expected outcome"/></label>
   {selfService?<p>Assigned to you · {selfName}</p>:<TaskTargetPicker label="Assignees" options={users.filter(person=>person.id).map(person=>({id:person.id!,label:person.name,detail:person.role}))} selected={selectedAssignees} onChange={setSelectedAssignees}/>}
   <label className="field">Task type<select name="kind" defaultValue="FEATURE_DEV"><option value="FEATURE_DEV">Feature / development</option><option value="CLIENT_FEEDBACK_TODO">Client feedback</option><option value="QA_BUG">QA / bug</option></select></label>
   <div className="assign-task-columns"><label className="field">Priority<select name="priority" defaultValue="P3"><option value="P1">Critical</option><option value="P2">High</option><option value="P3">Normal</option><option value="P4">Low</option></select></label><label className="field">Estimated hours<input name="estimatedHours" type="number" min="0" step="0.25" defaultValue="0"/></label></div>
   <label className="field">Deadline<CalendarPicker name="deadline" mode="datetime" ariaLabel="Deadline"/></label>
  </fieldset>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy||loading||!allowedProjects.length}>{busy?"Saving…":pending.current?"Retry saving":selfService?"Create task":"Assign task"}</button></div></form>
 </dialog>;
}
