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
   <header className="client-project-detail-heading"><div><span className="client-project-reference">{project.external_id}</span><h1>{project.title}</h1></div><StatusBadge status={project.status}/></header>
   <section className="panel portal-record client-project-progress-panel"><div className="client-project-progress-heading"><h2>Project progress</h2><p>{project.completed_tasks} of {project.total_tasks} tasks completed</p></div><progress value={project.completed_tasks} max={project.total_tasks||1} aria-label="Project progress"/></section>
   <section className="panel portal-record"><h2>Tasks</h2>{project.tasks===undefined?<p role="status">Task details are currently unavailable.</p>:project.tasks.length?<ul className="client-project-task-list">{project.tasks.map(task=><li key={task.id}><span>{task.title}</span><StatusBadge status={task.status}/></li>)}</ul>:<p>No tasks have been added yet.</p>}</section>
  </>}
 </div>;
}
