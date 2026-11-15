"use client";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientProjectDrawer } from "@/app/_components/client-project-drawer";
import { InternalProjectDrawer } from "@/app/_components/internal-project-drawer";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ListTodo, FolderKanban, Plus, Receipt, User, X } from "lucide-react";
import { readProjects, type Project, getProjectDisplayTitle, getProjectDisplayServices, getProjectClientLabel, isProjectAssignedToUser, canViewProjectTask } from "@/lib/projects";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignees";

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
        <p className="welcome-subtitle">Keep client delivery and internal projects together.</p>
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
      <p>Choose the kind of project you want to create.</p>
      <div className="new-project-choices">
        <button type="button" onClick={()=>{setShowProjectOptions(false);setShowClientProject("new");}}><strong>New client</strong><span>Create a client project directly</span><ArrowRight size={16}/></button>
        <button type="button" onClick={()=>{setShowProjectOptions(false);setShowClientProject("existing");}}><strong>Existing client</strong><span>Add another project under the same client</span><ArrowRight size={16}/></button>
        <button type="button" onClick={() => { setShowProjectOptions(false); setShowInternalProject(true); }}><strong>Internal</strong><span>Start a project for your team</span><ArrowRight size={16} /></button>
        <Link href="/requests" onClick={() => setShowProjectOptions(false)}><strong>From a lead</strong><span>Use an existing enquiry to start delivery</span><ArrowRight size={16} /></Link>
      </div>
    </dialog>}
    <div className="project-section-tabs" role="tablist" aria-label="Project sections">
      {projectSections.map(section => <button key={section} type="button" role="tab" aria-selected={projectSection === section} className={projectSection === section ? "active" : ""} onClick={() => setProjectSection(section)}>
        <span>{section}</span><span className="project-section-count">{accessibleProjects.filter(project => inSection(project, section)).length}</span>
      </button>)}
    </div>
    {visibleProjects.length === 0 ? <EmptyState icon={<FolderKanban size={22} />} title={accessibleProjects.length > 0 ? `No ${projectSection} projects` : (role === "admin" || role === "project_manager") ? "No project workspaces yet" : "No projects assigned"} description={(role === "admin" || role === "project_manager") ? "Create a client project or an internal project directly. A lead is optional." : "Projects assigned to you will appear here."} action={(role === "admin" || role === "project_manager") ? <button className="button button-primary" type="button" onClick={()=>setShowProjectOptions(true)}>New project <Plus size={15}/></button> : undefined} /> : <section className="project-portfolio">{visibleProjects.map((project) => {
      const visibleTasks = (project.workItems ?? []).filter(task => canViewProjectTask(project, task, role, user?.id, employeeName));
      const openWork = visibleTasks.filter((item) => item.status !== "DONE").length;
      const services = getProjectDisplayServices(project);
      const pmMember = project.team.find((member) => member.role === "Project Manager");
      const pmName = pmMember?.name && !DUMMY_ASSIGNABLE_NAMES.has(pmMember.name.toLowerCase().trim()) ? pmMember.name : "PM unassigned";
      return <article className="portfolio-card panel" key={project.id}>
        <Link className="portfolio-card-link" href={`/projects/${project.id}`}>
          <div className="portfolio-card-top">
            <span>
              {project.projectType === "internal" ? <span className="project-internal-wordmark">Internal</span> : <span className={`company-pill company-${(project.operatingCompany ?? "Evecture").toLowerCase()}`} data-company={project.operatingCompany ?? "Evecture"}>{project.operatingCompany ?? "Evecture"}</span>}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <div className="portfolio-project-identity">
            <ProjectCardLogo src={project.logoDataUrl} title={getProjectDisplayTitle(project)} projectType={project.projectType} />
            <div className="portfolio-project-copy">
              <h2 className="portfolio-card-title">{getProjectDisplayTitle(project)}</h2>
              {(getProjectClientLabel(project)||services)&&<p className="portfolio-card-subtitle">{project.projectType!=="internal" ? getProjectClientLabel(project)||services : services}</p>}
            </div>
          </div>
          <div className="portfolio-task-row">
            <ListTodo className="task-count-icon" size={16} strokeWidth={2} aria-hidden="true"/>
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
        <div className="portfolio-actions portfolio-actions-admin">
          <Link className="button button-quiet portfolio-lifecycle-button" href={`/projects/${project.id}`}>
            Explore<ArrowRight size={13} />
          </Link>
        </div>
      </article>;
    })}</section>}
    {(role === "admin" || role === "project_manager") && showClientProject && <ClientProjectDrawer mode={showClientProject} onClose={()=>setShowClientProject(null)} onCreated={project=>{setShowClientProject(null);router.push(`/projects/${project.id}`);}}/>}
    {(role === "admin" || role === "project_manager") && showInternalProject && <InternalProjectDrawer onClose={() => setShowInternalProject(false)} onCreated={project => { setShowInternalProject(false); router.push(`/projects/${project.id}`); }} />}
  </div>;
}
