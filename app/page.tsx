"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, Clock3, Inbox, ListTodo, Plus, Users } from "lucide-react";
import { type Lead, readLeads } from "@/lib/leads";
import { type Project, readProjects, getProjectDisplayTitle } from "@/lib/projects";
import { readInvoices, type StoredInvoice } from "@/lib/invoices";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";

export default function OverviewPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  useEffect(() => {
    const refresh = () => {
      setLeads(readLeads());
      setProjects(readProjects());
      setInvoices(readInvoices());
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:invoices-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("evecture:invoices-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const activeProjects = projects.filter((project) => project.status === "ACTIVE");
  const tasks = useMemo(() => activeProjects.flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task }))), [activeProjects]);
  const openTasks = tasks.filter(({ task }) => task.status !== "DONE");
  const activeTasks = useMemo(() => {
    return tasks
      .filter(({ task }) => task.status === "IN_PROGRESS" || task.status === "TO_DO" || (task.status as string) === "TODO")
      .sort((a, b) => {
        if (a.task.status === "IN_PROGRESS" && b.task.status !== "IN_PROGRESS") return -1;
        if (a.task.status !== "IN_PROGRESS" && b.task.status === "IN_PROGRESS") return 1;
        return 0;
      });
  }, [tasks]);
  const inProgressCount = useMemo(() => {
    return openTasks.filter(({ task }) => task.status === "IN_PROGRESS").length;
  }, [openTasks]);
  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.status !== "CONFIRMED_PAID");
  }, [invoices]);
  const newCount = leads.filter((lead) => lead.status === "NEW").length;
  return <div className="page-content overview-dashboard">
    <section className="welcome-row">
      <div><h1>Dashboard</h1><p className="welcome-subtitle">See what needs attention across your workspace.</p></div>
      <div className="welcome-actions">
        <Link className="button button-quiet" href="/projects">
          <BriefcaseBusiness size={14} strokeWidth={2} />
          Projects
        </Link>
        <Link className="button button-primary" href="/requests/new">
          <Plus size={14} strokeWidth={2.5} />
          Log enquiry
        </Link>
      </div>
    </section>

    <section className="overview-summary-grid" aria-label="Workspace summary">
      <Link href="/projects" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Active projects</small>
          <ArrowRight size={14} className="overview-card-arrow" />
        </div>
        <strong>{activeProjects.length}</strong>
        <span className="overview-summary-subtext">
          {activeProjects.length === 1 ? "1 in active delivery" : `${activeProjects.length} in active delivery`}
        </span>
      </Link>
      <Link href="/work" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Open tasks</small>
          <ArrowRight size={14} className="overview-card-arrow" />
        </div>
        <strong>{openTasks.length}</strong>
        <span className="overview-summary-subtext">
          {inProgressCount > 0 ? `${inProgressCount} in progress` : `${openTasks.length} pending completion`}
        </span>
      </Link>
      <Link href="/invoices" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Pending invoices</small>
          <ArrowRight size={14} className="overview-card-arrow" />
        </div>
        <strong>{pendingInvoices.length}</strong>
        <span className="overview-summary-subtext">
          {pendingInvoices.length === 0 ? "All invoices settled" : `${pendingInvoices.length === 1 ? "1 awaiting payment" : `${pendingInvoices.length} awaiting payment`}`}
        </span>
      </Link>
      <Link href="/requests" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Needs review</small>
          <ArrowRight size={14} className="overview-card-arrow" />
        </div>
        <strong>{newCount}</strong>
        <span className="overview-summary-subtext">
          {newCount === 0 ? "Pipeline up to date" : `${newCount === 1 ? "1 new enquiry" : `${newCount} new enquiries`}`}
        </span>
      </Link>
    </section>

    <section className="overview-project-section">
      <div className="overview-section-heading"><div><h2>Project overview</h2><p>Progress and current work across your active projects.</p></div><Link className="text-link" href="/projects">View all projects <ArrowRight size={14} /></Link></div>
      {activeProjects.length === 0 ? <div className="panel overview-empty"><EmptyState icon={<BriefcaseBusiness size={22} />} title="No active projects" description="Move an accepted lead into its project workspace to start tracking delivery." action={<Link className="button button-quiet" href="/requests">Open requests <ArrowRight size={14} /></Link>} /></div> : <div className="overview-project-grid">{activeProjects.slice(0, 4).map((project) => {
        const projectTasks = project.workItems ?? [];
        const complete = projectTasks.filter((task) => task.status === "DONE").length;
        const progress = projectTasks.length ? Math.round(complete / projectTasks.length * 100) : 0;
        return <Link href={`/projects/${project.id}`} className="panel overview-project-card" key={project.id}>
          <div className="overview-project-card-top">
            <span className={`company-pill company-${(project.operatingCompany ?? "Evecture").toLowerCase()}`} data-company={project.operatingCompany ?? "Evecture"}>
              {project.operatingCompany ?? "Evecture"}
            </span>
            <StatusBadge status={project.status}>Active</StatusBadge>
          </div>
          <h3 className="overview-project-title">{getProjectDisplayTitle(project)}</h3>
          <p className="overview-project-services">{project.clientCompany || project.clientName} · {project.services.join(", ") || "Project delivery"}</p>
          <div className="overview-progress-label">
            <span>Task progress</span>
            <strong>{progress}%</strong>
          </div>
          <div className="overview-progress-track">
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="overview-project-footer">
            <span className="overview-footer-stats">
              <span className={`portfolio-chip-dot ${projectTasks.length - complete > 0 ? "has-tasks" : ""}`} />
              <span>{complete} of {projectTasks.length} {projectTasks.length === 1 ? "task" : "tasks"} complete</span>
            </span>
            <span className="overview-id-badge">
              <span className="mono-meta">{project.id}</span>
              <ArrowRight size={13} className="overview-arrow-icon" />
            </span>
          </div>
        </Link>;
      })}</div>}
    </section>

    <section className="overview-lower-grid">
      <div className="panel overview-task-panel">
        <div className="overview-panel-heading">
          <div>
            <h2>Tasks</h2>
            <p>To do and in progress across active projects</p>
          </div>
          <Link className="text-link" href="/work">All tasks <ArrowRight size={14} /></Link>
        </div>
        {activeTasks.length === 0 ? (
          <div className="overview-inline-empty"><Check size={17} />No tasks are to do or in progress.</div>
        ) : (
          <div className="overview-task-list">
            {activeTasks.slice(0, 6).map(({ project, task }) => (
              <Link href={`/projects/${project.id}`} className="overview-task-row" key={`${project.id}-${task.id}`}>
                <span
                  className="overview-task-indicator"
                  style={task.status === "IN_PROGRESS" ? { background: "#0f172a", color: "#ffffff" } : { background: "#f1f5f9", color: "#475569" }}
                  title={task.status === "IN_PROGRESS" ? "In progress" : "To do"}
                >
                  {task.status === "IN_PROGRESS" ? <Clock3 size={14} /> : <ListTodo size={14} />}
                </span>
                <span className="overview-task-copy">
                  <strong>{task.title}</strong>
                  <small>{project.title} · {task.assignee || "Unassigned"}</small>
                </span>
                <StatusBadge status={task.status === "IN_PROGRESS" ? "IN_PROGRESS" : "TO_DO"}>
                  {task.status === "IN_PROGRESS" ? "In progress" : "To do"}
                </StatusBadge>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        )}
      </div>
      <div className="panel overview-request-panel"><div className="overview-panel-heading"><div><h2>Leads</h2><p>Latest incoming enquiries</p></div><Link className="text-link" href="/requests">Open leads <ArrowRight size={14} /></Link></div>
        {leads.length === 0 ? <div className="overview-inline-empty"><Inbox size={17} />No requests have been recorded yet.</div> : <div className="overview-request-list">{[...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((lead) => <Link href={`/requests#${lead.id}`} className="overview-request-row" key={lead.id}><span className="overview-task-indicator"><Inbox size={14} /></span><span className="overview-task-copy"><strong>{lead.fullName}</strong><small>{lead.companyName || "Individual enquiry"}</small></span><StatusBadge status={lead.status} /></Link>)}</div>}
      </div>
    </section>
    <p className="storage-note">Workspace records are currently stored in this browser.</p>
  </div>;
}
