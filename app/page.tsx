"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, Clock3, Inbox, ListTodo, Plus, ReceiptText } from "lucide-react";
import { type Lead, readLeads } from "@/lib/leads";
import { type Project, readProjects, getProjectDisplayTitle, getProjectDisplayServices, isProjectAssignedToUser, canViewProjectTask } from "@/lib/projects";
import { readInvoices, type StoredInvoice } from "@/lib/invoices";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function OverviewPage() {
  const { role, user, members } = useWorkspaceAuth();
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

  const employeeName = (members.find((member) => member.user_id === user?.id)?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim().toLowerCase();
  const visibleProjects = (role === "employee" || role === "project_manager") ? projects.filter((project) => isProjectAssignedToUser(project, user?.id, employeeName)) : projects;
  const activeProjects = visibleProjects.filter((project) => project.status !== "COMPLETED" && project.status !== "AMC");
  const tasks = useMemo(() => visibleProjects.flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task }))).filter(({ project, task }) => canViewProjectTask(project, task, role, user?.id, employeeName)), [visibleProjects, role, user?.id, employeeName]);
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
  const completedTaskCount = tasks.filter(({ task }) => task.status === "DONE").length;
  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.status !== "CONFIRMED_PAID");
  }, [invoices]);
  const openLeadCount = leads.filter((lead) => ["NEW", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status)).length;
  return <div className={`page-content overview-dashboard${(role === "employee" || role === "project_manager") ? " employee-dashboard" : ""}`}>
    <section className="welcome-row">
      <div><h1>Dashboard</h1><p className="welcome-subtitle">{(role === "employee" || role === "project_manager") ? "Your assigned projects and tasks." : "See what needs attention across your workspace."}</p></div>
      <div className="welcome-actions">
        <Link className="button button-quiet" href="/projects">
          <BriefcaseBusiness size={14} strokeWidth={2} />
          Projects
        </Link>
        {role === "admin" && <Link className="button button-primary" href="/requests/new">
          <Plus size={14} strokeWidth={2.5} />
          Log enquiry
        </Link>}
      </div>
    </section>

    <section className="overview-summary-grid" aria-label="Workspace summary">
      <Link href="/projects" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Active projects</small>
          <BriefcaseBusiness size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" />
        </div>
        <strong>{activeProjects.length}</strong>
        <span className="overview-summary-subtext">
          {`${activeProjects.length} Active Delivery`}
        </span>
      </Link>
      <Link href="/work" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Open tasks</small>
          <ListTodo size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" />
        </div>
        <strong>{openTasks.length}</strong>
        <span className="overview-summary-subtext">
          {inProgressCount > 0 ? `${inProgressCount} in progress` : `${openTasks.length} pending completion`}
        </span>
      </Link>
      {role === "admin" && <Link href="/invoices" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Pending invoices</small>
          <ReceiptText size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" />
        </div>
        <strong>{pendingInvoices.length}</strong>
        <span className="overview-summary-subtext">
          {pendingInvoices.length === 0 ? "All invoices settled" : `${pendingInvoices.length === 1 ? "1 awaiting payment" : `${pendingInvoices.length} awaiting payment`}`}
        </span>
      </Link>}
      {role === "admin" && <Link href="/requests" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Open Leads</small>
          <Inbox size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" />
        </div>
        <strong>{openLeadCount}</strong>
        <span className="overview-summary-subtext">
          {`${openLeadCount} awaiting conversion`}
        </span>
      </Link>}
      {(role === "employee" || role === "project_manager") && <>
        <Link href="/work" className="overview-summary-card"><div className="overview-summary-top"><small>In progress</small><Clock3 size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" /></div><strong>{inProgressCount}</strong><span className="overview-summary-subtext">Your active tasks</span></Link>
        <Link href="/work" className="overview-summary-card"><div className="overview-summary-top"><small>Completed tasks</small><Check size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" /></div><strong>{completedTaskCount}</strong><span className="overview-summary-subtext">Your finished work</span></Link>
      </>}
    </section>

    <section className="overview-project-section">
      <div className="overview-section-heading"><div><h2>Project overview</h2><p>{(role === "employee" || role === "project_manager") ? "Your assigned projects and task progress." : "Progress and current work across your active projects."}</p></div><Link className="text-link" href="/projects">View all projects <ArrowRight size={14} /></Link></div>
      {activeProjects.length === 0 ? <div className="panel overview-empty"><EmptyState icon={<BriefcaseBusiness size={22} />} title={(role === "employee" || role === "project_manager") ? "No assigned projects" : "No active projects"} description={(role === "employee" || role === "project_manager") ? "Projects assigned to you will appear here." : "Move an accepted lead into its project workspace to start tracking delivery."} action={role === "admin" ? <Link className="button button-quiet" href="/requests">Open requests <ArrowRight size={14} /></Link> : undefined} /></div> : <div className="overview-project-grid">{activeProjects.slice(0, 4).map((project) => {
        const projectTasks = (project.workItems ?? []).filter(task => canViewProjectTask(project, task, role, user?.id, employeeName));
        const complete = projectTasks.filter((task) => task.status === "DONE").length;
        const progress = projectTasks.length ? Math.round(complete / projectTasks.length * 100) : 0;
        return <Link href={`/projects/${project.id}`} className="panel overview-project-card" key={project.id}>
          <div className="overview-project-card-top">
            <span className={`company-pill company-${(project.operatingCompany ?? "Evecture").toLowerCase()}`} data-company={project.operatingCompany ?? "Evecture"}>
              {project.operatingCompany ?? "Evecture"}
            </span>
            <StatusBadge status={project.status} />
          </div>
          <h3 className="overview-project-title">{getProjectDisplayTitle(project)}</h3>
          <p className="overview-project-services">{getProjectDisplayServices(project) || "Project delivery"}</p>
          <div className="overview-progress-label">
            <span>Task progress</span>
            <strong>{progress}%</strong>
          </div>
          <div className="overview-progress-track">
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="overview-project-footer">
            <span className="overview-footer-stats">
              <ListTodo className="task-count-icon" size={16} strokeWidth={2} aria-hidden="true"/>
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

    <section className={`overview-lower-grid ${(role === "employee" || role === "project_manager") ? "employee-overview-lower" : ""}`}>
      <div className="panel overview-task-panel">
        <div className="overview-panel-heading">
          <div>
            <h2>Tasks</h2>
            <p>{(role === "employee" || role === "project_manager") ? "Your tasks to do and in progress" : "To do and in progress across active projects"}</p>
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
                  data-status={task.status}
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
      {role === "admin" && <div className="panel overview-request-panel"><div className="overview-panel-heading"><div><h2>Leads</h2><p>Latest incoming enquiries</p></div><Link className="text-link" href="/requests">Open leads <ArrowRight size={14} /></Link></div>
        {leads.length === 0 ? <div className="overview-inline-empty"><Inbox size={17} />No requests have been recorded yet.</div> : <div className="overview-request-list">{[...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((lead) => <Link href={`/requests#${lead.id}`} className="overview-request-row" key={lead.id}><span className="overview-task-indicator"><Inbox size={14} /></span><span className="overview-task-copy"><strong>{lead.fullName}</strong><small>{lead.companyName || "Individual enquiry"}</small></span><StatusBadge status={lead.status} /></Link>)}</div>}
      </div>}
    </section>
  </div>;
}
