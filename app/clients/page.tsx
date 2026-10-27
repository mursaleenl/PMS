"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ExternalLink, Mail, Users } from "lucide-react";
import { readProjects, type Project } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { EmptyState } from "@/app/_components/empty-state";

type ClientRecord = {
  key: string;
  name: string;
  contactName?: string;
  email?: string;
  projects: { id: string; title: string }[];
  managedPlans: ManagedProject[];
};

function clientKey(company: string, email = "", name = "") {
  if (company.trim()) return `company:${company.trim().toLocaleLowerCase()}`;
  if (email.trim()) return `email:${email.trim().toLocaleLowerCase()}`;
  return `name:${name.trim().toLocaleLowerCase()}`;
}

function clientSlug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
}

export default function ClientsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<ManagedProject[]>([]);

  useEffect(() => {
    const refreshProjects = () => setProjects(readProjects());
    const refreshPlans = () => setPlans(readManagedProjects());
    const refresh = () => { refreshProjects(); refreshPlans(); };
    refresh();
    window.addEventListener("evecture:projects-updated", refreshProjects);
    window.addEventListener("evecture:post-sale-updated", refreshPlans);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:projects-updated", refreshProjects);
      window.removeEventListener("evecture:post-sale-updated", refreshPlans);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const clients = useMemo(() => {
    const clientMap = new Map<string, ClientRecord>();
    for (const project of projects) {
      const name = project.clientCompany || project.clientName;
      if (!name.trim()) continue;
      const key = clientKey(project.clientCompany, project.clientEmail, project.clientName);
      const client = clientMap.get(key) ?? { key, name, contactName: project.clientCompany ? project.clientName : undefined, email: project.clientEmail || undefined, projects: [], managedPlans: [] };
      client.projects.push({ id: project.id, title: project.title });
      clientMap.set(key, client);
    }
    for (const plan of plans) {
      const name = plan.clientCompany || "";
      if (!name.trim()) continue;
      const key = clientKey(name);
      const client = clientMap.get(key) ?? { key, name, projects: [], managedPlans: [] };
      client.managedPlans.push(plan);
      clientMap.set(key, client);
    }
    return [...clientMap.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [projects, plans]);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId || clients.length === 0) return;
    window.requestAnimationFrame(() => document.getElementById(decodeURIComponent(targetId))?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [clients]);

  return <div className="page-content clients-page">
    <section className="welcome-row"><div><h1>Clients</h1><p className="welcome-subtitle">Keep client relationships and linked work in one place.</p></div></section>
    {clients.length === 0 ? <EmptyState icon={<Users size={22} />} title="No clients yet" description="Clients will appear here when you add projects or managed plans." action={<Link className="button button-primary" href="/projects">Open projects <ArrowRight size={15} /></Link>} /> : <div className="clients-list">{clients.map((client) => {
      const clientId = `client-${clientSlug(client.name)}`;
      const isExpanded = expandedClient === client.key;
      return <article className={`client-card panel ${isExpanded ? "client-card-expanded" : ""}`} id={clientId} key={client.key}>
        <button className="client-card-summary" type="button" aria-expanded={isExpanded} onClick={() => setExpandedClient(isExpanded ? null : client.key)}>
          <span className="client-card-main"><strong>{client.name}</strong><small>{client.contactName || "No primary contact"}{client.email ? ` · ${client.email}` : ""}</small></span>
          <span className="client-card-stat"><strong>{client.projects.length}</strong><small>Projects</small></span>
          <span className="client-card-stat"><strong>{client.managedPlans.length}</strong><small>Managed plans</small></span>
          <ChevronDown size={21} className="client-card-chevron" />
        </button>
        {isExpanded && <div className="client-card-details">
          <section><h2>Primary contact</h2>{client.contactName ? <strong>{client.contactName}</strong> : <span className="table-muted">No contact recorded</span>}{client.email && <a href={`mailto:${client.email}`}><Mail size={14} />{client.email}</a>}</section>
          <section><h2>Projects</h2>{client.projects.length ? <div className="client-detail-links">{client.projects.map((project) => <Link href={`/projects/${project.id}`} key={project.id}><span>{project.title}</span><small>{project.id}<ExternalLink size={13} /></small></Link>)}</div> : <span className="table-muted">No project linked</span>}</section>
          <section><h2>Managed plans</h2>{client.managedPlans.length ? <div className="client-plan-list">{client.managedPlans.map((plan) => <div key={plan.id}><strong>{plan.model}</strong><span>{plan.currency} {plan.managementAmount.toLocaleString()} · {plan.billingCycle}</span></div>)}</div> : <span className="table-muted">No managed plans</span>}</section>
        </div>}
      </article>;
    })}</div>}
  </div>;
}
