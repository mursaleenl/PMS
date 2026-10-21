"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, FolderKanban, Plus, Users } from "lucide-react";
import { readProjects, type Project } from "@/lib/projects";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    const refresh = () => setProjects(readProjects());
    refresh();
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return <div className="page-content projects-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>PROJECTS</div><h1>Project workspaces</h1><p className="welcome-subtitle">Manage active and completed projects.</p></div><div className="welcome-actions"><Link className="button button-quiet" href="/projects/assignments"><Users size={15}/>Project assignments</Link><Link className="button button-quiet" href="/requests"><Plus size={15}/>From accepted lead</Link></div></section>
    {projects.length === 0 ? <section className="panel pipeline-empty projects-empty"><span className="empty-icon"><FolderKanban size={22}/></span><h2>No active project workspaces</h2><p>Move an accepted lead here from the request pipeline to create its project workspace.</p><Link className="button button-primary" href="/requests">Open request pipeline <ArrowRight size={15}/></Link></section> : <section className="project-portfolio">{projects.map((project) => {
      const openWork = (project.workItems ?? []).filter((item) => item.status !== "DONE").length;
      return <Link className="portfolio-card panel" href={`/projects/${project.id}`} key={project.id}><div className="portfolio-card-top"><span className="portfolio-icon"><BriefcaseBusiness size={17}/></span><span className={`project-active-pill ${project.status === "COMPLETED" ? "project-completed-pill" : ""}`}><i/>{project.status === "COMPLETED" ? "COMPLETED" : "ACTIVE"}</span></div><h2>{project.title}</h2><p>{project.clientCompany || project.clientName} · {project.services.join(", ")}</p><div className="portfolio-progress"><div><span>Open work items</span><b>{openWork}</b></div></div><div className="portfolio-card-bottom"><span>{project.team.find((member) => member.role === "Project Manager")?.name || "Project manager unassigned"}</span><span>{project.id}<ArrowRight size={14}/></span></div></Link>;
    })}</section>}
    <p className="storage-note">Project workspaces and files are currently stored in this browser. Connect shared team storage before operational use.</p>
  </div>;
}
