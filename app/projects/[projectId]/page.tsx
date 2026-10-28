"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileText, Handshake, Link2, Plus, Trash2, Users, X } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { deleteProject, readProjects, type Project, type ProjectWorkItem, updateProject } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import { showToast } from "@/app/_components/toast-hub";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignees";

type ProjectTab = "Overview" | "Staging & Links";
const projectTabs: ProjectTab[] = ["Overview", "Staging & Links"];

type AssigneeOption = {
  id?: string;
  name: string;
  role?: string;
  email?: string;
};

function TaskDispatchDrawer({ project, onClose, onDispatch }: { project: Project; onClose: () => void; onDispatch: (task: ProjectWorkItem) => void }) {
  const { session, user, role: currentRole, members } = useWorkspaceAuth();
  const [error, setError] = useState("");
  const [kind, setKind] = useState<ProjectWorkItem["kind"]>("FEATURE_DEV");
  const [loadingAssignees, setLoadingAssignees] = useState(false);

  const [assignees, setAssignees] = useState<AssigneeOption[]>(() => {
    const list: AssigneeOption[] = [];
    const seen = new Set<string>();

    const add = (name: string, role?: string, email?: string, id?: string) => {
      const clean = name.trim();
      if (!clean || DUMMY_ASSIGNABLE_NAMES.has(clean.toLowerCase())) return;
      const key = clean.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ id, name: clean, role, email });
    };

    // 1. Workspace members with admin or employee role from auth context
    members
      .filter((m) => m.role === "admin" || m.role === "employee")
      .forEach((m) => {
        const raw = m.display_name?.trim() || m.email.split("@")[0];
        const name = raw.charAt(0).toUpperCase() + raw.slice(1);
        add(name, m.role === "admin" ? "Admin" : "Employee", m.email, m.id);
      });

    // 2. Current authenticated user if admin or employee
    if (user && (currentRole === "admin" || currentRole === "employee")) {
      const raw = (user.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() || user.email?.split("@")[0] || "";
      if (raw) {
        const name = raw.charAt(0).toUpperCase() + raw.slice(1);
        add(name, currentRole === "admin" ? "Admin" : "Employee", user.email || undefined, user.id);
      }
    }

    // 3. Project team members
    project.team.forEach((m) => {
      if (m.name.trim() && !DUMMY_ASSIGNABLE_NAMES.has(m.name.trim().toLowerCase())) {
        add(m.name.trim(), m.role);
      }
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  });

  useEffect(() => {
    let active = true;
    async function loadWorkspaceAssignees() {
      setLoadingAssignees(true);
      try {
        const res = await fetch("/api/assignees", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (!res.ok) return;
        const data = (await res.json()) as { assignees?: Array<{ id: string; name: string; role: "admin" | "employee"; email: string }> };
        if (!active || !Array.isArray(data.assignees)) return;

        setAssignees((prev) => {
          const map = new Map<string, AssigneeOption>();

          // Add fetched workspace users (roles: admin, employee)
          data.assignees?.forEach((item) => {
            if (DUMMY_ASSIGNABLE_NAMES.has(item.name.toLowerCase())) return;
            map.set(item.name.toLowerCase(), {
              id: item.id,
              name: item.name,
              role: item.role === "admin" ? "Admin" : "Employee",
              email: item.email,
            });
          });

          // Add project team members
          project.team.forEach((m) => {
            const clean = m.name.trim();
            if (clean && !DUMMY_ASSIGNABLE_NAMES.has(clean.toLowerCase()) && !map.has(clean.toLowerCase())) {
              map.set(clean.toLowerCase(), { name: clean, role: m.role });
            }
          });

          // Retain any existing options
          prev.forEach((item) => {
            if (!map.has(item.name.toLowerCase())) {
              map.set(item.name.toLowerCase(), item);
            }
          });

          return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
        });
      } catch (err) {
        console.warn("Failed to load workspace assignees", err);
      } finally {
        if (active) setLoadingAssignees(false);
      }
    }

    void loadWorkspaceAssignees();
    return () => {
      active = false;
    };
  }, [session?.access_token, project.team]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const assignee = String(data.get("assignee") || "").trim();
    if (!assignee) {
      setError("Assign this task to a workspace admin or employee.");
      return;
    }
    onDispatch({
      id: crypto.randomUUID(),
      title: String(data.get("title") || "").trim(),
      kind,
      assignee,
      priority: String(data.get("priority")) as ProjectWorkItem["priority"],
      estimatedHours: 0,
      loggedHours: 0,
      createdAt: new Date().toISOString(),
      status: "TO_DO",
    });
  }

  return (
    <div
      className="task-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="task-dispatch-drawer" role="dialog" aria-modal="true" aria-labelledby="dispatch-title">
        <header>
          <div>
            <h2 id="dispatch-title">Dispatch task</h2>
            <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--muted-foreground, #64748b)" }}>
              Assign work and dispatch it directly to the Tasks board.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dispatch drawer">
            <X size={18} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label className="field required">
            Action type
            <select name="kind" value={kind} onChange={(event) => setKind(event.target.value as ProjectWorkItem["kind"])}>
              <option value="FEATURE_DEV">Feature development</option>
              <option value="CLIENT_FEEDBACK_TODO">Client feedback to-do</option>
              <option value="QA_BUG">QA bug</option>
            </select>
          </label>
          <label className="field required">
            Task title
            <input name="title" required placeholder="Describe the work to be done" />
          </label>
          <label className="field required">
            Assignee
            <select name="assignee" required defaultValue="">
              <option value="" disabled>
                {assignees.length
                  ? "Select an assignee (Admin or Employee)"
                  : loadingAssignees
                  ? "Loading assignable team members…"
                  : "No assignable members available"}
              </option>
              {assignees.map((item) => (
                <option key={item.id || item.name} value={item.name}>
                  {item.name}
                  {item.role ? ` · ${item.role}` : ""}
                </option>
              ))}
            </select>
            <small className="field-hint">
              Assignable to workspace administrators and employees.
            </small>
          </label>
          <label className="field required">
            Priority
            <select name="priority" defaultValue="P3">
              <option value="P1">P1 · Critical</option>
              <option value="P2">P2 · High</option>
              <option value="P3">P3 · Normal</option>
              <option value="P4">P4 · Low</option>
            </select>
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <footer>
            <button className="button button-quiet" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button button-primary" type="submit">
              <ArrowRight size={14} />
              Dispatch to tasks
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
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
    setActiveTab("Overview");
    showToast({ message: `Task "${task.title}" dispatched to Tasks` });
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

  return <div className="page-content project-detail-page">
    <Link className="back-link" href="/projects"><ArrowLeft size={15} />Project portfolio</Link>
    <header className="record-heading project-room-heading"><div><h1>{project.title}</h1></div><div className="project-lifecycle-actions"><span className={`health-pill ${health.className}`}><i />{health.label}</span>{project.status === "COMPLETED" ? managedPlan ? <Link className="button button-quiet" href="/post-sale"><Check size={14} />In retainer · {managedPlan.id}</Link> : <button className="button button-primary" type="button" onClick={() => setShowManagedPlan(true)}><Handshake size={14} />Move to retainer</button> : <button className="button button-quiet" type="button" onClick={markProjectComplete}><Check size={14} />Mark complete</button>}{role === "admin" && <button className="button button-quiet project-delete-button" type="button" onClick={removeProject}><Trash2 size={14} />Delete project</button>}</div></header>

    <section className="project-room-strip"><div><small>PROJECT STATUS</small><strong>{project.status === "COMPLETED" ? "Completed" : "Active"}</strong></div><div><small>OPEN WORK ITEMS</small><strong><Link href="/work" style={{ textDecoration: "none", color: "inherit" }}>{workItems.filter((task) => task.status !== "DONE").length} · In Tasks</Link></strong></div><div className="room-task-total"><small>TEAM MEMBERS</small><strong>{project.team.filter((member) => member.name.trim() && !DUMMY_ASSIGNABLE_NAMES.has(member.name.toLowerCase().trim())).length}</strong></div></section>

    <nav className="project-room-tabs" aria-label="Project room sections">
      {projectTabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
      <button type="button" className="button button-primary room-dispatch-button" onClick={() => setShowDispatch(true)}><Plus size={14} />Dispatch task</button>
    </nav>

    {activeTab === "Overview" && <>
      <section className="project-detail-grid">
        <div className="project-detail-main">
          {workItems.length > 0 && (
            <article className="panel project-data-panel">
              <div className="panel-heading">
                <div>
                  <h2>Project tasks</h2>
                  <p>{workItems.filter((t) => t.status !== "DONE").length} open · {workItems.length} total</p>
                </div>
                <Link className="button button-quiet" href="/work">
                  Open Tasks board <ArrowRight size={13} />
                </Link>
              </div>
              <div className="project-task-summary-list">
                {workItems.slice(0, 5).map((task) => (
                  <div className="project-task-summary-item" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{task.assignee || "Unassigned"} · {task.status.replaceAll("_", " ")}</small>
                    </div>
                    <span className={`work-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                  </div>
                ))}
                {workItems.length > 5 && (
                  <p className="project-task-summary-more">+{workItems.length - 5} more tasks in Tasks board</p>
                )}
              </div>
            </article>
          )}
          <article className="panel project-data-panel"><div className="panel-heading"><div><h2>Commercial & scope</h2><p>Carried over from accepted proposal</p></div></div><div className="project-commercial-list"><div><small>Operating company</small><strong>{project.operatingCompany ?? "Evecture"}</strong></div><div><small>Billing structure</small><strong>{project.billingStructure}</strong></div><div><small>Deposit invoice</small><strong>{project.invoice ? `${project.invoice.invoiceNumber} · ${project.invoice.status.replaceAll("_", " ")}` : "Not recorded"}</strong></div><div><small>Payment terms</small><p>{project.invoice?.paymentTerms || "No additional terms recorded."}</p></div><div><small>Included revision rounds</small><strong>{project.revisionRounds}</strong></div><div><small>Included scope</small><p>{project.scopeIncluded}</p></div><div><small>Excluded scope</small><p>{project.scopeExcluded || "None specified"}</p></div><div><small>Assumptions</small><p>{project.assumptions || "None specified"}</p></div></div></article>
        </div>
        <aside className="project-detail-side"><article className="panel project-data-panel"><div className="panel-heading"><div><h2>Team</h2><p>Assigned roles and allocation</p></div><Users size={16} /></div><div className="team-assignment-list">{project.team.map((member, index) => {
          const isDummy = DUMMY_ASSIGNABLE_NAMES.has(member.name.toLowerCase().trim());
          const displayName = !member.name || isDummy ? "Unassigned" : member.name;
          const allocation = isDummy ? "—" : (member.name ? `${member.allocationPercent}%` : "—");
          return <div className="team-assignment" key={`${member.role}-${index}`}><span className="team-role-icon"><Users size={14} /></span><div><strong>{member.role}</strong><small>{displayName}</small></div><b>{allocation}</b></div>;
        })}</div><Link className="assignment-inline-link" href="/projects/assignments">Manage project assignments <ArrowRight size={13} /></Link></article>
          <article className="panel project-data-panel"><div className="panel-heading"><div><h2>Project documents</h2><p>Signed commercial records</p></div><FileText size={16} /></div><div className="document-links">{project.signedContractDataUrl && project.signedContractName ? <a href={project.signedContractDataUrl} download={project.signedContractName}><Download size={14} />{project.signedContractName}</a> : <span className="document-pending">Signed SOW not attached</span>}{project.invoice && <Link href={`/requests/${project.leadId}`}><ExternalLink size={14} />{project.invoice.invoiceNumber} · invoice record</Link>}</div></article></aside>
      </section>
    </>}

    {activeTab === "Staging & Links" && <section className="panel ops-panel"><div className="panel-heading"><div><h2>Project links & environments</h2><p>Keep the team's staging, source, and design references attached to this workspace.</p></div></div><div className="project-link-grid">{([["staging", "Staging environment"], ["repository", "Source repository"], ["design", "Design file"], ["other", "Other reference"]] as const).map(([key, label]) => { const value = project.links?.[key]; return <article className="project-link-card" key={key}><span className="project-link-icon"><Link2 size={16} /></span><div><small>{label}</small>{value ? <a href={value} target="_blank" rel="noreferrer">{value}<ExternalLink size={12} /></a> : <strong>Not added</strong>}</div><button type="button" className="button button-quiet" onClick={() => setProjectLink(key)}>{value ? "Edit link" : "Add link"}</button></article>; })}</div><p className="storage-note">Links are stored in this browser workspace. Environment creation and repository permissions are managed outside this module.</p></section>}

    {showDispatch && <TaskDispatchDrawer project={project} onClose={() => setShowDispatch(false)} onDispatch={dispatchTask} />}
    {showManagedPlan && <ManagedPlanDrawer projects={[project]} initialProjectId={project.id} onClose={() => setShowManagedPlan(false)} onCreated={(item) => setManagedPlan(item)} />}
    <p className="storage-note">Project changes update this browser workspace and other open tabs. Shared server sync is not connected.</p>
  </div>;
}
