"use client";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";
import Link from "next/link";
import {ArrowRight} from "lucide-react";
import {useClientWorkspace} from "@/lib/client-workspace";
import {StatusBadge} from "@/app/_components/status-badge";
export default function ClientProjectsPage() {

 const {projects,loading,error,retry}=useClientWorkspace();
 return <div className="page-content client-projects-page">
  <section className="welcome-row"><div><h1>Your projects</h1><p className="welcome-subtitle">Project status and current tasks.</p></div></section>
  {loading ? <p role="status">Loading projects...</p> : error ? <section className="panel portal-record"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section> : projects.length ?
   <div className="portal-records">{projects.map(project=>{
    return <Link href={`/client/projects/${project.id}`} className="panel portal-record client-project-card client-project-link" key={project.id} aria-label={`View ${project.client_company?.trim() || project.title}`}>
     <header className="client-project-heading"><div><span className="client-project-reference">{project.external_id}</span><div className="project-card-identity"><ProjectCardLogo src={project.logo_data_url} title={project.client_company?.trim() || project.title} /><h2>{project.client_company?.trim() || project.title}</h2></div>{project.client_company?.trim() && project.client_company.trim().toLowerCase() !== project.title.trim().toLowerCase() && <p className="client-project-subtitle">{project.title}</p>}</div><StatusBadge status={project.status}/></header>
     <footer className="client-project-card-footer"><span>{project.completed_tasks} of {project.total_tasks} tasks completed</span><span className="client-project-open">View project <ArrowRight size={16} aria-hidden="true"/></span></footer>
    </Link>;
   })}</div> : <section className="panel portal-record"><h2>No projects yet</h2><p>Projects associated with your account will appear here.</p></section>}
 </div>;
}
