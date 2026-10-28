"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, FolderKanban, Handshake, Plus, Trash2, User, Users } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { deleteProject, readProjects, type Project, updateProject, getProjectDisplayTitle } from "@/lib/projects";
import { deleteManagedProject, readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignees";
import { showToast } from "@/app/_components/toast-hub";

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

  function moveFromRetainerToProjects(project: Project, managedPlan: ManagedProject) {
    if (!window.confirm(`Move "${project.title}" out of Retainers and back to active Projects?`)) return;
    deleteManagedProject(managedPlan.id);
    updateProject(project.id, { status: "ACTIVE" });
    setProjects(readProjects());
    setManagedProjects(readManagedProjects());
    showToast({ message: `"${project.title}" moved to active projects.` });
  }

  function removeProject(project: Project) {
    if (!window.confirm(`Delete “${project.title}”? This will permanently remove its workspace and tasks.`)) return;
    deleteProject(project.id);
    setProjects(readProjects());
  }

  return <div className="page-content projects-page">
    <section className="welcome-row">
      <div>
        <h1>Project workspaces</h1>
        <p className="welcome-subtitle">Keep delivery, assignments, and client work together.</p>
      </div>
      <div className="welcome-actions">
        <Link className="button button-quiet" href="/projects/assignments">
          <Users size={15} />
          Project assignments
        </Link>
        <Link className="button button-primary" href="/requests">
          <Plus size={15} />
          From accepted lead
        </Link>
      </div>
    </section>
    {projects.length === 0 ? <EmptyState icon={<FolderKanban size={22} />} title="No project workspaces yet" description="Move an accepted lead here from Leads to create its project workspace." action={<Link className="button button-primary" href="/requests">Open leads <ArrowRight size={15} /></Link>} /> : <section className="project-portfolio">{projects.map((project) => {
      const openWork = (project.workItems ?? []).filter((item) => item.status !== "DONE").length;
      const managedPlan = managedProjects.find((item) => item.sourceProjectId === project.id);
      const pmMember = project.team.find((member) => member.role === "Project Manager");
      const pmName = pmMember?.name && !DUMMY_ASSIGNABLE_NAMES.has(pmMember.name.toLowerCase().trim()) ? pmMember.name : "PM unassigned";
      return <article className="portfolio-card panel" key={project.id}>
        <Link className="portfolio-card-link" href={`/projects/${project.id}`}>
          <div className="portfolio-card-top">
            <span className={`company-pill company-${(project.operatingCompany ?? "Evecture").toLowerCase()}`} data-company={project.operatingCompany ?? "Evecture"}>
              {project.operatingCompany ?? "Evecture"}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <h2 className="portfolio-card-title">{getProjectDisplayTitle(project)}</h2>
          <p className="portfolio-card-subtitle">{project.clientCompany || project.clientName} · {project.services.join(", ")}</p>
          <div className="portfolio-task-row">
            <span className={`portfolio-chip-dot ${openWork > 0 ? "has-tasks" : ""}`} />
            <span>{openWork} open {openWork === 1 ? "task" : "tasks"}</span>
          </div>
          <div className="portfolio-card-meta">
            <span className="portfolio-pm-chip" title={`Project Manager: ${pmName}`}>
              <User size={12} />
              <span>{pmName}</span>
            </span>
            <span className="portfolio-id-badge">
              <span className="mono-meta">{project.id}</span>
              <ArrowRight size={13} className="portfolio-arrow-icon" />
            </span>
          </div>
        </Link>
        <div className={`portfolio-actions${role === "admin" ? " portfolio-actions-admin" : ""}`}>
          {project.status === "ACTIVE" ? (
            <button className="button button-quiet portfolio-lifecycle-button" type="button" onClick={() => markComplete(project)}>
              <Check size={13} />Mark complete
            </button>
          ) : managedPlan ? (
            <>
              <Link className="button button-quiet portfolio-lifecycle-button" href="/post-sale" title="View retainer plan">
                <Handshake size={13} />In retainer · {managedPlan.id}
              </Link>
              <button
                className="button button-quiet portfolio-lifecycle-button"
                type="button"
                onClick={() => moveFromRetainerToProjects(project, managedPlan)}
                title="Move out of retainers and back to active projects"
              >
                <FolderKanban size={13} />Move to projects
              </button>
            </>
          ) : (
            <button className="button button-primary portfolio-lifecycle-button" type="button" onClick={() => setSelectedProject(project)}>
              <Handshake size={13} />Move to retainer
            </button>
          )}
          {role === "admin" && (
            <button className="portfolio-delete-icon-button" type="button" title="Delete project" onClick={() => removeProject(project)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </article>;
    })}</section>}
    <p className="storage-note">Project workspaces and files are currently stored in this browser. Connect shared team storage before operational use.</p>
    {selectedProject && <ManagedPlanDrawer projects={[selectedProject]} initialProjectId={selectedProject.id} onClose={() => setSelectedProject(null)} onCreated={() => setManagedProjects(readManagedProjects())} />}
  </div>;
}
