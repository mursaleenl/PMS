"use client";
import { ProjectCardLogo } from "@/app/_components/project-card-logo";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, FolderKanban, Handshake, Plus, Pencil } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { EmptyState } from "@/app/_components/empty-state";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { getProjectDisplayTitle, getProjectDisplayServices, addProject, nextProjectId, readProjects, updateProject, type Project } from "@/lib/projects";
import { deleteManagedProject, readManagedProjects, type ManagedProject, updateManagedProject } from "@/lib/post-sale";
import { readLeads } from "@/lib/leads";
import {retainerEndDate} from "@/lib/retainer-dates";
import { StatusBadge } from "@/app/_components/status-badge";
import { showToast } from "@/app/_components/toast-hub";

function planStatus(item: ManagedProject) {
  if (item.status === "PAUSED") return "PAUSED";
  if (item.status === "ENDED") return "ENDED";
  const today = new Date().toISOString().slice(0, 10);
  if (item.periodStart > today) return "UPCOMING";
  const end=retainerEndDate(item);
  if (end && end < today) return "EXPIRED";
  return "ACTIVE";
}

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export default function PostSalePage() {
  const router = useRouter();
  const [items, setItems] = useState<ManagedProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPlan,setEditingPlan]=useState<ManagedProject|null>(null);
  const [filter, setFilter] = useState("ALL");
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  useEffect(() => {
    const refreshPlans = () => setItems(readManagedProjects());
    const refreshProjects = () => setProjects(readProjects().filter(project => project.projectType !== "internal"));
    const refreshStorage = () => { refreshPlans(); refreshProjects(); };
    refreshPlans();
    refreshProjects();
    window.addEventListener("evecture:post-sale-updated", refreshPlans);
    window.addEventListener("evecture:projects-updated", refreshProjects);
    window.addEventListener("storage", refreshStorage);
    return () => {
      window.removeEventListener("evecture:post-sale-updated", refreshPlans);
      window.removeEventListener("evecture:projects-updated", refreshProjects);
      window.removeEventListener("storage", refreshStorage);
    };
  }, []);

  const shownItems = items.filter((item) => filter === "ALL" || planStatus(item) === filter);

  function setStatus(item: ManagedProject, status: ManagedProject["status"]) {
    updateManagedProject(item.id, { status });
    setItems(readManagedProjects());
  }

  async function moveToProjects(item: ManagedProject) {
    if (!window.confirm(`Move "${item.projectTitle}" from Retainers to active Projects?`)) return;

    try {
    const currentProjects = readProjects().filter(project => project.projectType !== "internal");
    const linked = item.sourceProjectId ? currentProjects.find((p) => p.id === item.sourceProjectId) : undefined;

    let targetProjectId = "";
    if (linked) {
      updateProject(linked.id, { status: "ACTIVE" });
      targetProjectId = linked.id;
      showToast({ message: `"${getProjectDisplayTitle(linked)}" reactivated and moved to active projects.` });
    } else {
      targetProjectId = await nextProjectId();
      const allLeads = readLeads();
      const matchingLeads = allLeads.filter((l) => {
        if (!l.companyName || !item.clientCompany) return false;
        const c1 = l.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const c2 = item.clientCompany.toLowerCase().replace(/[^a-z0-9]/g, "");
        return c1 === c2;
      });

      const matchingLead = matchingLeads.length === 1 ? matchingLeads[0] : undefined;
      const newProject: Project = {
        id: targetProjectId,
        leadId: matchingLead?.id || "",
        createdAt: new Date().toISOString(),
        title: item.projectTitle,
        clientCompany: item.clientCompany,
        clientName: matchingLead?.fullName || item.clientCompany,
        clientEmail: matchingLead?.email || "",
        operatingCompany: matchingLead?.operatingCompany || "Evecture",
        services: [item.model || "Maintenance & Retainer"],
        classification: "Repeat Client",
        startDate: item.periodStart || new Date().toISOString().slice(0, 10),
        billingStructure: "Retainer",
        contractedValue: item.managementAmount,
        currency: item.currency || "USD",
        proposalVersion: 1,
        scopeIncluded: item.model || "Ongoing maintenance & retainer",
        scopeExcluded: "",
        assumptions: "",
        revisionRounds: 0,
        team: [],
        status: "ACTIVE",
      };
      addProject(newProject);
      showToast({ message: `Created project workspace and moved "${item.projectTitle}" to active projects.` });
    }

    deleteManagedProject(item.id);
    setItems(readManagedProjects());
    await flushWorkspaceChanges();
    router.push(`/projects/${targetProjectId}`);
    } catch(error) { showToast({message:error instanceof Error ? error.message : "Unable to move plan"}); }
  }

  return <div className="page-content post-sale-page clients-page">
    <section className="welcome-row">
      <div>
        <h1>Retainers & AMC</h1>
        <p className="welcome-subtitle">Track ongoing client support and maintenance contracts.</p>
      </div>
      <div className="welcome-actions">
        <label className="post-sale-filter">Show
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="ALL">All plans ({items.length})</option>
            <option value="ACTIVE">Active</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="PAUSED">Paused</option>
            <option value="EXPIRED">Expired</option>
            <option value="ENDED">Ended</option>
          </select>
        </label>
        <button className="button button-primary" type="button" onClick={() => setShowCreate(true)}>
          <Plus size={15} />Add retainer plan
        </button>
      </div>
    </section>

    {shownItems.length === 0 ? (
      <EmptyState
        icon={<Handshake size={22} />}
        title={items.length === 0 ? "No retainers yet" : "No matching retainers"}
        description={items.length === 0 ? "Add a retainer plan or move a completed project to retainers to track ongoing contracts." : "Try selecting a different status filter."}
        action={items.length === 0 ? <button className="button button-primary" type="button" onClick={() => setShowCreate(true)}><Plus size={14} />Add retainer plan</button> : undefined}
      />
    ) : (
      <div className="clients-list post-sale-list">
        {shownItems.map((item) => {
          const status = planStatus(item);
          const isExpanded = expandedPlan === item.id;
          const endDate=retainerEndDate(item);
          const linked = item.sourceProjectId ? projects.find((project) => project.id === item.sourceProjectId) : undefined;
          return (
            <article
              className={`client-card panel ${isExpanded ? "client-card-expanded" : ""}`}
              key={item.id}
              id={`plan-${item.id}`}
            >
              <button
                className="client-card-summary post-sale-card-summary"
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpandedPlan(isExpanded ? null : item.id)}
              >
                <span className="client-card-main">
                  <span className="project-card-identity"><ProjectCardLogo src={linked?.logoDataUrl} title={item.projectTitle} /><span><strong>{linked ? getProjectDisplayTitle(linked) : item.projectTitle || item.clientCompany}</strong><span className="project-display-services">{linked ? getProjectDisplayServices(linked) : item.model}</span></span></span>
                  <small>{item.clientCompany || "Client not named"}{item.model ? ` · ${item.model}` : ""}</small>
                </span>
                <span className="client-card-stat">
                  <strong>{money(item.managementAmount, item.currency)}</strong>
                  <small>/ {item.billingCycle.toLowerCase()}</small>
                </span>
                <span className="client-card-stat post-sale-status-cell">
                  <StatusBadge status={status} />
                </span>
                <ChevronDown size={21} className="client-card-chevron" />
              </button>
              {isExpanded && (
                <div className="client-card-details">
                  <section>
                    <h2>Plan details</h2>
                    <dl className="retainer-plan-facts">
                      <div><dt>Plan model</dt><dd>{item.model}</dd></div>
                      <div><dt>Billing cycle</dt><dd>{item.billingCycle}</dd></div>
                      <div><dt>Started</dt><dd>{item.periodStart ? new Date(`${item.periodStart}T12:00:00`).toLocaleDateString() : "Ongoing"}</dd></div>
                      <div><dt>Ends</dt><dd>{endDate ? new Date(`${endDate}T12:00:00`).toLocaleDateString() : "Not applicable (one-time)"}</dd></div>
                    </dl>
                  </section>
                  <section>
                    <h2>Linked project</h2>
                    {linked ? (
                      <div className="client-detail-links">
                        <Link href={`/projects/${linked.id}`}>
                          <span>{getProjectDisplayTitle(linked)}{getProjectDisplayServices(linked) && <span className="project-display-services">{getProjectDisplayServices(linked)}</span>}</span>
                          <small>{linked.id}<ExternalLink size={13} /></small>
                        </Link>
                      </div>
                    ) : (
                      <span className="table-muted">No project linked</span>
                    )}
                    <span>Client: <strong>{item.clientCompany || "Client not named"}</strong></span>
                  </section>
                  <section>
                    <h2>Plan management</h2>
                    <div className="post-sale-actions">
                      <button type="button" className="button button-quiet" onClick={()=>setEditingPlan(item)}><Pencil size={14}/>Edit plan</button>
                      {status === "PAUSED" ? (
                        <button type="button" className="button button-quiet" onClick={() => setStatus(item, "ACTIVE")}>
                          Resume plan
                        </button>
                      ) : status === "ACTIVE" ? (
                        <button type="button" className="button button-quiet" onClick={() => setStatus(item, "PAUSED")}>
                          Pause plan
                        </button>
                      ) : null}
                      {status !== "ENDED" && (
                        <button type="button" className="button button-quiet management-end-button" onClick={() => setStatus(item, "ENDED")}>
                          End plan
                        </button>
                      )}
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => moveToProjects(item)}
                        title="Move to active projects"
                      >
                        <FolderKanban size={14} />Move to projects
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </article>
          );
        })}
      </div>
    )}

    {editingPlan && <ManagedPlanDrawer projects={projects} plan={editingPlan} onClose={()=>setEditingPlan(null)} onCreated={()=>setItems(readManagedProjects())}/>}
    {showCreate && <ManagedPlanDrawer projects={projects} onClose={() => setShowCreate(false)} onCreated={() => setItems(readManagedProjects())} />}
  </div>;
}
