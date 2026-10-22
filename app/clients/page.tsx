"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Users } from "lucide-react";
import { readProjects, type Project } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { EmptyState } from "@/app/_components/empty-state";

type ClientRecord = {
  key: string;
  name: string;
  contactName?: string;
  email?: string;
  projects: { id: string; title: string }[];
  managedPlans: number;
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
      const client = clientMap.get(key) ?? { key, name, contactName: project.clientCompany ? project.clientName : undefined, email: project.clientEmail || undefined, projects: [], managedPlans: 0 };
      client.projects.push({ id: project.id, title: project.title });
      clientMap.set(key, client);
    }
    for (const plan of plans) {
      const name = plan.clientCompany || "";
      if (!name.trim()) continue;
      const key = clientKey(name);
      const client = clientMap.get(key) ?? { key, name, projects: [], managedPlans: 0 };
      client.managedPlans += 1;
      clientMap.set(key, client);
    }
    return [...clientMap.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [projects, plans]);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId || clients.length === 0) return;
    window.requestAnimationFrame(() => document.getElementById(decodeURIComponent(targetId))?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [clients]);

  return <div className="page-content clients-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot" />WORKSPACE</div><h1>Clients</h1><p className="welcome-subtitle">Clients from your active projects and managed plans.</p></div></section>
    {clients.length === 0 ? <EmptyState icon={<Users size={22} />} title="No clients yet" description="Clients will appear here when you add projects or managed plans." action={<Link className="button button-primary" href="/projects">Open projects <ArrowRight size={15} /></Link>} /> : <div className="panel client-table-wrap"><table className="client-table"><thead><tr><th>Client</th><th>Primary contact</th><th>Projects</th><th>Managed plans</th></tr></thead><tbody>{clients.map((client) => <tr id={`client-${clientSlug(client.name)}`} key={client.key}><td><strong>{client.name}</strong></td><td>{client.contactName ? <strong>{client.contactName}</strong> : <span className="table-muted">—</span>}{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}</td><td>{client.projects.length ? <div className="client-table-projects">{client.projects.map((project) => <Link href={`/projects/${project.id}`} key={project.id}><span>{project.title}</span><small className="mono-meta">{project.id}</small></Link>)}</div> : <span className="table-muted">No project linked</span>}</td><td><span className="client-plan-count">{client.managedPlans}</span></td></tr>)}</tbody></table></div>}
  </div>;
}
