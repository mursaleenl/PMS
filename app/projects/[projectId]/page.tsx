"use client";
import {EditDetailsDialog} from "@/app/_components/edit-details-dialog";
import {canEditRecordDetails,parseServiceDetails,validateProjectServiceDetails} from "@/lib/record-editing";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";


import { getProjectLogoSrc } from "@/lib/project-logo";
import { ProjectLogoUpload } from "@/app/_components/project-logo";
import {readLeads,type Lead} from "@/lib/leads";
import { createUuid } from "@/lib/uuid";
import Link from "next/link";
import {StatusBadge} from "@/app/_components/status-badge";
import { ProjectStatusBoard } from "@/app/_components/project-status-board";
import { ProjectConversation } from "@/app/_components/project-conversation";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink, FileText, FolderKanban, Handshake, Link2, Plus, Receipt, Trash2, Users, X } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { deleteProject, readProjects, getProjectTeamMembers, getProjectDisplayTitle, getProjectDisplayServices, getProjectEnquiryDetails, type Project, type ProjectWorkItem, updateProject, isProjectAssignedToUser, canViewProjectTask } from "@/lib/projects";
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

function TaskDispatchDialog({ project, onClose, onDispatch }: { project: Project; onClose: () => void; onDispatch: (task: ProjectWorkItem) => void }) {
  const { session, user, role: currentRole, members } = useWorkspaceAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.showModal();
    return () => {
      node?.close();
      requestAnimationFrame(() => { if (previousFocus?.isConnected) previousFocus.focus(); });
    };
  }, []);
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
      .filter((m) => m.role === "admin" || (m.role === "employee" || m.role === "project_manager"))
      .forEach((m) => {
        const raw = m.display_name?.trim() || m.email.split("@")[0];
        const name = raw.charAt(0).toUpperCase() + raw.slice(1);
        add(name, m.role === "admin" ? "Admin" : m.role === "project_manager" ? "Project Manager" : "Employee", m.email, m.user_id || undefined);
      });

    // 2. Current authenticated user if admin or employee
    if (user && (currentRole === "admin" || (currentRole === "employee" || currentRole === "project_manager"))) {
      const raw = (user.user_metadata as { full_name?: string } | undefined)?.full_name?.trim() || user.email?.split("@")[0] || "";
      if (raw) {
        const name = raw.charAt(0).toUpperCase() + raw.slice(1);
        add(name, currentRole === "admin" ? "Admin" : currentRole === "project_manager" ? "Project Manager" : "Employee", user.email || undefined, user.id);
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
        const data = (await res.json()) as { assignees?: Array<{ id: string; name: string; role: "admin" | "employee" | "project_manager"; email: string }> };
        if (!active || !Array.isArray(data.assignees)) return;

        setAssignees((prev) => {
          const map = new Map<string, AssigneeOption>();

          // Add fetched workspace users (roles: admin, employee)
          data.assignees?.forEach((item) => {
            if (DUMMY_ASSIGNABLE_NAMES.has(item.name.toLowerCase())) return;
            map.set(item.name.toLowerCase(), {
              id: item.id,
              name: item.name,
              role: item.role === "admin" ? "Admin" : item.role === "project_manager" ? "Project Manager" : "Employee",
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
    <dialog
      ref={dialog}
      className="task-drawer-backdrop task-dispatch-dialog"
      aria-labelledby="dispatch-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="task-dispatch-drawer">
        <header>
          <div>
            <h2 id="dispatch-title">Dispatch task</h2>
            <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--muted-foreground, #64748b)" }}>
              Assign work and dispatch it directly to the Tasks board.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dispatch form">
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
      </div>
    </dialog>
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
  const [editingDetails,setEditingDetails]=useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [showManagedPlan, setShowManagedPlan] = useState(false);
  const [managedPlan, setManagedPlan] = useState<ManagedProject | null>(null);
  const employeeName = (members.find((member) => member.user_id === user?.id)?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim();

  useEffect(() => {
    const refresh = () => {
      const candidate = readProjects().find((item) => item.id === projectId) ?? null;
      setProject(candidate && ((role !== "employee") || isProjectAssignedToUser(candidate, user?.id, employeeName)) ? candidate : null);
      setLinkedLead((role === "admin" || role === "project_manager") && candidate ? readLeads().find(lead=>lead.id===candidate.leadId||lead.projectId===candidate.id)??null:null);
      setManagedPlan((role === "admin" || role === "project_manager") ? readManagedProjects().find((item) => item.sourceProjectId === projectId) ?? null : null);
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
    if (!project || (role !== "admin" && role !== "project_manager")) return;
    updateProject(project.id, updates);
    setProject(readProjects().find(item => item.id === project.id) ?? null);
  }

  function markProjectComplete() {
    if ((role !== "admin" && role !== "project_manager")) return;
    save({ status: "COMPLETED" });
  }

  function moveFromRetainerToProjects() {
    if (!project || (role !== "admin" && role !== "project_manager")) return;
    if (!window.confirm(`Move "${getProjectDisplayTitle(project)}" out of Retainers and back to active Projects?`)) return;
    if (managedPlan) {
      deleteManagedProject(managedPlan.id);
      setManagedPlan(null);
    }
    save({ status: "ACTIVE" });
    showToast({ message: `"${getProjectDisplayTitle(project)}" reactivated and moved to active projects.` });
  }

  function removeProject() {
    if (!project || (role !== "admin" && role !== "project_manager")) return;
    if (!window.confirm(`Delete “${getProjectDisplayTitle(project)}”? This will permanently remove its workspace and tasks.`)) return;
    deleteProject(project.id);
    router.push("/projects");
  }

  function dispatchTask(task: ProjectWorkItem) {
    if ((role !== "admin" && role !== "project_manager")) return;
    save({ workItems: [task, ...(project?.workItems ?? [])] });
    setShowDispatch(false);
    setActiveTab("Overview");
    showToast({ message: `Task "${task.title}" dispatched to Tasks` });
  }

  function setProjectLink(key: "staging" | "repository" | "design" | "other") {
    if (!project || ((role !== "admin" && role !== "project_manager") && !((role === "employee") && key === "staging"))) return;
    const labels = { staging: "Staging URL", repository: "Repository URL", design: "Design file URL", other: "Other project link" };
    const value = window.prompt(labels[key], project.links?.[key] || "");
    if (value === null) return;
    if (value.trim() && !/^https?:\/\//i.test(value.trim())) { showToast({message:"Enter a link starting with https:// or http://"}); return; }
    const updates = { links: { ...project.links, [key]: value.trim() || undefined } };
    if ((role === "admin" || role === "project_manager")) save(updates);
    else {
      updateProject(project.id, updates);
      setProject(readProjects().find(item => item.id === project.id) ?? null);
    }
  }

  if (loading) return <div className="page-content"><div className="panel pipeline-empty"><p>Loading project workspace…</p></div></div>;
  if (!project) return <div className="page-content"><div className="panel pipeline-empty"><h2>Project workspace not found</h2><p>This project may have been removed or you may not have access to it.</p><Link className="button button-quiet" href="/projects"><ArrowLeft size={14} />Project portfolio</Link></div></div>;

  const workItems = (project.workItems ?? []).filter(task => canViewProjectTask(project, task, role, user?.id, employeeName));
  const taskStatusOrder: Record<ProjectWorkItem["status"], number> = { TO_DO: 0, IN_PROGRESS: 1, UNDER_REVIEW: 2, BLOCKED: 3, DONE: 4 };
  const sortedWorkItems = [...workItems].sort((a, b) => taskStatusOrder[a.status] - taskStatusOrder[b.status]);
  const clientBlocked = workItems.some((task) => task.status === "BLOCKED");
  const marginAlert = workItems.some((task) => task.estimatedHours > 0 && task.loggedHours / task.estimatedHours >= 0.85);
  const health = clientBlocked ? "Blocked work" : marginAlert ? "Margin alert" : null;

  const teamMembers = getProjectTeamMembers(project);
  const services = getProjectDisplayServices(project);

  const contactLead=linkedLead||(canEditRecordDetails(role)&&project.clientEmail?readLeads().find(lead=>lead.email?.trim().toLowerCase()===project.clientEmail.trim().toLowerCase()):undefined);
  const enquiryDetails=getProjectEnquiryDetails(project,contactLead);
  const acceptedProposal=[...(linkedLead?.proposals??[])].filter(item=>item.status==="ACCEPTED").sort((a,b)=>b.version-a.version)[0];
  const sowUrl=linkedLead?.acceptanceDocumentDataUrl||project.signedContractDataUrl;
  const sowName=linkedLead?.acceptanceDocumentName||project.signedContractName;
  const projectLogo = getProjectLogoSrc(project);
  return <div className="page-content project-detail-page">
    <Link className="back-link" href="/projects"><ArrowLeft size={15} />Project portfolio</Link>
    <header className="record-heading project-room-heading"><div className="project-room-summary"><div className="project-room-identity">{projectLogo && <img className="project-workspace-logo" src={projectLogo} alt={`${getProjectDisplayTitle(project)} logo`} />}<h1>{getProjectDisplayTitle(project)}</h1></div><div className="project-room-copy"><p className="project-room-services">Project type: {project.projectType === "internal" ? "Internal" : "External"}</p>{services && <p className="project-room-services">{services}</p>}<div className="project-lifecycle-status"><StatusBadge status={project.status}/>{health && <StatusBadge status={health}/>}</div></div></div><div className="project-lifecycle-actions"><div className="project-lifecycle-buttons">{canEditRecordDetails(role)&&<button type="button" className="button button-quiet" onClick={()=>setEditingDetails(true)}>Edit project</button>}{(role === "admin" || role === "project_manager")&&((project.status === "COMPLETED" || project.status === "AMC") ? project.projectType === "internal" ? null : managedPlan ? <><Link className="button button-quiet" href="/post-sale" title="View retainer plan"><Check size={14} />In retainer · {managedPlan.id}</Link><button className="button button-quiet" type="button" onClick={moveFromRetainerToProjects} title="Move out of retainers and back to active projects"><FolderKanban size={14} />Move to active projects</button></> : <button className="button button-quiet" type="button" onClick={() => setShowManagedPlan(true)}><Handshake size={14} />Move to retainer</button> : <button className="button button-quiet" type="button" onClick={markProjectComplete}><Check size={14} />Mark complete</button>)}{(role === "admin" || role === "project_manager") && <button className="button button-quiet project-delete-button" type="button" onClick={removeProject}><Trash2 size={14} />Delete project</button>}</div></div></header>

    <section className="project-room-strip"><div><small>PROJECT STATUS</small><strong>{project.status === "COMPLETED" ? "Completed" : "Active"}</strong></div><div><small>OPEN WORK ITEMS</small><strong><Link href="/work" style={{ textDecoration: "none", color: "inherit" }}>{workItems.filter((task) => task.status !== "DONE").length} · In Tasks</Link></strong></div><div className="room-task-total"><small>TEAM MEMBERS</small><strong>{project.team.filter((member) => member.name.trim() && !DUMMY_ASSIGNABLE_NAMES.has(member.name.toLowerCase().trim())).length}</strong></div></section>

    {(role === "admin" || role === "project_manager") && <div className="project-dispatch-row"><button type="button" className="button button-primary room-dispatch-button" onClick={() => setShowDispatch(true)}><Plus size={14} />Dispatch task</button><ProjectLogoUpload compact value={project.logoDataUrl} onChange={logoDataUrl => save({logoDataUrl})} /></div>}

    <nav className="project-room-tabs" aria-label="Project room sections">
      {projectTabs.map((tab) => <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
    </nav>

    {activeTab === "Overview" && <>
      <section className="project-detail-grid">
        <div className="project-detail-main">
          <article className="panel project-data-panel project-scope-panel">
            <div className="panel-heading"><div><h2>Project scope</h2><p>Delivery details for this workspace</p></div></div>
            <div className="project-commercial-list">
              <div><small>Project type</small><strong>{project.projectType === "internal" ? "Internal" : "External"}</strong></div>
              {project.projectType !== "internal" && <div><small>Operating company</small><strong data-company={project.operatingCompany}>{project.operatingCompany ?? "Not selected"}</strong></div>}
              {project.projectType !== "internal" && <div><small>Billing structure</small><strong>{project.billingStructure}</strong></div>}
              {(role === "admin" || role === "project_manager") && project.projectType !== "internal" && <div className="project-scope-copy"><small>Payment terms</small><p>{project.invoice?.paymentTerms || "No additional terms recorded."}</p></div>}
              {project.projectType === "internal" && <>
                <div><small>Priority</small><strong>{project.priority || "Normal"}</strong></div>
                <div><small>Start date</small><strong>{project.startDate || "Not set"}</strong></div>
                <div className="project-scope-copy"><small>Objectives</small><p>{project.objectives || "Not recorded"}</p></div>
              </>}
              <div className="project-scope-copy"><small>{project.projectType === "internal" ? "Description" : "Included scope"}</small><p>{project.scopeIncluded || "Not recorded"}</p></div>
              <div className="project-scope-copy"><small>Excluded scope</small><p>{project.scopeExcluded || "None specified"}</p></div>
              <div className="project-scope-copy"><small>Assumptions</small><p>{project.assumptions || "None specified"}</p></div>
            </div>
          </article>
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
              <div className="project-task-summary-list" tabIndex={0} role="region" aria-label="Project tasks, scroll for more">
                {sortedWorkItems.map((task) => (
                  <div className="project-task-summary-item" key={task.id}>
                    <div>
                      <strong title={task.title}>{task.title}</strong>
                      <small>{task.assignee || "Unassigned"} · {task.status.replaceAll("_", " ")}</small>
                    </div>
                    <span className={`work-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                  </div>
                ))}
              </div>
            </article>
          )}
        </div>
        <aside className="project-detail-side"><article className="panel project-data-panel project-team-panel">
          <div className="panel-heading"><div><h2>Project Team</h2><p>Project manager and assigned team members</p></div></div>
          {(role === "admin" || role === "project_manager") ? <label className="field">Assigned project manager<select aria-label="Assigned project manager" value={project.team.find(member=>member.role==="Project Manager")?.userId||managerOptions.find(person=>person.name===project.team.find(member=>member.role==="Project Manager")?.name)?.id||""} onChange={event=>{
            if(role!=="admin")return;
            const manager=managerOptions.find(person=>person.id===event.target.value && person.role === "project_manager");
            if(!manager)return;
            updateProject(project.id,{team:[...project.team.filter(member=>member.role!=="Project Manager"),{role:"Project Manager",name:manager.name,userId:manager.id,allocationPercent:0}]});
            showToast({message:"Project manager updated."});
          }}><option value="" disabled>Select a project manager</option>{managerOptions.filter(person=>person.id && person.role === "project_manager").map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label> : <div className="field"><span>Assigned project manager</span><p>{project.team.find(member=>member.role==="Project Manager")?.name||"Unassigned"}</p></div>}
          <div className="project-team-roster"><h3>Team members</h3>
            {teamMembers.length ? <ul>{teamMembers.map(member=><li key={member.userId||member.name.trim().toLowerCase()}><span>{member.name}</span><small>Team member</small></li>)}</ul> : <p>Team members appear here when tasks are assigned.</p>}
          </div>
        </article>
          {project.projectType !== "internal" && <article className="panel project-data-panel"><div className="panel-heading"><div><h2>Project documents</h2><p>Accepted proposal and project records</p></div><FileText size={16} /></div><div className="document-links">{acceptedProposal?.shareToken && <Link href={`/proposal/${acceptedProposal.shareToken}`}><FileText size={14}/>{acceptedProposal.proposalTitle || "Accepted proposal"} · Accepted</Link>}{acceptedProposal?.documentDataUrl && <a href={acceptedProposal.documentDataUrl} download={acceptedProposal.documentName}><Download size={14}/>Accepted proposal attachment</a>}{sowUrl && sowName && <a href={sowUrl} download={sowName}><Download size={14}/>{sowName} · Signed SOW</a>}{(role === "admin" || role === "project_manager") && (project.invoice ? <Link href={`/invoices?invoice=${project.invoice.invoiceNumber}`}><ExternalLink size={14} />{project.invoice.invoiceNumber} · invoice record</Link> : <Link className="document-pending" href={`/invoices?project=${project.id}`} style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px", color: "inherit" }}><Receipt size={13} />No invoice recorded · Create invoice</Link>)}</div></article>}</aside>
      </section>
    </>}

    {activeTab === "Project status" && <ProjectStatusBoard project={project} />}
    {activeTab === "Messages" && <section className="panel portal-record"><ProjectConversation projectId={project.id}/></section>}
    {activeTab === "Staging & Links" && <section className="panel ops-panel"><div className="panel-heading"><div><h2>Project links & environments</h2><p>Keep the team's staging, source, and design references attached to this workspace.</p></div></div><div className="project-link-grid">{([["staging", "Staging environment"], ["repository", "Source repository"], ["design", "Design file"], ["other", "Other reference"]] as const).map(([key, label]) => { const value = project.links?.[key]; return <article className="project-link-card" key={key}><span className="project-link-icon"><Link2 size={16} /></span><div><small>{label}</small>{value ? <a href={value} target="_blank" rel="noreferrer">{value}<ExternalLink size={12} /></a> : <strong>Not added</strong>}</div>{((role === "admin" || role === "project_manager") || ((role === "employee") && key === "staging")) && <button type="button" className="button button-quiet" onClick={() => setProjectLink(key)}>{value ? "Edit link" : "Add link"}</button>}</article>; })}</div><p className="storage-note">Project links are saved to your workspace. Repository and hosting permissions are managed by their providers.</p></section>}

    {canEditRecordDetails(role)&&editingDetails&&<EditDetailsDialog title="Edit project details" onClose={()=>setEditingDetails(false)} fields={[
      {name:"title",label:"Project title",value:project.title,required:true},
      {name:"services",label:"Services (comma separated)",value:getProjectDisplayServices(project)},
      {name:"objectives",label:"Objectives",value:project.objectives,type:"textarea"},
      {name:"deliverables",label:"Deliverables",value:project.deliverables,type:"textarea"},
      {name:"scopeIncluded",label:"Description / included scope",value:project.scopeIncluded,type:"textarea"},
      {name:"scopeExcluded",label:"Excluded scope",value:project.scopeExcluded,type:"textarea"},
      {name:"assumptions",label:"Assumptions",value:project.assumptions,type:"textarea"},
      {name:"startDate",label:"Start date",value:project.startDate,type:"date",required:true},
      {name:"targetDate",label:"Target date",value:project.targetDate,type:"date"},
      {name:"priority",label:"Priority",value:project.priority||"Normal",options:["Low","Normal","High","Urgent"]},
      ...(project.projectType!=="internal"?[
        {name:"clientCompany",label:"Client company",value:project.clientCompany},
        {name:"clientName",label:"Contact name",value:project.clientName,required:true},
        {name:"clientEmail",label:"Contact email",value:project.clientEmail,type:"email" as const},
        {name:"phone",label:"Phone number",value:enquiryDetails.phone},
        {name:"designation",label:"Designation",value:enquiryDetails.designation},
        {name:"companyWebsite",label:"Company website",value:enquiryDetails.companyWebsite},
        {name:"country",label:"Country",value:enquiryDetails.country},
        {name:"timezone",label:"Timezone",value:enquiryDetails.timezone},
        {name:"industry",label:"Industry",value:enquiryDetails.industry},
        {name:"enquiryDescription",label:"Original enquiry goals",value:enquiryDetails.description,type:"textarea" as const},
        {name:"referenceLinks",label:"Reference links",value:enquiryDetails.referenceLinks,type:"textarea" as const},
        {name:"budgetRange",label:"Estimated budget range",value:enquiryDetails.budgetRange},
        {name:"budgetShared",label:"Budget shared",value:enquiryDetails.budgetShared?"Yes":"No",options:["Yes","No"]},
        {name:"budgetNote",label:"Budget notes",value:enquiryDetails.budgetNote,type:"textarea" as const},
        {name:"urgency",label:"Urgency",value:enquiryDetails.urgency||"Standard",options:["Standard","Rush"]},
        {name:"source",label:"Enquiry source",value:enquiryDetails.source},
        {name:"acquisitionSource",label:"Acquisition source",value:enquiryDetails.acquisitionSource},
        {name:"operatingCompany",label:"Operating company",value:project.operatingCompany||"Evecture",options:["Evecture","Servn"]},
        {name:"classification",label:"Classification",value:project.classification,options:["New Client","Repeat Client","Referral"]},
        {name:"billingStructure",label:"Billing structure",value:project.billingStructure,options:["Fixed","Hourly","Retainer"]},
        {name:"contractedValue",label:"Contract value",value:project.contractedValue,type:"number" as const,min:0,required:true},
        {name:"currency",label:"Currency",value:project.currency,required:true},
        {name:"revisionRounds",label:"Revision rounds",value:project.revisionRounds,type:"number" as const,min:0},
      ]:[]),
    ]} onSave={async values=>{
      if(!canEditRecordDetails(role))throw new Error("You do not have permission to edit projects.");
      if(values.targetDate&&values.targetDate<values.startDate)throw new Error("Target date must be on or after the start date.");
      const updates:Partial<Project>={title:values.title,services:parseServiceDetails(values.services),scopeIncluded:values.scopeIncluded,objectives:values.objectives,deliverables:values.deliverables,scopeExcluded:values.scopeExcluded,assumptions:values.assumptions,startDate:values.startDate,targetDate:values.targetDate||undefined,priority:values.priority as Project["priority"]};
      if(project.projectType!=="internal"){
        validateProjectServiceDetails(values.title, updates.services ?? []);
        const currency=values.currency.toUpperCase();
        if(!/^[A-Z]{3}$/.test(currency))throw new Error("Enter a three-letter currency code.");
        if(!Number.isInteger(Number(values.revisionRounds))||Number(values.revisionRounds)<0)throw new Error("Revision rounds must be a whole number.");
        Object.assign(updates,{enquiryDetails:{...enquiryDetails,phone:values.phone,designation:values.designation,companyWebsite:values.companyWebsite,country:values.country,timezone:values.timezone,industry:values.industry,description:values.enquiryDescription,referenceLinks:values.referenceLinks,budgetRange:values.budgetRange,budgetShared:values.budgetShared==="Yes",budgetNote:values.budgetNote,urgency:values.urgency as Lead["urgency"],source:values.source,acquisitionSource:values.acquisitionSource},operatingCompany:values.operatingCompany,clientCompany:values.clientCompany,clientName:values.clientName,clientEmail:values.clientEmail,classification:values.classification,billingStructure:values.billingStructure,contractedValue:Number(values.contractedValue),currency,revisionRounds:Number(values.revisionRounds)});
      }
      updateProject(project.id,updates);await flushWorkspaceChanges();showToast({message:"Project details saved."});
    }}/>}
    {(role === "admin" || role === "project_manager") && showDispatch && <TaskDispatchDialog project={project} onClose={() => setShowDispatch(false)} onDispatch={dispatchTask} />}
    {(role === "admin" || role === "project_manager") && showManagedPlan && <ManagedPlanDrawer projects={[project]} initialProjectId={project.id} onClose={() => setShowManagedPlan(false)} onCreated={(item) => setManagedPlan(item)} />}
    <p className="storage-note">Changes are saved to your workspace database.</p>
  </div>;
}
