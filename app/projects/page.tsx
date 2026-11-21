"use client";
import { ProjectPortfolioCard } from "@/app/_components/project-portfolio-card";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientProjectDrawer } from "@/app/_components/client-project-drawer";
import { InternalProjectDrawer } from "@/app/_components/internal-project-drawer";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, FolderKanban, Plus, Receipt, X } from "lucide-react";
import { readProjects, type Project, isProjectAssignedToUser } from "@/lib/projects";
import { EmptyState } from "@/app/_components/empty-state";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function ProjectsPage() {
  const router = useRouter();
  const [projectSection, setProjectSection] = useState("All projects");
  const [showProjectOptions, setShowProjectOptions] = useState(false);
  const projectOptions = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (showProjectOptions) projectOptions.current?.showModal();
    else projectOptions.current?.close();
  }, [showProjectOptions]);
  const [showClientProject,setShowClientProject]=useState<"new"|"existing"|null>(null);
  const [showInternalProject, setShowInternalProject] = useState(false);
  const { role, user, members } = useWorkspaceAuth();
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

  const employeeName = (members.find((member) => member.user_id === user?.id)?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim();
  const accessibleProjects = (role === "employee") ? projects.filter((project) => isProjectAssignedToUser(project, user?.id, employeeName)) : projects.filter(project=>project.status!=="AMC");

  const projectSections = ["All projects", "Servn", "Evecture", "Internal"];
  const inSection = (project: Project, section: string) => section === "All projects" || (section === "Internal"
    ? project.projectType === "internal"
    : project.projectType !== "internal" && (project.operatingCompany || "Evecture") === section);
  const visibleProjects = accessibleProjects.filter(project => inSection(project, projectSection));

  return <div className="page-content projects-page">
    <section className="welcome-row">
      <div>
        <h1>Project workspaces</h1>
      </div>
      <div className="welcome-actions">
        {(role === "admin" || role === "project_manager") && <button className="button button-primary" type="button" aria-haspopup="dialog" onClick={() => setShowProjectOptions(true)}><Plus size={15} />New project</button>}
        {(role === "admin" || role === "project_manager") && <Link className="button button-quiet" href="/invoices">
          <Receipt size={15} />
          Invoices
        </Link>}
      </div>
    </section>
    {(role === "admin" || role === "project_manager") && <dialog ref={projectOptions} className="new-project-dialog" aria-labelledby="new-project-title" onCancel={() => setShowProjectOptions(false)} onClose={() => setShowProjectOptions(false)} onClick={event => {
      if (event.target === event.currentTarget) {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setShowProjectOptions(false);
      }
    }}>
      <header><h2 id="new-project-title">New project</h2><button className="icon-button" type="button" aria-label="Close project options" onClick={() => setShowProjectOptions(false)}><X size={18} /></button></header>
      <div className="new-project-choices">
        <button type="button" onClick={()=>{setShowProjectOptions(false);setShowClientProject("new");}}><strong>New client</strong><ArrowRight size={16}/></button>
        <button type="button" onClick={()=>{setShowProjectOptions(false);setShowClientProject("existing");}}><strong>Existing client</strong><ArrowRight size={16}/></button>
        <button type="button" onClick={() => { setShowProjectOptions(false); setShowInternalProject(true); }}><strong>Internal</strong><ArrowRight size={16} /></button>
        <Link href="/requests" onClick={() => setShowProjectOptions(false)}><strong>From a lead</strong><ArrowRight size={16} /></Link>
      </div>
    </dialog>}
    <div className="project-section-tabs" role="tablist" aria-label="Project sections">
      {projectSections.map(section => <button key={section} type="button" role="tab" aria-selected={projectSection === section} className={projectSection === section ? "active" : ""} onClick={() => setProjectSection(section)}>
        <span>{section}</span><span className="project-section-count">{accessibleProjects.filter(project => inSection(project, section)).length}</span>
      </button>)}
    </div>
    {visibleProjects.length === 0 ? <EmptyState icon={<FolderKanban size={22} />} title={accessibleProjects.length > 0 ? `No ${projectSection} projects` : (role === "admin" || role === "project_manager") ? "No project workspaces yet" : "No projects assigned"} /> : <section className="project-portfolio">{visibleProjects.map(project => (
      <ProjectPortfolioCard key={project.id} project={project} role={role} userId={user?.id} employeeName={employeeName} />
    ))}</section>}
    {(role === "admin" || role === "project_manager") && showClientProject && <ClientProjectDrawer mode={showClientProject} onClose={()=>setShowClientProject(null)} onCreated={project=>{setShowClientProject(null);router.push(`/projects/${project.id}`);}}/>}
    {(role === "admin" || role === "project_manager") && showInternalProject && <InternalProjectDrawer onClose={() => setShowInternalProject(false)} onCreated={project => { setShowInternalProject(false); router.push(`/projects/${project.id}`); }} />}
  </div>;
}
