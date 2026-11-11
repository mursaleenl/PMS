"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {GENERAL_TASKS_ID,updateGeneralTask} from "@/lib/general-tasks";
import {X} from "lucide-react";
import {useAssignableUsers} from "@/lib/assignees";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {getTaskAssignees,readProjects,updateProject,type ProjectWorkItem,type TaskAssignee} from "@/lib/projects";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {taskDeadlineFromInput,taskDeadlineInput} from "@/lib/dates";
import {CalendarPicker} from "./calendar-picker";
import {TaskTargetPicker} from "./task-target-picker";

export function EditTaskDialog({projectId,task,onClose}:{projectId:string;task:ProjectWorkItem;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),busyRef=useRef(false),pending=useRef<Partial<ProjectWorkItem>|null>(null);
 const {role}=useWorkspaceAuth();
 const {users,loading}=useAssignableUsers();
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [selected,setSelected]=useState<Set<string>|null>(null);
 const original=getTaskAssignees(task);
 const personKey=(person:TaskAssignee)=>person.userId||users.find(user=>user.name.trim().toLowerCase()===person.name.trim().toLowerCase())?.id||`legacy:${person.name}`;
 useEffect(()=>{if(!loading&&selected===null)setSelected(new Set(original.map(personKey)));},[loading,users,selected]); // Initialize once the directory is available.
 useEffect(()=>{const node=dialog.current;const previous=document.activeElement;node?.showModal();return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 const options=[...users.filter(user=>user.id).map(user=>({id:user.id!,label:user.name,detail:user.role})),...original.filter(person=>personKey(person).startsWith("legacy:")).map(person=>({id:personKey(person),label:person.name,detail:"Existing assignment"}))];
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busyRef.current)return;
  const data=new FormData(event.currentTarget);busyRef.current=true;setBusy(true);setError("");
  try{
   if(role!=="admin"&&role!=="project_manager")throw new Error("Only admins and project managers can edit task details.");
   if(!pending.current){
    const title=String(data.get("title")||"").trim(),estimatedHours=Number(data.get("estimatedHours")||0);
    if(!title)throw new Error("Enter a task title.");
    if(!Number.isFinite(estimatedHours)||estimatedHours<0)throw new Error("Enter valid estimated hours.");
    const priority=String(data.get("priority")) as ProjectWorkItem["priority"];
    const patch:Partial<ProjectWorkItem>={title,description:String(data.get("description")||"").trim()||undefined,deadline:taskDeadlineFromInput(String(data.get("deadline")||"")),priority,estimatedHours};
    const originalKeys=new Set(original.map(personKey));
    const changed=selected&&(selected.size!==originalKeys.size||[...selected].some(id=>!originalKeys.has(id)));
    if(changed){
     if(!selected?.size)throw new Error("Select at least one assignee.");
     const assignees=[...selected].map(id=>users.find(user=>user.id===id));
     if(assignees.some(person=>!person?.id))throw new Error("Select assignees from the workspace directory.");
     patch.assignees=assignees.map(person=>({name:person!.name,userId:person!.id}));
     patch.assignee=patch.assignees[0].name;patch.assigneeId=patch.assignees[0].userId;
    }
    pending.current=patch;
   }
   if(projectId===GENERAL_TASKS_ID){updateGeneralTask(task.id,pending.current);await flushWorkspaceChanges();onClose();return;}
   const project=readProjects().find(item=>item.id===projectId);
   if(!project?.workItems?.some(item=>item.id===task.id))throw new Error("This task is no longer available.");
   updateProject(projectId,{workItems:project.workItems.map(item=>item.id===task.id?{...item,...pending.current}:item)});
   await flushWorkspaceChanges();onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not save task details.");}
  finally{busyRef.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="assign-task-dialog" aria-labelledby="edit-task-title" onCancel={event=>{if(busyRef.current)event.preventDefault();else onClose();}}>
  <header><h2 id="edit-task-title">Edit task</h2><button type="button" className="icon-button" aria-label="Close task form" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  <form onSubmit={submit}><fieldset disabled={busy||Boolean(pending.current)}>
   <label className="field required">Task title<textarea name="title" required rows={2} maxLength={1000} defaultValue={task.title}/></label>
   <label className="field">Description<textarea name="description" rows={4} maxLength={5000} defaultValue={task.description}/></label>
   <TaskTargetPicker label="Assignees" options={options} selected={selected??new Set()} onChange={setSelected}/>
   <div className="assign-task-columns"><label className="field">Priority<select name="priority" defaultValue={task.priority}><option value="P1">Critical</option><option value="P2">High</option><option value="P3">Normal</option><option value="P4">Low</option></select></label><label className="field">Estimated hours<input name="estimatedHours" type="number" min="0" step="0.25" defaultValue={task.estimatedHours}/></label></div>
   <label className="field">Deadline<CalendarPicker name="deadline" mode="datetime" ariaLabel="Deadline" defaultValue={taskDeadlineInput(task.deadline)}/></label>
  </fieldset>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy||loading||selected===null}>{busy?"Saving…":pending.current?"Retry saving":"Save changes"}</button></div></form>
 </dialog>;
}
