"use client";
import Link from "next/link";
import {useClientWorkspace} from "@/lib/client-workspace";
import {StatusBadge} from "@/app/_components/status-badge";
export default function ClientProjectsPage() {

 const {projects,loading,error,retry}=useClientWorkspace();
 return <div className="page-content client-projects-page">
  <section className="welcome-row"><div><h1>Your projects</h1><p className="welcome-subtitle">Project status and current tasks.</p></div></section>
  {loading ? <p role="status">Loading projects...</p> : error ? <section className="panel portal-record"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section> : projects.length ?
   <div className="portal-records">{projects.map(project=>{
    const progress=project.total_tasks ? Math.round(project.completed_tasks/project.total_tasks*100) : 0;
    return <Link href={`/client/projects/${project.id}`} className="panel portal-record client-project-card client-project-link" key={project.id} aria-label={`View ${project.client_company?.trim() || project.title}`}>
     <header className="client-project-heading"><div><span className="client-project-reference">{project.external_id}</span><h2>{project.client_company?.trim() || project.title}</h2>{project.client_company?.trim() && project.client_company.trim().toLowerCase() !== project.title.trim().toLowerCase() && <p className="client-project-subtitle">{project.title}</p>}</div><StatusBadge status={project.status}/></header>
     <div className="client-project-progress"><div><strong>{progress}% complete</strong><span>{project.completed_tasks} of {project.total_tasks} tasks completed</span></div><progress value={project.completed_tasks} max={project.total_tasks || 1} aria-label={`${project.title} progress`}/></div>
    </Link>;
   })}</div> : <section className="panel portal-record"><h2>No projects yet</h2><p>Projects associated with your account will appear here.</p></section>}
 </div>;
}
