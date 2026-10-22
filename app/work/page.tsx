"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRight, Check, ChevronDown, CircleAlert, Clock3, FileCheck2, Filter, MoreHorizontal, Plus, Search, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/app/_components/empty-state";
import { StatusBadge } from "@/app/_components/status-badge";
import { showToast } from "@/app/_components/toast-hub";
import { readProjects, type Project, type ProjectWorkItem, updateProject } from "@/lib/projects";

type TaskFilter = "ALL" | ProjectWorkItem["status"];
const filters: { value: TaskFilter; label: string }[] = [
  { value: "ALL", label: "All tasks" }, { value: "TO_DO", label: "To do" }, { value: "IN_PROGRESS", label: "In progress" },
  { value: "UNDER_REVIEW", label: "Review" }, { value: "BLOCKED", label: "Blocked" }, { value: "DONE", label: "Completed" },
];
const taskStatusLabels: Record<ProjectWorkItem["status"], string> = { TO_DO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", UNDER_REVIEW: "In review", DONE: "Completed" };
const priorityLabels: Record<ProjectWorkItem["priority"], string> = { P1: "Critical", P2: "High", P3: "Normal", P4: "Low" };

function updateTask(projectId: string, taskId: string, updates: Partial<ProjectWorkItem>) {
  const currentProjects = readProjects();
  const target = currentProjects.find((project) => project.id === projectId);
  if (!target) return;
  updateProject(projectId, { workItems: (target.workItems ?? []).map((task) => task.id === taskId ? { ...task, ...updates } : task) });
}

function avatarText(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "—";
}

export default function MyWorkPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignee, setAssignee] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sortOldestFirst, setSortOldestFirst] = useState(false);

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

  const allTasks = useMemo(() => projects.filter((project) => project.status === "ACTIVE").flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task }))), [projects]);
  const assignees = [...new Set(allTasks.map(({ task }) => task.assignee).filter(Boolean))].sort();
  const visibleTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allTasks.filter(({ project, task }) => {
      const matchesStatus = filter === "ALL" || task.status === filter;
      const matchesAssignee = !assignee || task.assignee === assignee;
      const matchesSearch = !needle || [task.title, task.assignee, task.kind, project.title, project.clientCompany, project.id].some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesAssignee && matchesSearch;
    }).sort((left, right) => (new Date(left.task.createdAt).getTime() - new Date(right.task.createdAt).getTime()) * (sortOldestFirst ? 1 : -1));
  }, [allTasks, assignee, filter, search, sortOldestFirst]);

  const inProgressCount = allTasks.filter(({ task }) => task.status === "IN_PROGRESS").length;
  const completedCount = allTasks.filter(({ task }) => task.status === "DONE").length;
  const overdueCount = allTasks.filter(({ task }) => task.status === "BLOCKED").length;

  function startTask(projectId: string, task: ProjectWorkItem) {
    const startTimer = window.confirm("Start work on this task? Choose OK to start its stopwatch.");
    updateTask(projectId, task.id, { status: "IN_PROGRESS", timerStartedAt: startTimer ? new Date().toISOString() : undefined, blockerReason: undefined });
    showToast({ message: "Task moved to In progress", actionLabel: "Undo", onAction: () => updateTask(projectId, task.id, { status: task.status, timerStartedAt: task.timerStartedAt, blockerReason: task.blockerReason }) });
  }

  function logHours(projectId: string, task: ProjectWorkItem) {
    const value = window.prompt("Hours to add to this task:");
    if (!value) return;
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0) return;
    updateTask(projectId, task.id, { loggedHours: task.loggedHours + hours });
    showToast({ message: `${hours}h logged to ${task.title}` });
  }

  function raiseBlocker(projectId: string, task: ProjectWorkItem) {
    const reason = window.prompt("What is blocking this task?");
    if (!reason?.trim()) return;
    updateTask(projectId, task.id, { status: "BLOCKED", blockerReason: reason.trim() });
    showToast({ message: "Task moved to Blocked", actionLabel: "Undo", onAction: () => updateTask(projectId, task.id, { status: task.status, blockerReason: task.blockerReason }) });
  }

  function markDone(projectId: string, task: ProjectWorkItem) {
    updateTask(projectId, task.id, { status: "DONE", timerStartedAt: undefined, revisionRequested: false });
    showToast({ message: "Task moved to Done", actionLabel: "Undo", onAction: () => updateTask(projectId, task.id, { status: task.status, timerStartedAt: task.timerStartedAt, revisionRequested: task.revisionRequested }) });
  }

  return <div className="page-content my-work-page task-management-page">
    <section className="welcome-row task-page-welcome"><div><div className="eyebrow"><span className="live-dot" />TEAM WORKSPACE</div><h1>Tasks</h1><p className="welcome-subtitle">Manage and track work across your active projects.</p></div><div className="task-page-actions"><label className="work-assignee-filter"><span>Assignee</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">All team members</option>{assignees.map((name) => <option key={name}>{name}</option>)}</select></label><Link className="button button-primary" href="/projects"><Plus size={15} />Add from project</Link></div></section>
    <section className="task-stats-grid" aria-label="Task summary">
      <button type="button" className={`task-stat-card ${filter === "ALL" ? "selected" : ""}`} onClick={() => setFilter("ALL")}><span className="task-stat-icon task-icon-blue"><FileCheck2 size={17} /></span><span className="task-stat-copy"><small>Total tasks</small><strong>{allTasks.length}</strong></span><span className="task-stat-note">Across active projects</span></button>
      <button type="button" className={`task-stat-card ${filter === "IN_PROGRESS" ? "selected" : ""}`} onClick={() => setFilter("IN_PROGRESS")}><span className="task-stat-icon task-icon-violet"><Clock3 size={17} /></span><span className="task-stat-copy"><small>In progress</small><strong>{inProgressCount}</strong></span><span className="task-stat-note">Currently being worked on</span></button>
      <button type="button" className={`task-stat-card ${filter === "DONE" ? "selected" : ""}`} onClick={() => setFilter("DONE")}><span className="task-stat-icon task-icon-green"><Check size={17} /></span><span className="task-stat-copy"><small>Completed</small><strong>{completedCount}</strong></span><span className="task-stat-note">Finished work items</span></button>
      <button type="button" className={`task-stat-card ${filter === "BLOCKED" ? "selected" : ""}`} onClick={() => setFilter("BLOCKED")}><span className="task-stat-icon task-icon-rose"><CircleAlert size={17} /></span><span className="task-stat-copy"><small>Blocked</small><strong>{overdueCount}</strong></span><span className="task-stat-note">Needs attention</span></button>
    </section>

    {allTasks.length === 0 ? <EmptyState icon={<FileCheck2 size={22} />} title="No dispatched work yet" description="Add a task from a project workspace to see it here." action={<Link className="button button-primary" href="/projects"><Plus size={14} />Open projects</Link>} /> : <section className="panel task-table-panel">
      <div className="task-table-heading"><div><h2>All tasks</h2><p>{visibleTasks.length} of {allTasks.length} tasks</p></div><div className="task-table-tools"><label className="task-table-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks and projects" /></label><label className="task-filter-select"><Filter size={14} /><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter tasks by status">{filters.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><ChevronDown size={13} /></label><button className="task-sort-button" type="button" onClick={() => setSortOldestFirst((value) => !value)} aria-label={`Sort ${sortOldestFirst ? "newest" : "oldest"} first`}><ArrowDownUp size={15} /></button></div></div>
      <div className="task-list-tabs" role="tablist" aria-label="Task status">{filters.map((item) => <button type="button" key={item.value} role="tab" aria-selected={filter === item.value} className={filter === item.value ? "active" : ""} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === "ALL" ? allTasks.length : allTasks.filter(({ task }) => task.status === item.value).length}</span></button>)}</div>
      {visibleTasks.length === 0 ? <div className="task-table-empty">No tasks match these filters.</div> : <div className="task-table-scroll"><table className="task-table"><thead><tr><th className="task-check-col"><span className="sr-only">Task status</span></th><th>Task name</th><th>Project</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visibleTasks.map(({ project, task }) => {
        const progress = task.status === "DONE" ? 100 : task.estimatedHours > 0 ? Math.min(100, Math.round(task.loggedHours / task.estimatedHours * 100)) : 0;
        return <tr className={task.revisionRequested ? "task-row-revision" : ""} key={`${project.id}-${task.id}`}>
          <td className="task-check-col"><span className={`task-row-check ${task.status === "DONE" ? "checked" : ""}`}>{task.status === "DONE" && <Check size={11} />}</span></td>
          <td className="task-name-cell"><strong>{task.title}</strong><small>{task.kind.replaceAll("_", " ")}{task.revisionRequested ? " · Revision requested" : ""}</small><span className="task-progress-line"><i style={{ width: `${progress}%` }} /></span></td>
          <td><Link className="task-project-link" href={`/projects/${project.id}`}><strong>{project.title}</strong><small className="mono-meta">{project.id}</small></Link></td>
          <td><span className="task-assignee"><i>{avatarText(task.assignee)}</i><span>{task.assignee || "Unassigned"}</span></span></td>
          <td><StatusBadge status={task.priority}>{priorityLabels[task.priority]}</StatusBadge></td>
          <td><StatusBadge status={task.status}>{taskStatusLabels[task.status]}</StatusBadge></td>
          <td className="task-created-cell">{new Date(task.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
          <td><details className="task-action-menu"><summary aria-label={`Actions for ${task.title}`}><MoreHorizontal size={17} /></summary><div className="task-action-popover">{task.status === "DONE" ? <span className="task-action-muted">Completed</span> : <>{task.status !== "IN_PROGRESS" && <button type="button" onClick={() => startTask(project.id, task)}><ArrowRight size={13} />Start work</button>}{(task.status === "IN_PROGRESS" || task.status === "UNDER_REVIEW") && <button type="button" onClick={() => logHours(project.id, task)}><Clock3 size={13} />Log time</button>}{task.status !== "BLOCKED" && <button type="button" onClick={() => raiseBlocker(project.id, task)}><ShieldAlert size={13} />Raise blocker</button>}<button type="button" onClick={() => markDone(project.id, task)}><Check size={13} />Mark complete</button></>}</div></details></td>
        </tr>;
      })}</tbody></table></div>}
      <footer className="task-table-footer"><span>Showing {visibleTasks.length} tasks</span><span>Task changes sync automatically</span></footer>
    </section>}
    <p className="storage-note">Task assignments and project details are managed in each project workspace.</p>
  </div>;
}
