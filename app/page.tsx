"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, Clock3, Inbox, ListTodo, Plus, Users } from "lucide-react";
import { type Lead, readLeads } from "@/lib/leads";
import { type Project, readProjects } from "@/lib/projects";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";

function initials(value: string) {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default function OverviewPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    const refresh = () => { setLeads(readLeads()); setProjects(readProjects()); };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const activeProjects = projects.filter((project) => project.status === "ACTIVE");
  const tasks = useMemo(() => activeProjects.flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task }))), [activeProjects]);
  const openTasks = tasks.filter(({ task }) => task.status !== "DONE");
  const teamCount = new Set(activeProjects.flatMap((project) => project.team.map((member) => member.name.trim()).filter(Boolean))).size;
  const newCount = leads.filter((lead) => lead.status === "NEW").length;
  return <div className="page-content overview-dashboard">
    <section className="welcome-row">
      <div><h1>Workspace overview</h1><p className="welcome-subtitle">See what needs attention across your workspace.</p></div>
      <div className="welcome-actions"><Link className="button button-quiet" href="/projects"><BriefcaseBusiness size={14} />Projects</Link><Link className="button button-quiet" href="/requests/new"><Plus size={15} />New request</Link></div>
    </section>

    <section className="overview-summary-grid" aria-label="Workspace summary">
      <Link href="/projects" className="overview-summary-card"><span className="overview-summary-icon summary-blue"><BriefcaseBusiness size={17} /></span><span><small>Active projects</small><strong>{activeProjects.length}</strong></span><ArrowRight size={15} className="overview-card-arrow" /></Link>
      <Link href="/work" className="overview-summary-card"><span className="overview-summary-icon summary-violet"><ListTodo size={17} /></span><span><small>Open tasks</small><strong>{openTasks.length}</strong></span><ArrowRight size={15} className="overview-card-arrow" /></Link>
      <Link href="/projects/assignments" className="overview-summary-card"><span className="overview-summary-icon summary-green"><Users size={17} /></span><span><small>Team members</small><strong>{teamCount}</strong></span><ArrowRight size={15} className="overview-card-arrow" /></Link>
      <Link href="/requests" className="overview-summary-card"><span className="overview-summary-icon summary-amber"><Inbox size={17} /></span><span><small>Needs review</small><strong>{newCount}</strong></span><ArrowRight size={15} className="overview-card-arrow" /></Link>
    </section>

    <section className="overview-project-section">
      <div className="overview-section-heading"><div><h2>Project overview</h2><p>Progress and current work across your active projects.</p></div><Link className="text-link" href="/projects">View all projects <ArrowRight size={14} /></Link></div>
      {activeProjects.length === 0 ? <div className="panel overview-empty"><EmptyState icon={<BriefcaseBusiness size={22} />} title="No active projects" description="Move an accepted lead into its project workspace to start tracking delivery." action={<Link className="button button-quiet" href="/requests">Open requests <ArrowRight size={14} /></Link>} /></div> : <div className="overview-project-grid">{activeProjects.slice(0, 4).map((project) => {
        const projectTasks = project.workItems ?? [];
        const complete = projectTasks.filter((task) => task.status === "DONE").length;
        const progress = projectTasks.length ? Math.round(complete / projectTasks.length * 100) : 0;
        const team = project.team.filter((member) => member.name.trim());
        return <Link href={`/projects/${project.id}`} className="panel overview-project-card" key={project.id}>
          <div className="overview-project-card-top"><span className="overview-project-mark"><BriefcaseBusiness size={16} /></span><StatusBadge status={project.status}>Active</StatusBadge></div>
          <small className="mono-meta">{project.id} · {project.clientCompany || project.clientName} · {project.operatingCompany ?? "Evecture"}</small>
          <h3>{project.title}</h3><p className="overview-project-services">{project.services.join(" · ") || "Project delivery"}</p>
          <div className="overview-progress-label"><span>Task progress</span><strong>{progress}%</strong></div><div className="overview-progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="overview-project-footer"><span>{complete} of {projectTasks.length} tasks complete</span><span className="mono-meta">{team.length} team member{team.length === 1 ? "" : "s"}</span></div>
        </Link>;
      })}</div>}
    </section>

    <section className="overview-lower-grid">
      <div className="panel overview-task-panel"><div className="overview-panel-heading"><div><h2>Tasks in progress</h2><p>Current work across active projects</p></div><Link className="text-link" href="/work">All tasks <ArrowRight size={14} /></Link></div>
        {tasks.filter(({ task }) => task.status === "IN_PROGRESS").length === 0 ? <div className="overview-inline-empty"><Check size={17} />No tasks are currently in progress.</div> : <div className="overview-task-list">{tasks.filter(({ task }) => task.status === "IN_PROGRESS").slice(0, 5).map(({ project, task }) => <Link href={`/projects/${project.id}`} className="overview-task-row" key={`${project.id}-${task.id}`}><span className="overview-task-indicator"><Clock3 size={14} /></span><span className="overview-task-copy"><strong>{task.title}</strong><small>{project.title} · {task.assignee || "Unassigned"}</small></span><span className="overview-task-hours">{task.loggedHours}h logged</span><ArrowRight size={14} /></Link>)}</div>}
      </div>
      <div className="panel overview-request-panel"><div className="overview-panel-heading"><div><h2>Leads</h2><p>Latest incoming enquiries</p></div><Link className="text-link" href="/requests">Open leads <ArrowRight size={14} /></Link></div>
        {leads.length === 0 ? <div className="overview-inline-empty"><Inbox size={17} />No requests have been recorded yet.</div> : <div className="overview-request-list">{[...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((lead) => <Link href={`/requests#${lead.id}`} className="overview-request-row" key={lead.id}><span className="overview-task-indicator"><Inbox size={14} /></span><span className="overview-task-copy"><strong>{lead.fullName}</strong><small>{lead.companyName || "Individual enquiry"}</small></span><StatusBadge status={lead.status} /></Link>)}</div>}
      </div>
    </section>
    <p className="storage-note">Workspace records are currently stored in this browser.</p>
  </div>;
}
