"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Command, FolderKanban, Handshake, Inbox, Search, Users, X } from "lucide-react";
import { formatLeadId, readLeads, type Lead } from "@/lib/leads";
import { readProjects, type Project } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";

type SearchItem = { kind: string; title: string; detail: string; href: string; terms: string };

function clientSlug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<ManagedProject[]>([]);

  useEffect(() => {
    const refresh = () => {
      setLeads(readLeads());
      setProjects(readProjects());
      setPlans(readManagedProjects());
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:post-sale-updated", refresh);
    window.addEventListener("storage", refresh);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setTerm("");
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const openPalette = () => { setTerm(""); setOpen(true); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("evecture:command-open", openPalette);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("evecture:post-sale-updated", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("evecture:command-open", openPalette);
    };
  }, []);

  const results = useMemo(() => {
    const items: SearchItem[] = [];
    for (const lead of leads) {
      items.push({ kind: "Request", title: lead.companyName || lead.fullName, detail: `${formatLeadId(lead.id)} · ${lead.status.replaceAll("_", " ")}`, href: `/requests/${lead.id}`, terms: `${lead.fullName} ${lead.companyName} ${lead.email} ${lead.services.join(" ")} ${lead.id}` });
    }
    for (const project of projects) items.push({ kind: "Project", title: project.title, detail: `${project.id} · ${project.clientCompany || project.clientName}`, href: `/projects/${project.id}`, terms: `${project.title} ${project.id} ${project.clientCompany} ${project.clientName} ${project.services.join(" ")}` });
    const clients = new Map<string, { name: string; detail: string; terms: string }>();
    for (const project of projects) {
      const name = project.clientCompany || project.clientName;
      if (name) clients.set(name.toLowerCase(), { name, detail: `Client · ${project.clientEmail || "Project record"}`, terms: `${name} ${project.clientName} ${project.clientEmail}` });
    }
    for (const plan of plans) {
      const name = plan.clientCompany || plan.projectTitle;
      items.push({ kind: "Retainers", title: plan.projectTitle, detail: `${name} · ${plan.model}`, href: "/post-sale", terms: `${name} ${plan.projectTitle} ${plan.model}` });
      if (plan.clientCompany && !clients.has(plan.clientCompany.toLowerCase())) clients.set(plan.clientCompany.toLowerCase(), { name: plan.clientCompany, detail: "Client · Managed plan", terms: plan.clientCompany });
    }
    for (const client of clients.values()) items.push({ kind: "Client", title: client.name, detail: client.detail, href: `/clients#client-${clientSlug(client.name)}`, terms: client.terms });
    const query = term.trim().toLowerCase();
    return (query ? items.filter((item) => `${item.title} ${item.detail} ${item.terms}`.toLowerCase().includes(query)) : []).slice(0, 12);
  }, [leads, projects, plans, term]);

  if (!open) return null;
  return <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Search workspace">
      <div className="command-search-row"><Search size={19} /><input autoFocus value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search requests, clients, projects, retainers…" /><kbd>ESC</kbd><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close search"><X size={17} /></button></div>
      {term.trim() ? <div className="command-results">{results.length ? results.map((item) => {
        const Icon = item.kind === "Request" ? Inbox : item.kind === "Project" ? FolderKanban : item.kind === "Client" ? Users : Handshake;
        return <Link href={item.href} className="command-result" key={`${item.kind}-${item.href}-${item.title}`} onClick={() => setOpen(false)}><span className="command-result-icon"><Icon size={16} /></span><span className="command-result-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="command-result-kind">{item.kind}</span><ArrowRight size={15} /></Link>;
      }) : <div className="command-empty">No matching records. Try a client, project, lead, or retainer.</div>}</div> : <div className="command-hint"><span><Command size={14} /> Type to search your workspace</span><span>Leads · Projects · Clients · Retainers</span></div>}
      <footer className="command-footer"><span>Navigate with results</span><span><kbd>⌘</kbd> <kbd>K</kbd> to toggle</span></footer>
    </section>
  </div>;
}
