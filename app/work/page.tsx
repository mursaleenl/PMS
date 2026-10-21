"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, FileCheck2, ShieldAlert } from "lucide-react";
import { readProjects, type Project, type ProjectWorkItem, updateProject } from "@/lib/projects";

function updateTask(projects: Project[], projectId: string, taskId: string, updates: Partial<ProjectWorkItem>) {
  const target = projects.find((project) => project.id === projectId);
  if (!target) return;
  updateProject(projectId, { workItems: (target.workItems ?? []).map((task) => task.id === taskId ? { ...task, ...updates } : task) });
}

export default function MyWorkPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignee, setAssignee] = useState("");

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

  const allTasks = projects.flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task })));
  const assignees = [...new Set(allTasks.map(({ task }) => task.assignee).filter(Boolean))].sort();
  const visible = assignee ? allTasks.filter(({ task }) => task.assignee === assignee) : allTasks;
  const urgent = visible.filter(({ task }) => task.status !== "DONE" && (task.status === "BLOCKED" || task.priority === "P1"));
  const inProgress = visible.filter(({ task }) => task.status === "IN_PROGRESS" || task.status === "UNDER_REVIEW");
  const nextQueue = visible.filter(({ task }) => task.status === "TO_DO" && task.priority !== "P1");

  function startTask(projectId: string, task: ProjectWorkItem) {
    const startTimer = window.confirm("Start work on this task? Choose OK to start its stopwatch.");
    updateTask(projects, projectId, task.id, { status: "IN_PROGRESS", timerStartedAt: startTimer ? new Date().toISOString() : undefined, blockerReason: undefined });
  }

  function logHours(projectId: string, task: ProjectWorkItem) {
    const value = window.prompt("Hours to add to this task:");
    if (!value) return;
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0) return;
    updateTask(projects, projectId, task.id, { loggedHours: task.loggedHours + hours });
  }

  function raiseBlocker(projectId: string, task: ProjectWorkItem) {
    const reason = window.prompt("What is blocking this task?");
    if (reason?.trim()) updateTask(projects, projectId, task.id, { status: "BLOCKED", blockerReason: reason.trim() });
  }

  function renderTask(item: { project: Project; task: ProjectWorkItem }, actions: "start" | "working") {
    const { project, task } = item;
    return <article className={`work-queue-card ${task.revisionRequested ? "revision-requested" : ""}`} key={`${project.id}-${task.id}`}>
      <div className="work-queue-card-top"><span className={`work-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><Link href={`/projects/${project.id}`}>{project.id} · {project.title}<ArrowRight size={12}/></Link></div>
      <h3>{task.title}</h3><p className="work-queue-meta">{task.kind.replaceAll("_", " ")} · {task.assignee} · {task.estimatedHours}h estimated{task.loggedHours ? ` · ${task.loggedHours}h logged` : ""}</p>
      {task.revisionRequested && <div className="revision-flag"><strong>Revision requested</strong><span>{task.reviewNotes}</span></div>}
      {task.status === "BLOCKED" && <div className="blocker-note"><ShieldAlert size={13}/>{task.blockerReason || "Blocked"}</div>}
      <div className="work-queue-actions">{actions === "start" && <button className="button button-primary" type="button" onClick={() => startTask(project.id, task)}><ArrowRight size={13}/>Start work</button>}{actions === "working" && <><button className="button button-quiet" type="button" onClick={() => logHours(project.id, task)}>Log time</button><button className="button button-quiet" type="button" onClick={() => raiseBlocker(project.id, task)}>Raise blocker</button><button className="button button-primary" type="button" onClick={() => updateTask(projects, project.id, task.id, { status: "DONE", timerStartedAt: undefined, revisionRequested: false })}><Check size={13}/>Mark done</button></>}</div>
    </article>;
  }

  return <div className="page-content my-work-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>TEAM WORKSPACE</div><h1>My work queue</h1><p className="welcome-subtitle">Assigned tasks, time, and blockers.</p></div><label className="work-assignee-filter">Team member<select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">All assignees</option>{assignees.map((name) => <option key={name}>{name}</option>)}</select></label></section>
    {allTasks.length === 0 ? <section className="panel pipeline-empty projects-empty"><span className="empty-icon"><FileCheck2 size={22}/></span><h2>No dispatched work yet</h2><p>Dispatch a task from a project room to add it to the team queue.</p><Link className="button button-primary" href="/projects">Open project portfolio <ArrowRight size={15}/></Link></section> : <>
      <p className="work-identity-note">The team member filter is used until employee sign-in and role based identity are connected.</p>
      <div className="work-queue-columns">
        <section className="work-queue-section work-urgent"><header><div><span className="queue-section-dot urgent-dot"/><h2>Urgent / blockers</h2></div><span>{urgent.length}</span></header>{urgent.length ? urgent.map((item) => renderTask(item, item.task.status === "IN_PROGRESS" || item.task.status === "UNDER_REVIEW" ? "working" : "start")) : <p className="queue-empty">No urgent tasks or blockers.</p>}</section>
        <section className="work-queue-section work-active"><header><div><span className="queue-section-dot active-dot"/><h2>Active in progress</h2></div><span>{inProgress.length}</span></header>{inProgress.length ? inProgress.map((item) => renderTask(item, "working")) : <p className="queue-empty">No active tasks.</p>}</section>
        <section className="work-queue-section work-next"><header><div><span className="queue-section-dot next-dot"/><h2>Next in queue</h2></div><span>{nextQueue.length}</span></header>{nextQueue.length ? nextQueue.map((item) => renderTask(item, "start")) : <p className="queue-empty">No queued tasks.</p>}</section>
      </div>
    </>}
    <p className="storage-note">Task updates sync across open tabs in this browser. Cross-device real-time sync requires a shared backend.</p>
  </div>;
}
