"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FolderKanban, Handshake, Inbox, Search, Users, X } from "lucide-react";
import { formatLeadId, readLeads, type Lead } from "@/lib/leads";
import { readProjects, type Project, isProjectAssignedToUser } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

type SearchItem = { kind: string; title: string; detail: string; href: string; terms: string };

function clientSlug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
}

export function CommandPalette() {
  const { role, user, members } = useWorkspaceAuth();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
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
        setTerm(""); setActiveIndex(0);
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    const openPalette = () => { setTerm(""); setActiveIndex(0); setOpen(true); };
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

  useEffect(() => {
    if (open) { setPresent(true); return; }
    const timer = window.setTimeout(() => setPresent(false), 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!present) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("input")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [present]);

  const results = useMemo(() => {
    const items: SearchItem[] = [];
    const employeeName = (members.find((member) => member.user_id === user?.id)?.display_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim();
    for (const lead of (role === "employee") ? [] : leads) {
      items.push({ kind: "Request", title: lead.companyName || lead.fullName, detail: `${formatLeadId(lead.id)} · ${lead.status.replaceAll("_", " ")}`, href: `/requests/${lead.id}`, terms: `${lead.fullName} ${lead.companyName} ${lead.email} ${lead.services.join(" ")} ${lead.id}` });
    }
    for (const project of projects.filter((item) => (role !== "employee") || isProjectAssignedToUser(item, user?.id, employeeName))) items.push({ kind: "Project", title: project.title, detail: `${project.id} · ${project.clientCompany || project.clientName}`, href: `/projects/${project.id}`, terms: `${project.title} ${project.id} ${project.clientCompany} ${project.clientName} ${project.services.join(" ")}` });
    const clients = new Map<string, { name: string; detail: string; terms: string }>();
    for (const project of projects) {
      const clientName = project.clientName?.trim() || project.clientCompany?.trim();
      const company = project.clientCompany?.trim();
      if (clientName) {
        const detail = company && company.toLowerCase() !== clientName.toLowerCase()
          ? `Client · ${company}`
          : `Client · ${project.clientEmail || "Project record"}`;
        clients.set(clientName.toLowerCase(), {
          name: clientName,
          detail,
          terms: `${clientName} ${company || ""} ${project.clientEmail || ""}`,
        });
      }
    }
    for (const plan of (role === "employee") ? [] : plans) {
      const name = plan.clientCompany || plan.projectTitle;
      items.push({ kind: "Retainers", title: plan.projectTitle, detail: `${name} · ${plan.model}`, href: "/post-sale", terms: `${name} ${plan.projectTitle} ${plan.model}` });
      if (plan.clientCompany && !clients.has(plan.clientCompany.toLowerCase())) {
        clients.set(plan.clientCompany.toLowerCase(), { name: plan.clientCompany, detail: "Client · Managed plan", terms: plan.clientCompany });
      }
    }
    if ((role !== "employee")) for (const client of clients.values()) items.push({ kind: "Client", title: client.name, detail: client.detail, href: `/clients#client-${clientSlug(client.name)}`, terms: client.terms });
    const query = term.trim().toLowerCase();
    if (!query) return [];
    const words = query.split(/\s+/);
    const score = (item: SearchItem) => {
      const title = item.title.toLowerCase();
      return title === query ? 3 : title.startsWith(query) ? 2 : title.includes(query) ? 1 : 0;
    };
    return items.filter(item => words.every(word => `${item.title} ${item.detail} ${item.terms}`.toLowerCase().includes(word)))
      .sort((a, b) => score(b) - score(a)).slice(0, 12);
  }, [leads, projects, plans, term, role, user?.id, user?.email, user?.user_metadata, members]);

  if (!present) return null;
  return <div className={`command-backdrop${!open ? " is-closing" : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section ref={dialog} className="command-dialog" onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('input, button, a[href]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }} role="dialog" aria-modal="true" aria-label="Search workspace">
      <div className="command-search-row"><Search size={19} /><input aria-label="Search workspace" value={term} autoComplete="off" spellCheck={false} onChange={(event) => { setTerm(event.target.value); setActiveIndex(0); }} onKeyDown={event => {
        if (event.nativeEvent.isComposing || !results.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          setActiveIndex(next);
          dialog.current?.querySelectorAll<HTMLAnchorElement>(".command-result")[next]?.scrollIntoView({block: "nearest"});
        }
        if (event.key === "Enter") { event.preventDefault(); dialog.current?.querySelectorAll<HTMLAnchorElement>(".command-result")[Math.min(activeIndex, results.length - 1)]?.click(); }
      }} placeholder={(role === "employee") ? "Search assigned projects…" : "Search requests, clients, projects, retainers…"} /><kbd>ESC</kbd><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close search"><X size={17} /></button></div>
      {term.trim() ? <div className="command-results">{results.length ? results.map((item, index) => {
        const Icon = item.kind === "Request" ? Inbox : item.kind === "Project" ? FolderKanban : item.kind === "Client" ? Users : Handshake;
        return <Link href={item.href} className={`command-result${index === Math.min(activeIndex, results.length - 1) ? " is-active" : ""}`} onMouseEnter={() => setActiveIndex(index)} key={`${item.kind}-${item.href}-${item.title}`} onClick={() => setOpen(false)}><span className="command-result-icon"><Icon size={16} /></span><span className="command-result-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="command-result-kind">{item.kind}</span><ArrowRight size={15} /></Link>;
      }) : <div className="command-empty">{(role === "employee") ? "No matching assigned projects." : "No matching records. Try a client, project, lead, or retainer."}</div>}</div> : null}
      {term.trim() && results.length > 0 && <div className="command-navigation-hint" role="status">{results.length} results <span>↑ ↓ to navigate · Enter to open</span></div>}
    </section>
  </div>;
}
