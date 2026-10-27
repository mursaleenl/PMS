"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileText, GripVertical, Handshake, Link2, Plus, Trash2, Users, X } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { deleteProject, readProjects, type Project, type ProjectWorkItem, updateProject } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

type ProjectTab = "Overview" | "Kanban Board" | "Staging & Links";
const projectTabs: ProjectTab[] = ["Overview", "Kanban Board", "Staging & Links"];
type VisibleTaskStatus = Exclude<ProjectWorkItem["status"], "UNDER_REVIEW">;
const taskStatuses: VisibleTaskStatus[] = ["TO_DO", "IN_PROGRESS", "DONE", "BLOCKED"];
const statusLabels: Record<VisibleTaskStatus, string> = { TO_DO: "To do", IN_PROGRESS: "In progress", DONE: "Done", BLOCKED: "Blocked" };

function TaskDispatchDrawer({ project, onClose, onDispatch }: { project: Project; onClose: () => void; onDispatch: (task: ProjectWorkItem) => void }) {
  const [error, setError] = useState("");
  const [kind, setKind] = useState<ProjectWorkItem["kind"]>("FEATURE_DEV");
  const assignees = [...new Set(project.team.map((member) => member.name.trim()).filter(Boolean))];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const assignee = String(data.get("assignee") || "");
    if (!assignee) {
      setError("Assign this task to a team member first.");
      return;
    }
    const estimatedHours = Number(data.get("estimatedHours"));
    if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
      setError("Enter an estimated effort greater than zero.");
      return;
    }
    onDispatch({
      id: crypto.randomUUID(),
      title: String(data.get("title") || "").trim(),
      kind,
      assignee,
      priority: String(data.get("priority")) as ProjectWorkItem["priority"],
      estimatedHours,
      loggedHours: 0,
      createdAt: new Date().toISOString(),
      status: "TO_DO",
    });
  }

  return <div className="task-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="task-dispatch-drawer" role="dialog" aria-modal="true" aria-labelledby="dispatch-title">
      <header><div><h2 id="dispatch-title">Dispatch new action item</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close dispatch drawer"><X size={18} /></button></header>
      <form onSubmit={submit}>
        <label className="field required">Action type<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as ProjectWorkItem["kind"])}><option value="FEATURE_DEV">Feature development</option><option value="CLIENT_FEEDBACK_TODO">Client feedback to-do</option><option value="QA_BUG">QA bug</option></select></label>
        <label className="field required">Task title<input name="title" required placeholder="Describe the work to be done" /></label>
        <label className="field required">Assignee<select name="assignee" required defaultValue=""><option value="" disabled>{assignees.length ? "Select a project team member" : "Assign project team members first"}</option>{assignees.map((name) => <option key={name} value={name}>{name}</option>)}</select><small className="field-hint">Current capacity preview is unavailable until a resource directory is connected.</small></label>
        <label className="field required">Priority<select name="priority" defaultValue="P3"><option value="P1">P1 · Critical</option><option value="P2">P2 · High</option><option value="P3">P3 · Normal</option><option value="P4">P4 · Low</option></select></label>
        <label className="field required">Estimated effort (hours)<input name="estimatedHours" type="number" min="0.25" step="0.25" required placeholder="e.g. 4" /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><ArrowRight size={14} />Dispatch to work queue</button></footer>
      </form>
    </aside>
  </div>;
}

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { role } = useWorkspaceAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProjectTab>("Overview");
  const [showDispatch, setShowDispatch] = useState(false);
  const [showManagedPlan, setShowManagedPlan] = useState(false);
  const [managedPlan, setManagedPlan] = useState<ManagedProject | null>(null);

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<VisibleTaskStatus | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setProject(readProjects().find((item) => item.id === projectId) ?? null);
      setManagedPlan(readManagedProjects().find((item) => item.sourceProjectId === projectId) ?? null);
      setLoading(false);
    };
    refresh();
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:post-sale-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("evecture:post-sale-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [projectId]);

  function save(updates: Partial<Project>) {
    if (!project) return;
    updateProject(project.id, updates);
    setProject({ ...project, ...updates });
  }

  function markProjectComplete() {
    save({ status: "COMPLETED" });
  }

  function removeProject() {
    if (!project || role !== "admin") return;
    if (!window.confirm(`Delete “${project.title}”? This will permanently remove its workspace and tasks.`)) return;
    deleteProject(project.id);
    router.push("/projects");
  }

  function dispatchTask(task: ProjectWorkItem) {
    save({ workItems: [task, ...(project?.workItems ?? [])] });
    setShowDispatch(false);
    setActiveTab("Kanban Board");
  }

  function updateWorkItem(taskId: string, updates: Partial<ProjectWorkItem>) {
    if (!project) return;
    save({ workItems: (project.workItems ?? []).map((task) => task.id === taskId ? { ...task, ...updates } : task) });
  }

  function handleDragStart(event: React.DragEvent, taskId: string) {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
  }

  function handleDragEnd() {
    setDraggingTaskId(null);
    setDragOverColumn(null);
    setDragOverTaskId(null);
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
    const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
    if (!taskId || !project) {
      handleDragEnd();
      return;
    }
    const currentItems = project.workItems ?? [];
    const item = currentItems.find((t) => t.id === taskId);
    if (item && item.status !== targetStatus) {
      updateWorkItem(taskId, { status: targetStatus });
    }
    handleDragEnd();
  }

  function handleCardDrop(event: React.DragEvent, targetTaskId: string, targetStatus: VisibleTaskStatus) {
    event.preventDefault();
    event.stopPropagation();
    const taskId = event.dataTransfer.getData("text/plain") || draggingTaskId;
    if (!taskId || !project || taskId === targetTaskId) {
      handleDragEnd();
      return;
    }
    const currentItems = [...(project.workItems ?? [])];
    const sourceIndex = currentItems.findIndex((t) => t.id === taskId);
    const targetIndex = currentItems.findIndex((t) => t.id === targetTaskId);
    if (sourceIndex === -1 || targetIndex === -1) {
      handleDragEnd();
      return;
    }
    const [moved] = currentItems.splice(sourceIndex, 1);
    const updated = { ...moved, status: targetStatus };
    const insertIndex = currentItems.findIndex((t) => t.id === targetTaskId);
    currentItems.splice(insertIndex >= 0 ? insertIndex : targetIndex, 0, updated);
    save({ workItems: currentItems });
    handleDragEnd();
  }

  function setProjectLink(key: "staging" | "repository" | "design" | "other") {
    if (!project) return;
    const labels = { staging: "Staging URL", repository: "Repository URL", design: "Design file URL", other: "Other project link" };
    const value = window.prompt(labels[key], project.links?.[key] || "");
    if (value === null) return;
    save({ links: { ...project.links, [key]: value.trim() || undefined } });
  }

  if (loading) return <div className="page-content"><div className="panel pipeline-empty"><p>Loading project workspace…</p></div></div>;
  if (!project) return <div className="page-content"><div className="panel pipeline-empty"><h2>Project workspace not found</h2><p>This browser does not have a record for that project.</p><Link className="button button-quiet" href="/projects"><ArrowLeft size={14} />Project portfolio</Link></div></div>;

  const workItems = (project.workItems ?? []).map((task) => task.status === "UNDER_REVIEW" ? { ...task, status: "IN_PROGRESS" as const } : task);
  const clientBlocked = workItems.some((task) => task.status === "BLOCKED");
  const marginAlert = workItems.some((task) => task.estimatedHours > 0 && task.loggedHours / task.estimatedHours >= 0.85);
  const health = clientBlocked ? { label: "Blocked work", className: "health-blocked" } : marginAlert ? { label: "Margin alert", className: "health-risk" } : { label: "On track", className: "health-good" };
  const taskGroups = Object.fromEntries(taskStatuses.map((status) => [status, workItems.filter((task) => task.status === status)])) as Record<VisibleTaskStatus, ProjectWorkItem[]>;

  return <div className="page-content project-detail-page">
    <Link className="back-link" href="/projects"><ArrowLeft size={15} />Project portfolio</Link>
    <header className="record-heading project-room-heading"><div><h1>{project.title}</h1></div><div className="project-lifecycle-actions"><span className={`health-pill ${health.className}`}><i />{health.label}</span>{project.status === "COMPLETED" ? managedPlan ? <Link className="button button-quiet" href="/post-sale"><Check size={14} />In post-sale · {managedPlan.id}</Link> : <button className="button button-primary" type="button" onClick={() => setShowManagedPlan(true)}><Handshake size={14} />Move to post-sale</button> : <button className="button button-quiet" type="button" onClick={markProjectComplete}><Check size={14} />Mark complete</button>}{role === "admin" && <button className="button button-quiet project-delete-button" type="button" onClick={removeProject}><Trash2 size={14} />Delete project</button>}</div></header>

    <section className="project-room-strip"><div><small>PROJECT STATUS</small><strong>{project.status === "COMPLETED" ? "Completed" : "Active"}</strong></div><div><small>OPEN WORK ITEMS</small><strong>{workItems.filter((task) => task.status !== "DONE").length}</strong></div><div className="room-task-total"><small>TEAM MEMBERS</small><strong>{project.team.filter((member) => member.name.trim()).length}</strong></div></section>

    <nav className="project-room-tabs" aria-label="Project room sections">{projectTabs.map((tab) => { const count = tab === "Kanban Board" ? workItems.length : undefined; return <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}{count ? <span>{count}</span> : null}</button>; })}<button type="button" className="button button-primary room-dispatch-button" onClick={() => setShowDispatch(true)}><Plus size={14} />Dispatch task</button></nav>

    {activeTab === "Overview" && <>
      <section className="project-detail-grid">
        <div className="project-detail-main">
          <article className="panel project-data-panel"><div className="panel-heading"><div><h2>Commercial & scope</h2><p>Carried over from accepted proposal</p></div></div><div className="project-commercial-list"><div><small>Operating company</small><strong>{project.operatingCompany ?? "Evecture"}</strong></div><div><small>Billing structure</small><strong>{project.billingStructure}</strong></div><div><small>Deposit invoice</small><strong>{project.invoice ? `${project.invoice.invoiceNumber} · ${project.invoice.status.replaceAll("_", " ")}` : "Not recorded"}</strong></div><div><small>Payment terms</small><p>{project.invoice?.paymentTerms || "No additional terms recorded."}</p></div><div><small>Included revision rounds</small><strong>{project.revisionRounds}</strong></div><div><small>Included scope</small><p>{project.scopeIncluded}</p></div><div><small>Excluded scope</small><p>{project.scopeExcluded || "None specified"}</p></div><div><small>Assumptions</small><p>{project.assumptions || "None specified"}</p></div></div></article>
        </div>
        <aside className="project-detail-side"><article className="panel project-data-panel"><div className="panel-heading"><div><h2>Team</h2><p>Assigned roles and allocation</p></div><Users size={16} /></div><div className="team-assignment-list">{project.team.map((member, index) => <div className="team-assignment" key={`${member.role}-${index}`}><span className="team-role-icon"><Users size={14} /></span><div><strong>{member.role}</strong><small>{member.name || "Unassigned"}</small></div><b>{member.name ? `${member.allocationPercent}%` : "—"}</b></div>)}</div><Link className="assignment-inline-link" href="/projects/assignments">Manage project assignments <ArrowRight size={13} /></Link></article>
          <article className="panel project-data-panel"><div className="panel-heading"><div><h2>Project documents</h2><p>Signed commercial records</p></div><FileText size={16} /></div><div className="document-links">{project.signedContractDataUrl && project.signedContractName ? <a href={project.signedContractDataUrl} download={project.signedContractName}><Download size={14} />{project.signedContractName}</a> : <span className="document-pending">Signed SOW not attached</span>}{project.invoice && <Link href={`/requests/${project.leadId}`}><ExternalLink size={14} />{project.invoice.invoiceNumber} · invoice record</Link>}</div></article></aside>
      </section>
    </>}

    {activeTab === "Kanban Board" && <section className="project-kanban-board">{taskStatuses.map((status) => {
      const isOver = dragOverColumn === status;
      return <div className={`kanban-column${isOver ? " kanban-column-drag-over" : ""}`} key={status} onDragOver={(event) => handleColumnDragOver(event, status)} onDragEnter={(event) => { event.preventDefault(); setDragOverColumn(status); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragOverColumn(null); }} onDrop={(event) => handleColumnDrop(event, status)}>
        <header><h2>{statusLabels[status]}</h2><span>{taskGroups[status].length}</span></header>
        <div className="kanban-column-body">
          {taskGroups[status].length === 0 ? <div className="kanban-column-empty"><span>No tasks</span></div> : taskGroups[status].map((task) => {
            const isDragging = draggingTaskId === task.id;
            const isTarget = dragOverTaskId === task.id && !isDragging;
            return <article className={`work-item-card${isDragging ? " is-dragging" : ""}${isTarget ? " drag-target" : ""}`} key={task.id} draggable onDragStart={(event) => handleDragStart(event, task.id)} onDragEnd={handleDragEnd} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; if (dragOverTaskId !== task.id) setDragOverTaskId(task.id); if (dragOverColumn !== status) setDragOverColumn(status); }} onDrop={(event) => handleCardDrop(event, task.id, status)}>
              <div className="work-item-card-top"><span className={`work-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span><span>{task.kind.replaceAll("_", " ")}</span><span className="drag-handle" title="Drag to move task"><GripVertical size={13} /></span></div>
              <h3>{task.title}</h3>
              <p>{task.assignee} · {task.estimatedHours}h estimated</p>
              {task.status === "BLOCKED" && <button className="button button-quiet" type="button" onClick={() => updateWorkItem(task.id, { status: "IN_PROGRESS" })}>Resolve blocker & return to work</button>}
            </article>;
          })}
        </div>
      </div>;
    })}</section>}

    {activeTab === "Staging & Links" && <section className="panel ops-panel"><div className="panel-heading"><div><h2>Project links & environments</h2><p>Keep the team's staging, source, and design references attached to this workspace.</p></div></div><div className="project-link-grid">{([["staging", "Staging environment"], ["repository", "Source repository"], ["design", "Design file"], ["other", "Other reference"]] as const).map(([key, label]) => { const value = project.links?.[key]; return <article className="project-link-card" key={key}><span className="project-link-icon"><Link2 size={16} /></span><div><small>{label}</small>{value ? <a href={value} target="_blank" rel="noreferrer">{value}<ExternalLink size={12} /></a> : <strong>Not added</strong>}</div><button type="button" className="button button-quiet" onClick={() => setProjectLink(key)}>{value ? "Edit link" : "Add link"}</button></article>; })}</div><p className="storage-note">Links are stored in this browser workspace. Environment creation and repository permissions are managed outside this module.</p></section>}

    {showDispatch && <TaskDispatchDrawer project={project} onClose={() => setShowDispatch(false)} onDispatch={dispatchTask} />}
    {showManagedPlan && <ManagedPlanDrawer projects={[project]} initialProjectId={project.id} onClose={() => setShowManagedPlan(false)} onCreated={(item) => setManagedPlan(item)} />}
    <p className="storage-note">Project changes update this browser workspace and other open tabs. Shared server sync is not connected.</p>
  </div>;
}
