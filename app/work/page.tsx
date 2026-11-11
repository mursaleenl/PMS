"use client";

import {GENERAL_TASKS_ID,generalTaskContext,readGeneralTasks,updateGeneralTask} from "@/lib/general-tasks";
import {EditTaskDialog} from "@/app/_components/edit-task-dialog";
import {TaskDeadline} from "@/app/_components/task-deadline";
import Link from "next/link";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";
import { AssignTaskDialog } from "@/app/_components/assign-task-dialog";
import { BlockTaskDialog } from "@/app/_components/block-task-dialog";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ArrowRight, Check, ChevronDown, CircleAlert, FileCheck2, Filter, GripVertical, Kanban, List, MoreHorizontal, Plus, Search, ShieldAlert, Users } from "lucide-react";
import { EmptyState } from "@/app/_components/empty-state";
import { StatusBadge } from "@/app/_components/status-badge";
import { isTaskAssignedToUser, getTaskAssignees, getTaskAssigneeLabel, getProjectDisplayTitle, getProjectDisplayServices, canViewProjectTask, readProjects, type Project, type ProjectWorkItem, updateProject } from "@/lib/projects";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

import { useAssignableUsers } from "@/lib/assignees";

type TaskFilter = "ALL" | ProjectWorkItem["status"];
const filters: { value: TaskFilter; label: string }[] = [
  { value: "TO_DO", label: "To do" }, { value: "IN_PROGRESS", label: "In progress" },
  { value: "UNDER_REVIEW", label: "Review" }, { value: "BLOCKED", label: "Blocked" }, { value: "DONE", label: "Completed" },
  { value: "ALL", label: "All tasks" },
];
const taskStatusLabels: Record<ProjectWorkItem["status"], string> = { TO_DO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", UNDER_REVIEW: "In review", DONE: "Completed" };
const priorityLabels: Record<ProjectWorkItem["priority"], string> = { P1: "Critical", P2: "High", P3: "Normal", P4: "Low" };

type VisibleTaskStatus = ProjectWorkItem["status"];
const kanbanColumns: { status: VisibleTaskStatus; label: string }[] = [
  { status: "TO_DO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "UNDER_REVIEW", label: "In review" },
  { status: "BLOCKED", label: "Blocked" },
  { status: "DONE", label: "Completed" },
];

function saveTaskChanges(projectId: string, taskId: string, updates: Partial<ProjectWorkItem>) {
  if(projectId===GENERAL_TASKS_ID){updateGeneralTask(taskId,updates);return;}
  const currentProjects = readProjects();
  const target = currentProjects.find((project) => project.id === projectId);
  if (!target) return;
  updateProject(projectId, { workItems: (target.workItems ?? []).map((task) => task.id === taskId ? { ...task, ...updates } : task) });
}

export default function MyWorkPage() {
  const {role,user,members}=useWorkspaceAuth();
  const { users: assignableUsers } = useAssignableUsers();
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [generalTasks,setGeneralTasks]=useState<ProjectWorkItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignee, setAssignee] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("TO_DO");
  const [search, setSearch] = useState("");
  const [sortOldestFirst, setSortOldestFirst] = useState(false);
  const [viewMode, setViewMode] = useState<"LIST" | "BOARD">("LIST");
  const [draggingItem, setDraggingItem] = useState<{ projectId: string; taskId: string } | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<VisibleTaskStatus | null>(null);
  const [editingTask,setEditingTask]=useState<{projectId:string;task:ProjectWorkItem}|null>(null);
  const [blockingTask, setBlockingTask] = useState<{ projectId: string; task: ProjectWorkItem } | null>(null);

  function updateTask(projectId: string, taskId: string, updates: Partial<ProjectWorkItem>) {
    saveTaskChanges(projectId, taskId, updates);
    setProjects(readProjects());
    // Keep the changed task visible when moving it out of a filtered list.
    if (viewMode === "LIST" && updates.status && filter !== "ALL") {
      setFilter(updates.status);
    }
  }

  useEffect(() => {
    const refresh = () => {setProjects(readProjects());setGeneralTasks(readGeneralTasks());};
    refresh();
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("evecture:general-tasks-updated",refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("evecture:general-tasks-updated",refresh);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const openMenus = document.querySelectorAll<HTMLDetailsElement>(".task-action-menu[open]");
      openMenus.forEach((menu) => {
        if (!menu.contains(event.target as Node)) {
          menu.removeAttribute("open");
        }
      });
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const employeeName=(members.find((member)=>member.user_id===user?.id)?.display_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"").trim().toLowerCase();
  const allTasks = useMemo(() => projects.flatMap((project) => (project.workItems ?? []).map((task) => ({ project, task }))).filter(({project, task}) => canViewProjectTask(project, task, role, user?.id, employeeName)).concat(generalTasks.filter(task=>role==="admin"||role==="project_manager"||isTaskAssignedToUser(task,user?.id,employeeName)).map(task=>({project:generalTaskContext,task}))), [projects,generalTasks,role,user?.id,employeeName]);
  const canEditTask = role === "admin" || role === "project_manager";
  const canCreateTask = canEditTask || role === "employee";
  const assignees = [...new Set([
    ...assignableUsers.map((member) => member.name),
    ...allTasks.flatMap(({ task }) => getTaskAssignees(task).map(person=>person.name)),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const selectedAssigneeId = assignableUsers.find((member) => member.name === assignee)?.id;

  const visibleTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allTasks.filter(({ project, task }) => {
      const matchesStatus = filter === "ALL" || task.status === filter;
      const matchesAssignee = !assignee || getTaskAssignees(task).some(person=>selectedAssigneeId&&person.userId?person.userId===selectedAssigneeId:person.name.trim().toLowerCase()===assignee.trim().toLowerCase());
      const matchesSearch = !needle || [task.title, getTaskAssigneeLabel(task), task.description||"", task.kind, project.title, project.clientCompany, project.id].some((value) => value.toLowerCase().includes(needle));
      return matchesStatus && matchesAssignee && matchesSearch;
    }).sort((left, right) => (new Date(left.task.createdAt).getTime() - new Date(right.task.createdAt).getTime()) * (sortOldestFirst ? 1 : -1));
  }, [allTasks, assignee, selectedAssigneeId, filter, search, sortOldestFirst]);

  const boardTasksByColumn = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = allTasks.filter(({ project, task }) => {
      const matchesAssignee = !assignee || getTaskAssignees(task).some(person=>selectedAssigneeId&&person.userId?person.userId===selectedAssigneeId:person.name.trim().toLowerCase()===assignee.trim().toLowerCase());
      const matchesSearch = !needle || [task.title, getTaskAssigneeLabel(task), task.description||"", task.kind, project.title, project.clientCompany, project.id].some((value) => value.toLowerCase().includes(needle));
      return matchesAssignee && matchesSearch;
    }).sort((left, right) => (new Date(left.task.createdAt).getTime() - new Date(right.task.createdAt).getTime()) * (sortOldestFirst ? 1 : -1));

    const map: Record<VisibleTaskStatus, { project: Project; task: ProjectWorkItem }[]> = {
      TO_DO: [],
      IN_PROGRESS: [],
      UNDER_REVIEW: [],
      BLOCKED: [],
      DONE: [],
    };

    filtered.forEach((item) => {
      if (item.task.status === "TO_DO") map.TO_DO.push(item);
      else if (item.task.status === "IN_PROGRESS") map.IN_PROGRESS.push(item);
      else if (item.task.status === "UNDER_REVIEW") map.UNDER_REVIEW.push(item);
      else if (item.task.status === "BLOCKED") map.BLOCKED.push(item);
      else if (item.task.status === "DONE") map.DONE.push(item);
    });

    return map;
  }, [allTasks, assignee, selectedAssigneeId, search, sortOldestFirst]);

  const inProgressCount = allTasks.filter(({ task }) => task.status === "IN_PROGRESS").length;
  const completedCount = allTasks.filter(({ task }) => task.status === "DONE").length;
  const blockedCount = allTasks.filter(({ task }) => task.status === "BLOCKED").length;

  function handleDragStart(event: React.DragEvent, projectId: string, taskId: string) {
    event.dataTransfer.setData("text/plain", `${projectId}:${taskId}`);
    event.dataTransfer.effectAllowed = "move";
    setDraggingItem({ projectId, taskId });
  }

  function handleDragEnd() {
    setDraggingItem(null);
    setDragOverColumn(null);
  }

  function handleColumnDragOver(event: React.DragEvent, status: VisibleTaskStatus) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  }

  function handleColumnDrop(event: React.DragEvent, targetStatus: VisibleTaskStatus) {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    let pId = draggingItem?.projectId;
    let tId = draggingItem?.taskId;
    if (raw && raw.includes(":")) {
      const [dp, dt] = raw.split(":");
      pId = dp;
      tId = dt;
    }
    if (!pId || !tId) {
      handleDragEnd();
      return;
    }
    const current = allTasks.find((i) => i.project.id === pId && i.task.id === tId);
    if (current && current.task.status !== targetStatus) {
      // End the native drag before React moves the card to another parent.
      // Browsers can otherwise retain the hidden source element during the drop.
      handleDragEnd();
      const projectId = pId;
      requestAnimationFrame(() => {
        changeTaskStatus(projectId, current.task, targetStatus);
      });
      return;
    }
    handleDragEnd();
  }

  function startTask(projectId: string, task: ProjectWorkItem) {
    updateTask(projectId, task.id, { status: "IN_PROGRESS", blockerReason: undefined });
  }

  function changeTaskStatus(projectId: string, task: ProjectWorkItem, status: ProjectWorkItem["status"]) {
    if (status === task.status || !kanbanColumns.some(column => column.status === status)) return;
    if (status === "BLOCKED") { setBlockingTask({projectId, task}); return; }
    updateTask(projectId, task.id, {
      status, blockerReason: undefined,
      revisionRequested: status === "DONE" || status === "TO_DO" ? false : task.revisionRequested,
    });
  }

  function raiseBlocker(projectId: string, task: ProjectWorkItem) {
    setBlockingTask({projectId, task});
  }

  function markDone(projectId: string, task: ProjectWorkItem) {
    updateTask(projectId, task.id, { status: "DONE", revisionRequested: false });
  }

  function toggleTaskDone(projectId: string, task: ProjectWorkItem) {
    if (task.status === "DONE") {
      updateTask(projectId, task.id, { status: "TO_DO", revisionRequested: false });
    } else {
      markDone(projectId, task);
    }
  }

  const allVisibleDone = visibleTasks.length > 0 && visibleTasks.every(({ task }) => task.status === "DONE");

  function toggleAllVisibleTasks() {
    if (visibleTasks.length === 0) return;
    if (allVisibleDone) {
      visibleTasks.forEach(({ project, task }) => {
        updateTask(project.id, task.id, { status: "TO_DO", revisionRequested: false });
      });
    } else {
      visibleTasks.forEach(({ project, task }) => {
        if (task.status !== "DONE") {
          updateTask(project.id, task.id, { status: "DONE", revisionRequested: false });
        }
      });
    }
  }

  return <div className="page-content my-work-page task-management-page">
    <section className="welcome-row task-page-welcome">
      <div>
        <h1>Tasks</h1>
        <p className="welcome-subtitle">Manage and track assigned work across projects.</p>
      </div>
      <div className="task-page-actions">
        {(role !== "employee") && <>
        <div className="work-assignee-filter">
          <span className="filter-label">Assignee</span>
          <div className="filter-select-wrap">
            <Users size={14} className="filter-icon" />
            <select value={assignee} onChange={(event) => setAssignee(event.target.value)} aria-label="Filter by assignee">
              <option value="">All team members</option>
              {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <ChevronDown size={13} className="select-chevron" />
          </div>
        </div>
        </>}
        {canCreateTask&&<button className="button button-primary" type="button" onClick={() => setShowAssignTask(true)}><Plus size={15} />{role==="employee"?"Create task":"Assign task"}</button>}
      </div>
    </section>

    <section className="task-stats-grid" aria-label="Task summary">
      <button type="button" className={`task-stat-card ${filter === "ALL" ? "selected" : ""}`} onClick={() => { setFilter("ALL"); setViewMode("LIST"); }}>
        <div className="task-stat-copy">
          <small>Total tasks</small>
          <strong>{allTasks.length}</strong>
        </div>
        <span className="task-stat-note">Project and general tasks</span>
      </button>
      <button type="button" className={`task-stat-card ${filter === "IN_PROGRESS" ? "selected" : ""}`} onClick={() => { setFilter("IN_PROGRESS"); setViewMode("LIST"); }}>
        <div className="task-stat-copy">
          <small>In progress</small>
          <strong>{inProgressCount}</strong>
        </div>
        <span className="task-stat-note">Currently being worked on</span>
      </button>
      <button type="button" className={`task-stat-card ${filter === "DONE" ? "selected" : ""}`} onClick={() => { setFilter("DONE"); setViewMode("LIST"); }}>
        <div className="task-stat-copy">
          <small>Completed</small>
          <strong>{completedCount}</strong>
        </div>
        <span className="task-stat-note">Finished work items</span>
      </button>
      <button type="button" className={`task-stat-card ${filter === "BLOCKED" ? "selected" : ""}`} onClick={() => { setFilter("BLOCKED"); setViewMode("LIST"); }}>
        <div className="task-stat-copy">
          <small>Blocked</small>
          <strong>{blockedCount}</strong>
        </div>
        <span className="task-stat-note">Needs attention</span>
      </button>
    </section>

    {allTasks.length === 0 ? <EmptyState icon={<FileCheck2 size={22} />} title={(role === "employee") ? "No tasks assigned" : "No tasks yet"} description={(role === "employee") ? "View your assigned work or create a task for yourself." : "Create a general task or assign work to a project."} action={<Link className="button button-primary" href="/projects"><Plus size={14} />Open projects</Link>} /> : <section className="panel task-table-panel">
      <div className="task-table-heading">
        <div>
          <h2>All tasks</h2>
          <p>{viewMode === "LIST" ? `${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"} shown | ${allTasks.length} total` : `${Object.values(boardTasksByColumn).flat().length} tasks shown on board Â· ${allTasks.length} total`}</p>
        </div>
        <div className="task-table-tools">
          <div className="task-view-switcher" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-switcher-button ${viewMode === "LIST" ? "active" : ""}`}
              onClick={() => setViewMode("LIST")}
              title="List view"
              aria-pressed={viewMode === "LIST"}
            >
              <List size={14} />
              <span>List</span>
            </button>
            <button
              type="button"
              className={`view-switcher-button ${viewMode === "BOARD" ? "active" : ""}`}
              onClick={() => setViewMode("BOARD")}
              title="Kanban Board view"
              aria-pressed={viewMode === "BOARD"}
            >
              <Kanban size={14} />
              <span>Board</span>
            </button>
          </div>

          <label className="task-table-search">
            <Search size={14} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, projects, assignees..." />
          </label>
          {viewMode === "LIST" && (
            <label className="task-filter-select">
              <Filter size={14} />
              <select value={filter} onChange={(event) => setFilter(event.target.value as TaskFilter)} aria-label="Filter tasks by status">
                {filters.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
              <ChevronDown size={13} />
            </label>
          )}
          <button className="task-sort-button" type="button" onClick={() => setSortOldestFirst((value) => !value)} title={`Sort ${sortOldestFirst ? "newest" : "oldest"} first`}>
            <ArrowDownUp size={15} />
          </button>
        </div>
      </div>

      {viewMode === "LIST" ? (
        <>
          <div className="task-list-tabs" role="tablist" aria-label="Task status">
            {filters.map((item) => {
              const count = item.value === "ALL" ? allTasks.length : allTasks.filter(({ task }) => task.status === item.value).length;
              return (
                <button
                  type="button"
                  key={item.value}
                  role="tab"
                  aria-selected={filter === item.value}
                  className={filter === item.value ? "active" : ""}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                  <span className="tab-count-pill">{count}</span>
                </button>
              );
            })}
          </div>

          {visibleTasks.length === 0 ? (
            <div className="task-table-empty">
              <div className="task-empty-icon-wrap"><FileCheck2 size={28} /></div>
              <h3>No tasks match your filters</h3>
              <p>Try clearing your search query or switching to another status tab.</p>
              {(search || filter !== "ALL" || assignee) && (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => { setSearch(""); setFilter("ALL"); setAssignee(""); }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="task-table-scroll">
              <table className="task-table">
                <thead>
                  <tr>
                    <th className="task-check-col">
                      {(role !== "employee") && <>
                      <button
                        type="button"
                        className={`task-row-check ${allVisibleDone ? "checked" : ""}`}
                        title={allVisibleDone ? "Mark all incomplete" : "Mark all complete"}
                        aria-label={allVisibleDone ? "Mark all incomplete" : "Mark all complete"}
                        role="checkbox"
                        aria-checked={allVisibleDone}
                        onClick={toggleAllVisibleTasks}
                      >
                        {allVisibleDone && <Check size={11} strokeWidth={2.5} />}
                      </button>
                      </>}
                    </th>
                    <th>Task name</th>
                    <th>Project</th>
                    <th>Assignee</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="task-actions-col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map(({ project, task }) => {
                    return (
                      <tr className={task.revisionRequested ? "task-row-revision" : ""} key={`${project.id}-${task.id}`}>
                        <td className="task-check-col">
                          <button
                            type="button"
                            className={`task-row-check ${task.status === "DONE" ? "checked" : ""}`}
                            title={task.status === "DONE" ? "Mark incomplete" : "Mark complete"}
                            aria-label={task.status === "DONE" ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
                            role="checkbox"
                            aria-checked={task.status === "DONE"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTaskDone(project.id, task);
                            }}
                          >
                            {task.status === "DONE" && <Check size={11} strokeWidth={2.5} />}
                          </button>
                        </td>
                        <td className="task-name-cell">
                          <div className="task-name-inner">
                            <strong>{task.title}</strong>
                            <TaskDeadline deadline={task.deadline}/>
                            {task.description?.trim()&&<details className="task-description"><summary>Description</summary><p>{task.description}</p></details>}
                            <div className="task-meta-row">
                              <span className="task-kind-pill">{task.kind.replaceAll("_", " ")}</span>
                              {task.revisionRequested && <span className="task-revision-pill">Revision requested</span>}
                            </div>
                            {task.status === "BLOCKED" && <div className="task-blocker-detail">{task.blockerReason && <span className="task-blocker-reason">{task.blockerReason}</span>}<button className="button button-quiet button-micro" type="button" onClick={() => raiseBlocker(project.id, task)}>{task.blockerReason ? "Edit reason" : "Add reason"}</button></div>}
                          </div>
                        </td>
                        <td className="task-project-cell">
                          {project.id===GENERAL_TASKS_ID?<span>General task</span>:<Link className="task-project-link" href={`/projects/${project.id}`}>
                            <span className="project-card-identity project-task-identity">
                              <ProjectCardLogo src={project.logoDataUrl} projectType={project.projectType} title={getProjectDisplayTitle(project)} />
                              <span className="project-task-copy"><strong>{getProjectDisplayTitle(project)}</strong>
                                {getProjectDisplayServices(project) && <span className="project-display-services">{getProjectDisplayServices(project)}</span>}
                                <small className="mono-meta">{project.id}</small>
                              </span>
                            </span>
                          </Link>}
                        </td>
                        <td className="task-assignee-cell">
                          {getTaskAssignees(task).length ? (
                            <span className="task-assignee-badge">
                              <Users size={12} />
                              <span>{getTaskAssigneeLabel(task)}</span>
                            </span>
                          ) : (
                            <span className="task-unassigned">Unassigned</span>
                          )}
                        </td>
                        <td><StatusBadge status={task.priority}>{priorityLabels[task.priority]}</StatusBadge></td>
                        <td><select className="task-status-select" aria-label={`Status for ${task.title}`} value={task.status} onChange={event => changeTaskStatus(project.id, task, event.target.value as ProjectWorkItem["status"])}>
                          {kanbanColumns.map(({status}) => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}
                        </select></td>
                        <td className="task-created-cell">{new Date(task.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td className="task-actions-col">
                          <details className="task-action-menu">
                            <summary aria-label={`Actions for ${task.title}`}><MoreHorizontal size={17} /></summary>
                            <div className="task-action-popover">
                              {canEditTask&&<button type="button" onClick={event=>{event.currentTarget.closest("details")?.removeAttribute("open");setEditingTask({projectId:project.id,task});}}>Edit task</button>}
                              {task.status === "DONE" ? (
                                <span className="task-action-muted">Completed</span>
                              ) : (
                                <>
                                  {task.status !== "IN_PROGRESS" && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.currentTarget.closest("details")?.removeAttribute("open");
                                        startTask(project.id, task);
                                      }}
                                    >
                                      <ArrowRight size={13} />Start work
                                    </button>
                                  )}
                                  {task.status !== "BLOCKED" && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.currentTarget.closest("details")?.removeAttribute("open");
                                        raiseBlocker(project.id, task);
                                      }}
                                    >
                                      <ShieldAlert size={13} />Raise blocker
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.currentTarget.closest("details")?.removeAttribute("open");
                                      markDone(project.id, task);
                                    }}
                                  >
                                    <Check size={13} />Mark complete
                                  </button>
                                </>
                              )}
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div className="task-kanban-board" role="region" aria-label="Tasks Kanban Board">
          {kanbanColumns.map(({ status, label }) => {
            const colTasks = boardTasksByColumn[status];
            const isOver = dragOverColumn === status;
            return (
              <div
                key={status}
                className={`task-kanban-column ${isOver ? "kanban-column-drag-over" : ""}`}
                onDragOver={(event) => handleColumnDragOver(event, status)}
                onDragEnter={(event) => { event.preventDefault(); setDragOverColumn(status); }}
                onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverColumn(null); }}
                onDrop={(event) => handleColumnDrop(event, status)}
              >
                <header className="task-kanban-column-header">
                  <div className="task-kanban-column-title">
                    <h3><StatusBadge status={status}>{label}</StatusBadge></h3>
                  </div>
                  <span className="task-kanban-column-count">{colTasks.length}</span>
                </header>

                <div className="task-kanban-column-body">
                  {colTasks.length === 0 ? (
                    <div className="task-kanban-empty">
                      <span>No tasks</span>
                      <small>Drop cards here to update status</small>
                    </div>
                  ) : (
                    colTasks.map(({ project, task }) => {
                      const isDragging = draggingItem?.projectId === project.id && draggingItem?.taskId === task.id;
                      return (
                        <article
                          key={`${project.id}-${task.id}`}
                          className={`task-kanban-card ${isDragging ? "is-dragging" : ""}`}
                          draggable
                          onDragStart={(event) => handleDragStart(event, project.id, task.id)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="task-kanban-card-top">
                            {project.id===GENERAL_TASKS_ID?<span className="task-kanban-project-pill">General task</span>:<Link
                              href={`/projects/${project.id}`}
                              className="task-kanban-project-pill"
                              title={`${getProjectDisplayTitle(project)} (${project.id})`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="project-card-identity project-task-identity">
                                <ProjectCardLogo src={project.logoDataUrl} projectType={project.projectType} title={getProjectDisplayTitle(project)} />
                                <span className="project-task-copy"><span className="project-pill-title">{getProjectDisplayTitle(project)}</span>
                                  {getProjectDisplayServices(project) && <span className="project-display-services">{getProjectDisplayServices(project)}</span>}
                                  <span className="project-pill-id">{project.id}</span>
                                </span>
                              </span>
                            </Link>}
                            <span className="drag-handle" title="Drag to reorder or update status">
                              <GripVertical size={13} />
                            </span>
                          </div>

                          <h3 className="task-kanban-card-title">{task.title}</h3>
                          <TaskDeadline deadline={task.deadline}/>
                          {task.description?.trim()&&<details className="task-description"><summary>Description</summary><p>{task.description}</p></details>}

                          {task.blockerReason && task.status === "BLOCKED" && (
                            <div className="task-kanban-blocker-note">
                              <CircleAlert size={12} />
                              <span>{task.blockerReason}</span>
                            </div>
                          )}

                          <div className="task-kanban-badges">
                            <span className="task-kind-pill">
                              {task.kind.replaceAll("_", " ")}
                            </span>
                            <StatusBadge status={task.priority}>
                              {priorityLabels[task.priority]}
                            </StatusBadge>
                            {task.revisionRequested && (
                              <span className="task-revision-pill">Revision</span>
                            )}
                          </div>

                          <div className="task-kanban-card-footer">
                            <div className="task-kanban-assignee">
                              <Users size={12} />
                              <span>{getTaskAssigneeLabel(task) || "Unassigned"}</span>
                            </div>

                            <div className="task-kanban-actions">
                              {canEditTask&&<button type="button" className="button button-quiet button-micro" onClick={event=>{event.stopPropagation();setEditingTask({projectId:project.id,task});}}>Edit task</button>}
                              {task.status === "BLOCKED" && <button type="button" className="button button-quiet button-micro" onClick={event => { event.stopPropagation(); raiseBlocker(project.id, task); }}>{task.blockerReason ? "Edit reason" : "Add reason"}</button>}
                              <button
                                type="button"
                                className={`task-card-quick-done ${task.status === "DONE" ? "checked" : ""}`}
                                title={task.status === "DONE" ? "Mark incomplete" : "Mark complete"}
                                aria-label={task.status === "DONE" ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
                                role="checkbox"
                                aria-checked={task.status === "DONE"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTaskDone(project.id, task);
                                }}
                              >
                                {task.status === "DONE" && <Check size={11} strokeWidth={2.5} />}
                              </button>
                              {task.status === "BLOCKED" ? (
                                <button
                                  type="button"
                                  className="button button-quiet button-micro"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateTask(project.id, task.id, { status: "IN_PROGRESS", blockerReason: undefined });
                                  }}
                                >
                                  Resolve
                                </button>
                              ) : task.status !== "DONE" && task.status !== "IN_PROGRESS" ? (
                                <button
                                  type="button"
                                  className="button button-quiet button-micro"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startTask(project.id, task);
                                  }}
                                >
                                  Start
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="task-table-footer">
        {viewMode === "LIST" ? (
          <span>Showing {visibleTasks.length} {visibleTasks.length === 1 ? "task" : "tasks"}</span>
        ) : (
          <span>Showing {Object.values(boardTasksByColumn).flat().length} tasks across {kanbanColumns.length} columns — Drag cards between columns to change status</span>
        )}
      </footer>
    </section>}
    {canEditTask&&editingTask&&<EditTaskDialog projectId={editingTask.projectId} task={editingTask.task} onClose={()=>setEditingTask(null)}/>}
    {canCreateTask && showAssignTask && <AssignTaskDialog projects={projects} onClose={() => setShowAssignTask(false)} />}
    {blockingTask && <BlockTaskDialog title={blockingTask.task.title} initialReason={blockingTask.task.blockerReason} onClose={() => setBlockingTask(null)} onConfirm={blockerReason => {
      updateTask(blockingTask.projectId, blockingTask.task.id, {status: "BLOCKED", blockerReason});
      setBlockingTask(null);
    }} />}
    <p className="storage-note">Assign tasks here or open a project workspace to add new work.</p>
  </div>;
}
