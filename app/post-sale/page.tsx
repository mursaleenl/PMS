"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { ManagedPlanDrawer } from "@/app/_components/managed-plan-drawer";
import { readProjects, type Project } from "@/lib/projects";
import { readManagedProjects, type ManagedProject, updateManagedProject } from "@/lib/post-sale";
import { StatusBadge } from "@/app/_components/status-badge";

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
    <section className="welcome-row"><div><h1>Managed plans</h1><p className="welcome-subtitle">Track ongoing client support and maintenance.</p></div><button className="button button-primary" type="button" onClick={() => setShowCreate(true)}><Plus size={15} />Add managed plan</button></section>
    <section className="panel post-sale-records"><div className="panel-heading"><div><h2>Managed plans</h2><p>{items.length} {items.length === 1 ? "plan" : "plans"}</p></div><label className="post-sale-filter">Show<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All plans</option><option value="ACTIVE">Active</option><option value="UPCOMING">Upcoming</option><option value="PAUSED">Paused</option><option value="EXPIRED">Expired</option><option value="ENDED">Ended</option></select></label></div>
      {shownItems.length === 0 ? <div className="pipeline-empty projects-empty"><h2>{items.length === 0 ? "No managed plans" : "No matching plans"}</h2><p>{items.length === 0 ? "Add a plan to get started." : "Choose another status filter."}</p>{items.length === 0 && <button className="button button-primary" type="button" onClick={() => setShowCreate(true)}><Plus size={14} />Add managed plan</button>}</div> : <div className="managed-project-list">{shownItems.map((item) => {
        const status = planStatus(item);
        const linked = item.sourceProjectId ? projects.find((project) => project.id === item.sourceProjectId) : undefined;
        return <article className="panel managed-project-card" key={item.id}><div className="managed-project-main"><div className="managed-project-heading"><div><h2>{item.projectTitle}</h2><p>{item.clientCompany || "Client not named"}</p></div><StatusBadge status={status} /></div><div className="management-meta-grid"><div><small>Amount</small><strong>{money(item.managementAmount, item.currency)} <span>/ {item.billingCycle.toLowerCase()}</span></strong></div><div><small>Project</small>{linked ? <Link href={`/projects/${linked.id}`}><span className="mono-meta">{linked.id}</span> · Open project <ArrowRight size={12} /></Link> : <strong>{item.projectTitle}</strong>}</div></div>
          <div className="managed-project-footer"><span>{item.periodEnd ? `Ends ${new Date(`${item.periodEnd}T12:00:00`).toLocaleDateString()}` : "Ongoing"}</span><div>{status === "PAUSED" ? <button type="button" className="button button-quiet" onClick={() => setStatus(item, "ACTIVE")}>Resume</button> : status === "ACTIVE" && <button type="button" className="button button-quiet" onClick={() => setStatus(item, "PAUSED")}>Pause</button>}{status !== "ENDED" && <button type="button" className="button button-quiet management-end-button" onClick={() => setStatus(item, "ENDED")}>End plan</button>}</div></div>
        </div></article>;
      })}</div>}
    </section>
    {showCreate && <ManagedPlanDrawer projects={projects} onClose={() => setShowCreate(false)} onCreated={() => setItems(readManagedProjects())} />}
  </div>;
}
