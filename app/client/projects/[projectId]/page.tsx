"use client";
import Link from "next/link";
import {useParams} from "next/navigation";
import {useClientWorkspace} from "@/lib/client-workspace";
import {StatusBadge} from "@/app/_components/status-badge";

export default function ClientProjectPage() {
 const {projectId}=useParams<{projectId:string}>();
 const {projects,loading,error,retry}=useClientWorkspace();
 const project=projects.find(item=>item.id===projectId);
 return <div className="page-content client-projects-page client-project-detail">
  <Link href="/client/projects" className="text-link client-project-back">Back to projects</Link>
  {loading?<p role="status">Loading project...</p>:error?<section className="panel portal-record"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section>:!project?<section className="panel portal-record"><h1>Project unavailable</h1><p>This project is not associated with your account.</p></section>:<>
   <header className="client-project-detail-heading"><div><span className="client-project-reference">{project.external_id}</span><h1>{project.client_company?.trim() || project.title}</h1>{project.client_company?.trim() && project.client_company.trim().toLowerCase() !== project.title.trim().toLowerCase() && <p className="client-project-subtitle">{project.title}</p>}</div><StatusBadge status={project.status}/></header>
   <section className="panel portal-record client-project-progress-panel"><div className="client-project-progress-heading"><h2>Project progress</h2><p>{project.completed_tasks} of {project.total_tasks} tasks completed</p></div><progress value={project.completed_tasks} max={project.total_tasks||1} aria-label="Project progress"/></section>
   {project.details && <section className="panel portal-record"><h2>Project details</h2><dl className="client-project-facts">
    {project.details.operating_company && <div><dt>Operating company</dt><dd>{project.details.operating_company}</dd></div>}
    {!!project.details.services?.length && <div><dt>Services</dt><dd>{project.details.services.join(", ")}</dd></div>}
    {project.details.start_date && <div><dt>Start date</dt><dd>{new Intl.DateTimeFormat("en",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${project.details.start_date}T00:00:00Z`))}</dd></div>}
    <div><dt>Revision rounds</dt><dd>{project.details.revision_rounds}</dd></div>
   </dl>{[["Included scope",project.details.scope_included],["Excluded scope",project.details.scope_excluded],["Assumptions",project.details.assumptions]].map(([label,value])=>value?.trim() && <div className="client-project-scope" key={label}><h3>{label}</h3><p>{value}</p></div>)}</section>}
   {!!project.team?.length && <section className="panel portal-record"><h2>Project team</h2><ul className="client-project-task-list">{project.team.map((member,index)=><li key={`${member.name}-${member.role}-${index}`}><span>{member.name}</span><span>{member.role}</span></li>)}</ul></section>}
   <section className="panel portal-record"><h2>Tasks</h2>{project.tasks===undefined?<p role="status">Task details are currently unavailable.</p>:project.tasks.length?<ul className="client-project-task-list">{project.tasks.map(task=><li key={task.id}><span>{task.title}</span><StatusBadge status={task.status}/></li>)}</ul>:<p>No tasks have been added yet.</p>}</section>
  </>}
 </div>;
}
