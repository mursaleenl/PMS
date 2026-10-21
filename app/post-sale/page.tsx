"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { readProjects, type Project } from "@/lib/projects";
import { addManagedProject, nextManagedProjectId, readManagedProjects, type ManagedProject, type ManagementBillingCycle, type ManagementModel, updateManagedProject } from "@/lib/post-sale";

const managementModels: ManagementModel[] = ["Annual maintenance", "Continuous retainer", "Direct-sold software", "Ad-hoc support"];
const billingCycles: ManagementBillingCycle[] = ["Monthly", "Quarterly", "Annual", "One-time"];

function planStatus(item: ManagedProject) {
  if (item.status === "PAUSED") return "PAUSED";
  if (item.status === "ENDED") return "ENDED";
  const today = new Date().toISOString().slice(0, 10);
  if (item.periodStart > today) return "UPCOMING";
  if (item.periodEnd && item.periodEnd < today) return "EXPIRED";
  return "ACTIVE";
}

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function ManagedPlanDrawer({ projects, onClose, onCreated }: { projects: Project[]; onClose: () => void; onCreated: () => void }) {
  const [sourceId, setSourceId] = useState("");
  const [error, setError] = useState("");
  const selectedProject = projects.find((project) => project.id === sourceId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const item: ManagedProject = {
      id: nextManagedProjectId(),
      sourceProjectId: selectedProject?.id,
      projectTitle: selectedProject?.title || String(data.get("projectTitle") || "").trim(),
      clientCompany: selectedProject?.clientCompany || String(data.get("clientCompany") || "").trim(),
      model: String(data.get("model")) as ManagementModel,
      managementAmount: amount,
      currency: String(data.get("currency")),
      billingCycle: String(data.get("billingCycle")) as ManagementBillingCycle,
      periodStart: today,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    addManagedProject(item);
    onCreated();
    onClose();
  }

  return <div className="task-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="task-dispatch-drawer post-sale-drawer" role="dialog" aria-modal="true" aria-labelledby="managed-plan-title">
      <header><div><span className="eyebrow">POST-SALE</span><h2 id="managed-plan-title">Add managed plan</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close form"><X size={18}/></button></header>
      <form onSubmit={submit}>
        <label className="field">Project<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Add a project manually</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.clientCompany || project.clientName}</option>)}</select></label>
        {!selectedProject && <div className="post-sale-project-fields"><label className="field required">Project name<input name="projectTitle" required placeholder="Project name"/></label><label className="field required">Client / company<input name="clientCompany" required placeholder="Client or company"/></label></div>}
        <label className="field required">Plan type<select name="model" defaultValue="Annual maintenance">{managementModels.map((model) => <option key={model}>{model}</option>)}</select></label>
        <div className="post-sale-project-fields"><label className="field required">Amount<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00"/></label><label className="field required">Currency<select name="currency" defaultValue="USD">{["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className="field required">Billing cycle<select name="billingCycle" defaultValue="Monthly">{billingCycles.map((cycle) => <option key={cycle}>{cycle}</option>)}</select></label></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Plus size={14}/>Add managed plan</button></footer>
      </form>
    </aside>
  </div>;
}

export default function PostSalePage() {
  const [items, setItems] = useState<ManagedProject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    const refreshPlans = () => setItems(readManagedProjects());
    const refreshProjects = () => setProjects(readProjects());
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

  return <div className="page-content post-sale-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>POST-SALE</div><h1>Managed plans</h1><p className="welcome-subtitle">Keep track of ongoing client plans.</p></div><button className="button button-primary" type="button" onClick={() => setShowCreate(true)}><Plus size={15}/>Add managed plan</button></section>
    <section className="panel post-sale-records"><div className="panel-heading"><div><h2>Managed plans</h2><p>{items.length} {items.length === 1 ? "plan" : "plans"}</p></div><label className="post-sale-filter">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All plans</option><option value="ACTIVE">Active</option><option value="UPCOMING">Upcoming</option><option value="PAUSED">Paused</option><option value="EXPIRED">Expired</option><option value="ENDED">Ended</option></select></label></div>
      {shownItems.length === 0 ? <div className="pipeline-empty projects-empty"><h2>{items.length === 0 ? "No managed plans" : "No matching plans"}</h2><p>{items.length === 0 ? "Add a plan to get started." : "Choose another status filter."}</p>{items.length === 0 && <button className="button button-primary" type="button" onClick={() => setShowCreate(true)}><Plus size={14}/>Add managed plan</button>}</div> : <div className="managed-project-list">{shownItems.map((item) => {
        const status = planStatus(item);
        const linked = item.sourceProjectId ? projects.find((project) => project.id === item.sourceProjectId) : undefined;
        return <article className="panel managed-project-card" key={item.id}><div className="managed-project-main"><div className="managed-project-heading"><div><span className="eyebrow">{item.model.toUpperCase()}</span><h2>{item.projectTitle}</h2><p>{item.clientCompany || "Client not named"}</p></div><span className={`management-status management-${status.toLowerCase()}`}><i/>{status}</span></div><div className="management-meta-grid"><div><small>Amount</small><strong>{money(item.managementAmount, item.currency)} <span>/ {item.billingCycle.toLowerCase()}</span></strong></div><div><small>Project</small>{linked ? <Link href={`/projects/${linked.id}`}>{linked.id} · Open project <ArrowRight size={12}/></Link> : <strong>{item.projectTitle}</strong>}</div></div>
          <div className="managed-project-footer"><span>{item.periodEnd ? `Ends ${new Date(`${item.periodEnd}T12:00:00`).toLocaleDateString()}` : "Ongoing"}</span><div>{status === "PAUSED" ? <button type="button" className="button button-quiet" onClick={() => setStatus(item, "ACTIVE")}>Resume</button> : status === "ACTIVE" && <button type="button" className="button button-quiet" onClick={() => setStatus(item, "PAUSED")}>Pause</button>}{status !== "ENDED" && <button type="button" className="button button-quiet management-end-button" onClick={() => setStatus(item, "ENDED")}>End plan</button>}</div></div>
        </div></article>;
      })}</div>}
    </section>
    {showCreate && <ManagedPlanDrawer projects={projects} onClose={() => setShowCreate(false)} onCreated={() => setItems(readManagedProjects())}/>}
  </div>;
}
