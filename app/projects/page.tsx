"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, FolderKanban, Handshake, Plus, Trash2, Users } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { deleteProject, readProjects, type Project, updateProject } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function ProjectsPage() {
  const { role } = useWorkspaceAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [managedProjects, setManagedProjects] = useState<ManagedProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  useEffect(() => {
    const refresh = () => setProjects(readProjects());
    const refreshManaged = () => setManagedProjects(readManagedProjects());
    refresh();
    refreshManaged();
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:post-sale-updated", refreshManaged);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("evecture:post-sale-updated", refreshManaged);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function markComplete(project: Project) {
    updateProject(project.id, { status: "COMPLETED" });
    setProjects(readProjects());
  }

  function removeProject(project: Project) {
    if (!window.confirm(`Delete “${project.title}”? This will permanently remove its workspace and tasks.`)) return;
    deleteProject(project.id);
    setProjects(readProjects());
  }

  return <div className="page-content projects-page">
    <section className="welcome-row"><div><h1>Project workspaces</h1><p className="welcome-subtitle">Keep delivery, assignments, and client work together.</p></div><div className="welcome-actions"><Link className="button button-quiet" href="/projects/assignments"><Users size={15} />Project assignments</Link><Link className="button button-quiet" href="/requests"><Plus size={15} />From accepted lead</Link></div></section>
    {projects.length === 0 ? <EmptyState icon={<FolderKanban size={22} />} title="No project workspaces yet" description="Move an accepted lead here from Leads to create its project workspace." action={<Link className="button button-primary" href="/requests">Open leads <ArrowRight size={15} /></Link>} /> : <section className="project-portfolio">{projects.map((project) => {
      const openWork = (project.workItems ?? []).filter((item) => item.status !== "DONE").length;
      const managedPlan = managedProjects.find((item) => item.sourceProjectId === project.id);
      return <article className="portfolio-card panel" key={project.id}><Link className="portfolio-card-link" href={`/projects/${project.id}`}><div className="portfolio-card-top"><span className="portfolio-icon"><BriefcaseBusiness size={17} /></span><span className="portfolio-card-tags"><span className="company-pill">{project.operatingCompany ?? "Evecture"}</span><StatusBadge status={project.status} /></span></div><h2>{project.title}</h2><p>{project.clientCompany || project.clientName} · {project.services.join(", ")}</p><div className="portfolio-progress"><div><span>Open work items</span><b>{openWork}</b></div></div><div className="portfolio-card-bottom"><span>{project.team.find((member) => member.role === "Project Manager")?.name || "Project manager unassigned"}</span><span><span className="mono-meta">{project.id}</span><ArrowRight size={14} /></span></div></Link><div className={`portfolio-actions${role === "admin" ? " portfolio-actions-admin" : ""}`}>{project.status === "ACTIVE" ? <button className="button button-quiet portfolio-lifecycle-button" type="button" onClick={() => markComplete(project)}><Check size={13} />Mark complete</button> : managedPlan ? <Link className="button button-quiet portfolio-lifecycle-button" href="/post-sale"><Handshake size={13} />In post-sale · {managedPlan.id}</Link> : <button className="button button-primary portfolio-lifecycle-button" type="button" onClick={() => setSelectedProject(project)}><Handshake size={13} />Move to post-sale</button>}{role === "admin" && <button className="button button-quiet portfolio-delete-button" type="button" onClick={() => removeProject(project)}><Trash2 size={14} />Delete project</button>}</div></article>;
    })}</section>}
    <p className="storage-note">Project workspaces and files are currently stored in this browser. Connect shared team storage before operational use.</p>
    {selectedProject && <ManagedPlanDrawer projects={[selectedProject]} initialProjectId={selectedProject.id} onClose={() => setSelectedProject(null)} onCreated={() => setManagedProjects(readManagedProjects())} />}
  </div>;
}
