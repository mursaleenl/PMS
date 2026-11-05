"use client";

import {readLeads,type Lead} from "@/lib/leads";
import { createUuid } from "@/lib/uuid";
import Link from "next/link";
import {StatusBadge} from "@/app/_components/status-badge";
import { ProjectStatusBoard } from "@/app/_components/project-status-board";
import { ProjectConversation } from "@/app/_components/project-conversation";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileText, FolderKanban, Handshake, Link2, Plus, Receipt, Trash2, Users, X } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { deleteProject, readProjects, getProjectTeamMembers, getProjectDisplayTitle, getProjectDisplayServices, type Project, type ProjectWorkItem, updateProject, isProjectAssignedToUser, isTaskAssignedToUser } from "@/lib/projects";
import { deleteManagedProject, readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import { showToast } from "@/app/_components/toast-hub";
import { useAssignableUsers } from "@/lib/assignees";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignees";

type ProjectTab = "Overview" | "Staging & Links" | "Project status" | "Messages";
const projectTabs: ProjectTab[] = ["Overview", "Staging & Links", "Project status", "Messages"];

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
        add(name, m.role === "admin" ? "Admin" : "Employee", m.email, m.user_id || undefined);
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
    const selectedAssignee = String(data.get("assignee") || "").trim();
    if (!selectedAssignee) {
      setError("Assign this task to a workspace admin or employee.");
      return;
    }
    const selectedUser = assignees.find((item) => item.id === selectedAssignee || item.name === selectedAssignee);
    onDispatch({
      id: createUuid(),
      title: String(data.get("title") || "").trim(),
      kind,
      assignee: selectedUser?.name || selectedAssignee,
      assigneeId: selectedUser?.id,
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
                <option key={item.id || item.name} value={item.id || item.name}>
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
            <button className="button button-primary dispatch-submit-button" type="submit">
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
  const { role, user, members } = useWorkspaceAuth();
  const { users: managerOptions } = useAssignableUsers();
  const [project, setProject] = useState<Project | null>(null);
  const [linkedLead,setLinkedLead]=useState<Lead|null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProjectTab>("Overview");
  const [showDispatch, setShowDispatch] = useState(false);
  const [showManagedPlan, setShowManagedPlan] = useState(false);
  const [managedPlan, setManagedPlan] = useState<ManagedProject | null>(null);
  const employeeName = (members.find((member) => member.user_id === user?.id)?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim();

  useEffect(() => {
    const refresh = () => {
      const candidate = readProjects().find((item) => item.id === projectId) ?? null;
      setProject(candidate && (role !== "employee" || isProjectAssignedToUser(candidate, user?.id, employeeName)) ? candidate : null);
      setLinkedLead(role === "admin" && candidate ? readLeads().find(lead=>lead.id===candidate.leadId||lead.projectId===candidate.id)??null:null);
      setManagedPlan(role === "admin" ? readManagedProjects().find((item) => item.sourceProjectId === projectId) ?? null : null);
      setLoading(false);
    };
    refresh();
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:post-sale-updated", refresh);
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("evecture:post-sale-updated", refresh);
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [projectId, role, user?.id, employeeName]);

  function save(updates: Partial<Project>) {
    if (!project || role !== "admin") return;
    updateProject(project.id, updates);
    setProject(readProjects().find(item => item.id === project.id) ?? null);
  }

  function markProjectComplete() {
    if (role !== "admin") return;
    save({ status: "COMPLETED" });
  }

  function moveFromRetainerToProjects() {
    if (!project || role !== "admin") return;
    if (!window.confirm(`Move "${project.title}" out of Retainers and back to active Projects?`)) return;
    if (managedPlan) {
      deleteManagedProject(managedPlan.id);
      setManagedPlan(null);
    }
    save({ status: "ACTIVE" });
    showToast({ message: `"${project.title}" reactivated and moved to active projects.` });
  }

  function removeProject() {
    if (!project || role !== "admin") return;
    if (!window.confirm(`Delete “${project.title}”? This will permanently remove its workspace and tasks.`)) return;
    deleteProject(project.id);
    router.push("/projects");
  }

  function dispatchTask(task: ProjectWorkItem) {
    if (role !== "admin") return;
    save({ workItems: [task, ...(project?.workItems ?? [])] });
    setShowDispatch(false);
    setActiveTab("Overview");
    showToast({ message: `Task "${task.title}" dispatched to Tasks` });
  }

  function setProjectLink(key: "staging" | "repository" | "design" | "other") {
    if (!project || (role !== "admin" && !(role === "employee" && key === "staging"))) return;
    const labels = { staging: "Staging URL", repository: "Repository URL", design: "Design file URL", other: "Other project link" };
    const value = window.prompt(labels[key], project.links?.[key] || "");
    if (value === null) return;
    if (value.trim() && !/^https?:\/\//i.test(value.trim())) { showToast({message:"Enter a link starting with https:// or http://"}); return; }
    const updates = { links: { ...project.links, [key]: value.trim() || undefined } };
    if (role === "admin") save(updates);
    else {
      updateProject(project.id, updates);
      setProject(readProjects().find(item => item.id === project.id) ?? null);
    }
  }

  if (loading) return <div className="page-content"><div className="panel pipeline-empty"><p>Loading project workspace…</p></div></div>;
  if (!project) return <div className="page-content"><div className="panel pipeline-empty"><h2>Project workspace not found</h2><p>This project may have been removed or you may not have access to it.</p><Link className="button button-quiet" href="/projects"><ArrowLeft size={14} />Project portfolio</Link></div></div>;

  const workItems = role === "employee" ? (project.workItems ?? []).filter((task) => isTaskAssignedToUser(task, user?.id, employeeName)) : project.workItems ?? [];
  const clientBlocked = workItems.some((task) => task.status === "BLOCKED");
  const marginAlert = workItems.some((task) => task.estimatedHours > 0 && task.loggedHours / task.estimatedHours >= 0.85);
  const health = clientBlocked ? "Blocked work" : marginAlert ? "Margin alert" : null;

  const teamMembers = getProjectTeamMembers(project);
  const services = getProjectDisplayServices(project);

  const acceptedProposal=[...(linkedLead?.proposals??[])].filter(item=>item.status==="ACCEPTED").sort((a,b)=>b.version-a.version)[0];
  const sowUrl=linkedLead?.acceptanceDocumentDataUrl||project.signedContractDataUrl;
  const sowName=linkedLead?.acceptanceDocumentName||project.signedContractName;
  return <div className="page-content project-detail-page">
    <Link className="back-link" href="/projects"><ArrowLeft size={15} />Project portfolio</Link>
    <header className="record-heading project-room-heading"><div><h1>{getProjectDisplayTitle(project)}</h1>{services && <p className="project-room-services">{services}</p>}</div><div className="project-lifecycle-actions"><div className="project-lifecycle-status"><StatusBadge status={project.status}/>{health && <StatusBadge status={health}/>}</div><div className="project-lifecycle-buttons">{role === "admin"&&((project.status === "COMPLETED" || project.status === "AMC") ? managedPlan ? <><Link className="button button-quiet" href="/post-sale" title="View retainer plan"><Check size={14} />In retainer · {managedPlan.id}</Link><button className="button button-quiet" type="button" onClick={moveFromRetainerToProjects} title="Move out of retainers and back to active projects"><FolderKanban size={14} />Move to active projects</button></> : <button className="button button-quiet" type="button" onClick={() => setShowManagedPlan(true)}><Handshake size={14} />Move to retainer</button> : <button className="button button-quiet" type="button" onClick={markProjectComplete}><Check size={14} />Mark complete</button>)}{role === "admin" && <button className="button button-quiet project-delete-button" type="button" onClick={removeProject}><Trash2 size={14} />Delete project</button>}</div></div></header>

    <section className="project-room-strip"><div><small>PROJECT STATUS</small><strong>{project.status === "COMPLETED" ? "Completed" : "Active"}</strong></div><div><small>OPEN WORK ITEMS</small><strong><Link href="/work" style={{ textDecoration: "none", color: "inherit" }}>{workItems.filter((task) => task.status !== "DONE").length} · In Tasks</Link></strong></div><div className="room-task-total"><small>TEAM MEMBERS</small><strong>{project.team.filter((member) => member.name.trim() && !DUMMY_ASSIGNABLE_NAMES.has(member.name.toLowerCase().trim())).length}</strong></div></section>

    {role === "admin" && <div className="project-dispatch-row"><button type="button" className="button button-primary room-dispatch-button" onClick={() => setShowDispatch(true)}><Plus size={14} />Dispatch task</button></div>}

    <nav className="project-room-tabs" aria-label="Project room sections">
      {projectTabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
    </nav>

    {activeTab === "Overview" && <>
      <section className="project-detail-grid">
        <div className="project-detail-main">
          {workItems.length > 0 && (
            <article className="panel project-data-panel project-task-preview-panel">
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
          <article className="panel project-data-panel project-scope-panel">
            <div className="panel-heading"><div><h2>Project scope</h2><p>Delivery details for this workspace</p></div></div>
            <div className="project-commercial-list">
              <div><small>Operating company</small><strong data-company={project.operatingCompany}>{project.operatingCompany ?? "Not selected"}</strong></div>
              <div><small>Billing structure</small><strong>{project.billingStructure}</strong></div>
              {role === "admin" && <div className="project-scope-copy"><small>Payment terms</small><p>{project.invoice?.paymentTerms || "No additional terms recorded."}</p></div>}
              <div className="project-scope-copy"><small>Included scope</small><p>{project.scopeIncluded || "Not recorded"}</p></div>
              <div className="project-scope-copy"><small>Excluded scope</small><p>{project.scopeExcluded || "None specified"}</p></div>
              <div className="project-scope-copy"><small>Assumptions</small><p>{project.assumptions || "None specified"}</p></div>
            </div>
          </article>
        </div>
        <aside className="project-detail-side"><article className="panel project-data-panel project-team-panel">
          <div className="panel-heading"><div><h2>Project Team</h2><p>Project manager and assigned team members</p></div></div>
          {role === "admin" ? <label className="field">Assigned project manager<select aria-label="Assigned project manager" value={project.team.find(member=>member.role==="Project Manager")?.userId||managerOptions.find(person=>person.name===project.team.find(member=>member.role==="Project Manager")?.name)?.id||""} onChange={event=>{
            if(role!=="admin")return;
            const manager=managerOptions.find(person=>person.id===event.target.value);
            if(!manager)return;
            updateProject(project.id,{team:[...project.team.filter(member=>member.role!=="Project Manager"),{role:"Project Manager",name:manager.name,userId:manager.id,allocationPercent:0}]});
            showToast({message:"Project manager updated."});
          }}><option value="" disabled>Select a project manager</option>{managerOptions.filter(person=>person.id).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : <div className="field"><span>Assigned project manager</span><p>{project.team.find(member=>member.role==="Project Manager")?.name||"Unassigned"}</p></div>}
          <div className="project-team-roster"><h3>Team members</h3>
            {teamMembers.length ? <ul>{teamMembers.map(member=><li key={member.userId||member.name.trim().toLowerCase()}><span>{member.name}</span><small>Team member</small></li>)}</ul> : <p>Team members appear here when tasks are assigned.</p>}
          </div>
        </article>
          <article className="panel project-data-panel"><div className="panel-heading"><div><h2>Project documents</h2><p>Accepted proposal and project records</p></div><FileText size={16} /></div><div className="document-links">{acceptedProposal?.shareToken && <Link href={`/proposal/${acceptedProposal.shareToken}`}><FileText size={14}/>{acceptedProposal.proposalTitle || "Accepted proposal"} · Accepted</Link>}{acceptedProposal?.documentDataUrl && <a href={acceptedProposal.documentDataUrl} download={acceptedProposal.documentName}><Download size={14}/>Accepted proposal attachment</a>}{sowUrl && sowName && <a href={sowUrl} download={sowName}><Download size={14}/>{sowName} · Signed SOW</a>}{role === "admin" && (project.invoice ? <Link href={`/invoices?invoice=${project.invoice.invoiceNumber}`}><ExternalLink size={14} />{project.invoice.invoiceNumber} · invoice record</Link> : <Link className="document-pending" href={`/invoices?project=${project.id}`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit" }}><Receipt size={13} />No invoice recorded · Create invoice</Link>)}</div></article></aside>
      </section>
    </>}

    {activeTab === "Project status" && <ProjectStatusBoard project={project} />}
    {activeTab === "Messages" && <section className="panel portal-record"><ProjectConversation projectId={project.id}/></section>}
    {activeTab === "Staging & Links" && <section className="panel ops-panel"><div className="panel-heading"><div><h2>Project links & environments</h2><p>Keep the team's staging, source, and design references attached to this workspace.</p></div></div><div className="project-link-grid">{([["staging", "Staging environment"], ["repository", "Source repository"], ["design", "Design file"], ["other", "Other reference"]] as const).map(([key, label]) => { const value = project.links?.[key]; return <article className="project-link-card" key={key}><span className="project-link-icon"><Link2 size={16} /></span><div><small>{label}</small>{value ? <a href={value} target="_blank" rel="noreferrer">{value}<ExternalLink size={12} /></a> : <strong>Not added</strong>}</div>{(role === "admin" || (role === "employee" && key === "staging")) && <button type="button" className="button button-quiet" onClick={() => setProjectLink(key)}>{value ? "Edit link" : "Add link"}</button>}</article>; })}</div><p className="storage-note">Project links are saved to your workspace. Repository and hosting permissions are managed by their providers.</p></section>}

    {role === "admin" && showDispatch && <TaskDispatchDrawer project={project} onClose={() => setShowDispatch(false)} onDispatch={dispatchTask} />}
    {role === "admin" && showManagedPlan && <ManagedPlanDrawer projects={[project]} initialProjectId={project.id} onClose={() => setShowManagedPlan(false)} onCreated={(item) => setManagedPlan(item)} />}
    <p className="storage-note">Changes are saved to your workspace database.</p>
  </div>;
}
