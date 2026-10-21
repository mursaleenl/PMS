"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Users } from "lucide-react";
import { readProjects, type Project } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";

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

  return <div className="page-content clients-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/>WORKSPACE</div><h1>Clients</h1><p className="welcome-subtitle">Clients from your active projects and managed plans.</p></div></section>
    {clients.length === 0 ? <section className="panel pipeline-empty projects-empty"><span className="empty-icon"><Users size={22}/></span><h2>No clients yet</h2><p>Clients will appear here when you add projects or managed plans.</p><Link className="button button-primary" href="/projects">Open projects <ArrowRight size={15}/></Link></section> : <section className="client-list">{clients.map((client) => <article className="panel client-card" key={client.key}><div className="client-card-heading"><div><h2>{client.name}</h2>{client.contactName && <p>{client.contactName}</p>}{client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}</div><span>{client.managedPlans} {client.managedPlans === 1 ? "managed plan" : "managed plans"}</span></div>{client.projects.length > 0 && <div className="client-projects"><small>PROJECTS</small>{client.projects.map((project) => <Link href={`/projects/${project.id}`} key={project.id}>{project.title}<ArrowRight size={13}/></Link>)}</div>}</article>)}</section>}
  </div>;
}
