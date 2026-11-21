"use client";
import { getProjectLogoSrc } from "@/lib/project-logo";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";
import { ProjectPortfolioCard } from "@/app/_components/project-portfolio-card";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarDays, Check, Clock3, Inbox, ListTodo, Plus, ReceiptText } from "lucide-react";
import { type Lead, readLeads } from "@/lib/leads";
import { type Project, readProjects, getTaskAssigneeLabel, getProjectDisplayTitle, getProjectDisplayServices, getProjectClientLabel, isProjectAssignedToUser, isTaskAssignedToUser, canViewProjectTask, type ProjectWorkItem } from "@/lib/projects";
import { readInvoices, type StoredInvoice } from "@/lib/invoices";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { GENERAL_TASKS_ID, readGeneralTasks } from "@/lib/general-tasks";
import { TaskCalendar } from "@/app/_components/task-calendar";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function OverviewPage() {
  const { role, user, members } = useWorkspaceAuth();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [generalTasks, setGeneralTasks] = useState<ProjectWorkItem[]>([]);
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  useEffect(() => {
    const refresh = () => {
      setLeads(readLeads());
      setProjects(readProjects());
      setGeneralTasks(readGeneralTasks());
      setInvoices(readInvoices());
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:general-tasks-updated", refresh);
    window.addEventListener("evecture:invoices-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("evecture:general-tasks-updated", refresh);
      window.removeEventListener("evecture:invoices-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const employeeName = (members.find((member) => member.user_id === user?.id)?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim().toLowerCase();
  const visibleProjects = (role === "employee") ? projects.filter((project) => isProjectAssignedToUser(project, user?.id, employeeName)) : projects;
  const activeProjects = visibleProjects.filter((project) => project.status !== "COMPLETED" && project.status !== "AMC");
  const tasks = useMemo(() => visibleProjects.flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task }))).filter(({ project, task }) => canViewProjectTask(project, task, role, user?.id, employeeName)), [visibleProjects, role, user?.id, employeeName]);
  const calendarTasks = [
    ...tasks.filter(({ task }) => role === "admin" || isTaskAssignedToUser(task, user?.id, employeeName))
      .map(({ project, task }) => ({ projectId: project.id, projectTitle: getProjectDisplayTitle(project), organization: getProjectClientLabel(project), task })),
    ...generalTasks.filter(task => role === "admin" || isTaskAssignedToUser(task, user?.id, employeeName))
      .map(task => ({ projectId: GENERAL_TASKS_ID, projectTitle: "General task", task })),
  ];
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
  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => inv.status === "SENT");
  }, [invoices]);
  const dashboardLeads = [...leads].sort((a, b) =>
    Number(b.status === "NEW") - Number(a.status === "NEW") ||
    (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
  ).slice(0, 6);
  const openLeadCount = leads.filter((lead) => ["NEW", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status)).length;
  return <div className={`page-content overview-dashboard${(role === "employee") ? " employee-dashboard" : ""}`}>
    <section className="welcome-row">
      <div><h1>Dashboard</h1></div>
      <div className="welcome-actions">
        {user?.id && role !== "client" && <button type="button" className="button button-quiet"
          aria-expanded={calendarOpen} aria-controls="dashboard-calendar" onClick={() => setCalendarOpen(open => !open)}>
          <CalendarDays size={14} aria-hidden="true" /> Calendar
        </button>}
        <Link className="button button-quiet" href="/projects">
          <BriefcaseBusiness size={14} strokeWidth={2} />
          Projects
        </Link>
        {(role === "admin" || role === "project_manager") && <Link className="button button-primary" href="/requests/new">
          <Plus size={14} strokeWidth={2.5} />
          Log enquiry
        </Link>}
      </div>
    </section>

    {user?.id && role !== "client" && <div id="dashboard-calendar" hidden={!calendarOpen}>
      {calendarOpen && <TaskCalendar key={user.id} tasks={calendarTasks} workspaceWide={role === "admin"} />}
    </div>}
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
      </Link>
      {(role === "admin" || role === "project_manager") && <Link href="/invoices" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Pending invoices</small>
          <ReceiptText size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" />
        </div>
        <strong>{pendingInvoices.length}</strong>
        <span className="overview-summary-subtext">
          {pendingInvoices.length === 0 ? "No invoices awaiting payment" : `${pendingInvoices.length} awaiting payment`}
        </span>
      </Link>}
      {(role === "admin" || role === "project_manager") && <Link href="/requests" className="overview-summary-card">
        <div className="overview-summary-top">
          <small>Open Leads</small>
          <Inbox size={24} strokeWidth={1.6} className="overview-summary-icon" aria-hidden="true" />
        </div>
        <strong>{openLeadCount}</strong>
        <span className="overview-summary-subtext">
          {`${openLeadCount} awaiting conversion`}
        </span>
      </Link>}
    </section>

    <section className="overview-project-section">
      <div className="overview-section-heading"><div><h2>Project overview</h2></div><Link className="text-link" href="/projects">View all projects <ArrowRight size={14} /></Link></div>
      {activeProjects.length === 0 ? <div className="panel overview-empty"><EmptyState icon={<BriefcaseBusiness size={22} />} title={(role === "employee") ? "No assigned projects" : "No active projects"} action={(role === "admin" || role === "project_manager") ? <Link className="button button-quiet" href="/projects">Open projects <ArrowRight size={14} /></Link> : undefined} /></div> : <div className="project-portfolio">{activeProjects.slice(0, 4).map(project => (
        <ProjectPortfolioCard key={project.id} project={project} role={role} userId={user?.id} employeeName={employeeName} heading="h3" />
      ))}</div>}
    </section>

    <section className={`overview-lower-grid ${(role === "employee") ? "employee-overview-lower" : ""}`}>
      <div className="panel overview-task-panel">
        <div className="overview-panel-heading">
          <div>
            <h2>Tasks</h2>
            <p>{(role === "employee") ? "Your tasks to do and in progress" : "To do and in progress across active projects"}</p>
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
                  className={`overview-task-indicator${getProjectLogoSrc(project) ? " overview-task-project-logo" : ""}`}
                  data-status={task.status}
                  title={task.status === "IN_PROGRESS" ? "In progress" : "To do"}
                >
                  {getProjectLogoSrc(project) ? <ProjectCardLogo src={project.logoDataUrl} projectType={project.projectType} title={getProjectDisplayTitle(project)} /> : task.status === "IN_PROGRESS" ? <Clock3 size={14} /> : <ListTodo size={14} />}
                </span>
                <span className="overview-task-copy">
                  <strong>{task.title}</strong>
                  <small>{getProjectDisplayTitle(project)}{getProjectDisplayServices(project) ? ` - ${getProjectDisplayServices(project)}` : ""} · {getTaskAssigneeLabel(task) || "Unassigned"}</small>
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
      {(role === "admin" || role === "project_manager") && <div className="panel overview-request-panel"><div className="overview-panel-heading"><div><h2>Leads</h2></div><Link className="text-link" href="/requests">Open leads <ArrowRight size={14} /></Link></div>
        {leads.length === 0 ? <div className="overview-inline-empty"><Inbox size={17} />No requests have been recorded yet.</div> : <div className="overview-request-list">{dashboardLeads.map((lead) => <Link href={`/requests#${lead.id}`} className="overview-request-row" key={lead.id}><span className="overview-task-indicator"><Inbox size={14} /></span><span className="overview-task-copy"><strong>{lead.fullName}</strong><small>{lead.companyName || "Individual enquiry"}</small></span><StatusBadge status={lead.status} /></Link>)}</div>}
      </div>}
    </section>
  </div>;
}
