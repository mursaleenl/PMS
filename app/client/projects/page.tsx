"use client";
import {useClientWorkspace} from "@/lib/client-workspace";
import {StatusBadge} from "@/app/_components/status-badge";
export default function ClientProjectsPage() {
 const {projects,loading,error,retry}=useClientWorkspace();
 return <div className="page-content client-projects-page">
  <section className="welcome-row"><div><h1>Your projects</h1><p className="welcome-subtitle">Project progress and your assigned team.</p></div></section>
  {loading ? <p role="status">Loading projects…</p> : error ? <section className="panel portal-record"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section> : projects.length ?
   <div className="portal-records">{projects.map(project=>{
    const progress=project.total_tasks ? Math.round(project.completed_tasks/project.total_tasks*100) : 0;
    return <article className="panel portal-record client-project-card" key={project.id}>
     <header className="client-project-heading"><div><span className="client-project-reference">{project.external_id}</span><h2>{project.title}</h2></div><StatusBadge status={project.status}/></header>
     <div className="client-project-progress"><div><strong>{progress}% complete</strong><span>{project.completed_tasks} of {project.total_tasks} tasks completed</span></div><progress value={project.completed_tasks} max={project.total_tasks || 1} aria-label={`${project.title} progress`}/></div>
     <section className="client-project-team"><h3>Assigned team</h3>{project.team.length ? <ul>{project.team.map((person,index)=><li key={`${person.name}-${index}`}><strong>{person.name}</strong><span>{person.role}</span></li>)}</ul> : <p>Your team has not been assigned yet.</p>}</section>
    </article>;
   })}</div> : <section className="panel portal-record"><h2>No projects yet</h2><p>Projects associated with your account will appear here.</p></section>}
 </div>;
}
