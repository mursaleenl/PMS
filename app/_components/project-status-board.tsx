"use client";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";
import {useState} from "react";
import {StatusBadge} from "@/app/_components/status-badge";
import {useRouter} from "next/navigation";
import {ManagedPlanDrawer} from "@/app/_components/managed-plan-drawer";
import {readManagedProjects,deleteManagedProject} from "@/lib/post-sale";
import Link from "next/link";
import {GripVertical,ListTodo,User} from "lucide-react";
import {readProjects,updateProject,getProjectDisplayTitle,getProjectDisplayServices,getProjectClientLabel,canViewProjectTask,type Project} from "@/lib/projects";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {DUMMY_ASSIGNABLE_NAMES} from "@/lib/assignees";

const columns:{label:string;status:Project["status"]}[]=[
  {label:"Active",status:"ACTIVE"},
  {label:"On track",status:"ON_TRACK"},
  {label:"Completed",status:"COMPLETED"},
  {label:"AMC",status:"AMC"},
];
const transferType="application/x-project-status";

export function ProjectStatusBoard({project}:{project:Project}) {
  const {role,user,members}=useWorkspaceAuth();
  const [over,setOver]=useState("");
  const [creatingRetainer,setCreatingRetainer]=useState(false);
  const router=useRouter();
  const canMove=role==="admin";
  const services=getProjectDisplayServices(project);
  const employeeName=(members.find(member=>member.user_id===user?.id)?.display_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"").trim();
  const openTasks=(project.workItems??[]).filter(task=>canViewProjectTask(project,task,role,user?.id,employeeName)&&task.status!=="DONE").length;
  const manager=project.team.find(member=>member.role==="Project Manager");
  const managerName=manager?.name&&!DUMMY_ASSIGNABLE_NAMES.has(manager.name.toLowerCase().trim())?manager.name:"PM unassigned";
  function move(status:Project["status"]) {
    const current=readProjects().find(item=>item.id===project.id);
    if(!canMove || !current || current.status===status || !columns.some(column=>column.status===status))return;
    const plan=readManagedProjects().find(item=>item.sourceProjectId===current.id);
    if(status==="AMC") {
      if(!plan){setCreatingRetainer(true);return;}
      updateProject(current.id,{status});
      router.push("/post-sale");
      return;
    }
    if(current.status==="AMC" && plan) {
      if(!window.confirm("Move this project out of Retainers and remove its retainer plan?"))return;
      deleteManagedProject(plan.id);
    }
    updateProject(current.id,{status});
  }
  return <><section className="project-status-board" aria-label="Project status">
    <div className="project-board-heading"><h2>Project status</h2><p>{canMove?"Drag the project between columns, or focus the card and use the left and right arrow keys.":"Current delivery status for this project."}</p></div>
    <div className="project-board-columns">{columns.map(column=><section className={`project-board-column ${over===column.status?"is-over":""}`} key={column.status} aria-label={`${column.label} projects`}
      onDragOver={event=>{if(canMove && event.dataTransfer.types.includes(transferType)){event.preventDefault();event.dataTransfer.dropEffect="move";setOver(column.status);}}}
      onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOver("");}}
      onDrop={event=>{event.preventDefault();setOver("");if(canMove && event.dataTransfer.getData(transferType)===project.id)move(column.status);}}>
      <header><h3><StatusBadge status={column.status}>{column.label}</StatusBadge></h3><span>{project.status===column.status?1:0}</span></header>
      {project.status===column.status?<article className="project-board-card" draggable={canMove} tabIndex={canMove?0:undefined} aria-label={`${getProjectDisplayTitle(project)} project`} onKeyDown={event=>{
        if(!canMove||!["ArrowLeft","ArrowRight"].includes(event.key))return;
        const index=columns.findIndex(item=>item.status===project.status);
        const target=columns[index+(event.key==="ArrowRight"?1:-1)];
        if(target){event.preventDefault();move(target.status);}
      }} onDragStart={event=>{if(!canMove)return;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData(transferType,project.id);}} onDragEnd={()=>setOver("")}>
        <div className="project-board-card-heading">
          {project.projectType==="internal"?<span className="project-internal-wordmark">Internal</span>:<span className={`company-pill company-${(project.operatingCompany??"Evecture").toLowerCase()}`} data-company={project.operatingCompany??"Evecture"}>{project.operatingCompany??"Evecture"}</span>}
          {canMove&&<GripVertical size={16} aria-hidden="true"/>}
        </div>
        <div className="project-card-identity project-board-identity">
          <ProjectCardLogo src={project.logoDataUrl} title={getProjectDisplayTitle(project)} projectType={project.projectType} />
          <div className="project-board-copy"><h4>{getProjectDisplayTitle(project)}</h4>{project.projectType!=="internal"&&(project.clientCompany||project.clientName)&&<p className="project-board-client">{getProjectClientLabel(project)}</p>}{services&&<p className="project-board-services">{services}</p>}</div>
        </div>
        <div className="project-board-task-count"><ListTodo size={14} aria-hidden="true"/><span>{openTasks} open {openTasks===1?"task":"tasks"}</span></div>
        <div className="project-board-card-meta"><span className="project-board-manager" title={`Project Manager: ${managerName}`}><User size={12} aria-hidden="true"/><span>{managerName}</span></span><span className="project-status-reference">{project.id}</span></div>
      </article>:<p className="project-board-empty">{canMove?"Drop project here":"No project"}</p>}
    </section>)}</div>
    {canMove && project.status==="AMC" && <div className="project-amc-actions"><Link className="button button-quiet" href="/post-sale">Open Retainers</Link>{!readManagedProjects().some(plan=>plan.sourceProjectId===project.id)&&<button className="button button-quiet" type="button" onClick={()=>setCreatingRetainer(true)}>Add retainer plan</button>}</div>}
  </section>{canMove&&creatingRetainer&&<ManagedPlanDrawer projects={[project]} initialProjectId={project.id} onClose={()=>setCreatingRetainer(false)} onCreated={()=>{setCreatingRetainer(false);router.push("/post-sale");}}/>}</>;
}
