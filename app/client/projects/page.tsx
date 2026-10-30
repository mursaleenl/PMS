"use client";
import Link from "next/link";
import {useClientWorkspace} from "@/lib/client-workspace";
import {StatusBadge} from "@/app/_components/status-badge";
export default function ClientProjectsPage() {
 const {projects,loading,error,retry}=useClientWorkspace();
 return <div className="page-content role-dashboard-page"><Link className="back-link" href="/client">Client portal</Link><section className="welcome-row"><div><h1>Your projects</h1><p className="welcome-subtitle">Follow delivery progress and current work.</p></div></section>{loading?<p role="status">Loading projects…</p>:error?<section className="panel"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section>:projects.length?<div className="portal-records">{projects.map(project=>{
 const completed=project.tasks.filter(task=>task.status==="DONE").length;
 return <article className="panel portal-record" key={project.id}><div className="panel-heading"><h2>{project.title}</h2><StatusBadge status={project.status}/></div><p>{completed} of {project.tasks.length} tasks completed</p><progress value={completed} max={project.tasks.length || 1} aria-label={`${project.title} task progress`}/>{project.tasks.length>0&&<ul className="portal-task-list">{project.tasks.map((task,index)=><li key={`${task.title}-${index}`}><span>{task.title}</span><StatusBadge status={task.status}/></li>)}</ul>}<Link className="button button-quiet" href={`/client/messages?project=${encodeURIComponent(project.external_id)}`}>Contact project team</Link></article>;
 })}</div>:<section className="panel portal-record"><h2>No projects yet</h2><p>Your projects will appear when the team creates a delivery workspace linked to your account.</p></section>}</div>;
}
