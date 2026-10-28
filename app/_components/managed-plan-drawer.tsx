"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { addManagedProject, nextManagedProjectId, type ManagedProject, type ManagementBillingCycle, type ManagementModel } from "@/lib/post-sale";
import type { Project } from "@/lib/projects";

const managementModels: ManagementModel[] = ["Annual maintenance", "Continuous retainer", "Direct-sold software", "Ad-hoc support"];
const billingCycles: ManagementBillingCycle[] = ["Monthly", "Quarterly", "Annual", "One-time"];

export function ManagedPlanDrawer({ projects, onClose, onCreated, initialProjectId }: {
  projects: Project[];
  onClose: () => void;
  onCreated: (item: ManagedProject) => void;
  initialProjectId?: string;
}) {
  const [sourceId, setSourceId] = useState(initialProjectId ?? "");
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
      clientCompany: selectedProject?.clientCompany || selectedProject?.clientName || String(data.get("clientCompany") || "").trim(),
      model: String(data.get("model")) as ManagementModel,
      managementAmount: amount,
      currency: String(data.get("currency")),
      billingCycle: String(data.get("billingCycle")) as ManagementBillingCycle,
      periodStart: today,
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    addManagedProject(item);
    onCreated(item);
    onClose();
  }

  return <div className="task-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="task-dispatch-drawer post-sale-drawer" role="dialog" aria-modal="true" aria-labelledby="managed-plan-title">
      <header><div><h2 id="managed-plan-title">Add retainer plan</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close form"><X size={18}/></button></header>
      <form onSubmit={submit}>
        {initialProjectId ? <div className="post-sale-source-preview"><strong>{selectedProject?.title}</strong><span>{selectedProject?.clientCompany || selectedProject?.clientName}</span></div> : <label className="field">Project<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Add a project manually</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.clientCompany || project.clientName}</option>)}</select></label>}
        {!selectedProject && <div className="post-sale-project-fields"><label className="field required">Project name<input name="projectTitle" required placeholder="Project name"/></label><label className="field required">Client / company<input name="clientCompany" required placeholder="Client or company"/></label></div>}
        <label className="field required">Plan type<select name="model" defaultValue="Annual maintenance">{managementModels.map((model) => <option key={model}>{model}</option>)}</select></label>
        <div className="post-sale-project-fields"><label className="field required">Amount<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00"/></label><label className="field required">Currency<select name="currency" defaultValue="USD">{["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className="field required">Billing cycle<select name="billingCycle" defaultValue="Monthly">{billingCycles.map((cycle) => <option key={cycle}>{cycle}</option>)}</select></label></div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <footer><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit"><Plus size={14}/>Add retainer plan</button></footer>
      </form>
    </aside>
  </div>;
}
