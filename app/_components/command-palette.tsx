"use client";

import Link from "next/link";
import {clientContactName} from "@/lib/client-identity";
import { getProjectLogoSrc } from "@/lib/project-logo";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, FolderKanban, Handshake, Inbox, Search, Users, X } from "lucide-react";
import { formatLeadId, readLeads, type Lead } from "@/lib/leads";
import { getProjectDisplayTitle, getProjectDisplayServices, readProjects, type Project, isProjectAssignedToUser } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

type SearchItem = { kind: string; title: string; detail: string; href: string; terms: string; logoSrc?: string };


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
      items.push({ kind: "Request", title: lead.projectName || lead.companyName || lead.fullName, detail: `${formatLeadId(lead.id)} · ${lead.status.replaceAll("_", " ")}`, href: `/requests/${lead.id}`, terms: `${lead.projectName || ""} ${lead.fullName} ${lead.companyName} ${lead.email} ${lead.services.join(" ")} ${lead.id}` });
    }
    for (const project of projects.filter((item) => (role !== "employee") || isProjectAssignedToUser(item, user?.id, employeeName))) items.push({ kind: "Project", logoSrc: getProjectLogoSrc(project), title: getProjectDisplayTitle(project), detail: `${project.id}${getProjectDisplayServices(project) ? ` - ${getProjectDisplayServices(project)}` : ""}`, href: `/projects/${project.id}`, terms: `${project.title} ${project.id} ${project.clientCompany} ${project.clientName} ${project.services.join(" ")}` });
    const clients = new Map<string, { name: string; detail: string; terms: string; href:string; company?:string }>();
    for (const project of projects.filter(project=>project.projectType!=="internal"&&!project.enquiryDetails?.clientDeleted)) {
      const contact=clientContactName(project.clientName),company=clientContactName(project.clientCompany);
      const name=contact||company||project.clientEmail||"Unnamed client";
      const key=project.clientEmail?`email:${project.clientEmail.trim().toLowerCase()}`:contact?`name:${contact.toLowerCase()}`:company?`company:${company.toLowerCase()}`:`project:${project.id}`;
      if(!clients.has(key))clients.set(key,{
        name,company,detail:`Client · ${company||project.clientEmail||project.id}`,
        terms:`${name} ${company} ${project.clientEmail||""} ${project.id} ${project.title}`,
        href:`/clients#client-project-${project.id}`,
      });
    }
    for (const plan of (role === "employee") ? [] : plans) {
      const name = plan.projectTitle || plan.clientCompany;
      items.push({ kind: "Retainers", title: plan.projectTitle, detail: `${name} · ${plan.model}`, href: "/post-sale", terms: `${name} ${plan.projectTitle} ${plan.model}` });
      if (!plan.clientDetails?.deleted&&plan.clientCompany && ![...clients.values()].some(client=>client.company?.toLowerCase()===plan.clientCompany.toLowerCase())) {
        clients.set(`plan:${plan.id}`, { name: clientContactName(plan.clientDetails?.name)||plan.clientCompany, company:plan.clientCompany, detail: "Client · Managed plan", terms: plan.clientCompany, href:`/clients#client-plan-${plan.id}` });
      }
    }
    if ((role !== "employee")) for (const client of clients.values()) items.push({ kind: "Client", title: client.name, detail: client.detail, href: client.href, terms: client.terms });
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
      }} placeholder="Search workspace…" /><kbd>ESC</kbd><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close search"><X size={17} /></button></div>
      {term.trim() ? <div className="command-results">{results.length ? results.map((item, index) => {
        const Icon = item.kind === "Request" ? Inbox : item.kind === "Project" ? FolderKanban : item.kind === "Client" ? Users : Handshake;
        return <Link href={item.href} className={`command-result${index === Math.min(activeIndex, results.length - 1) ? " is-active" : ""}`} onMouseEnter={() => setActiveIndex(index)} key={`${item.kind}-${item.href}-${item.title}`} onClick={() => setOpen(false)}><span className="command-result-icon">{item.logoSrc ? <img className="command-project-logo" src={item.logoSrc} alt={`${item.title} logo`} width={28} height={28} /> : <Icon size={16} />}</span><span className="command-result-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="command-result-kind">{item.kind}</span><ArrowRight size={15} /></Link>;
      }) : <div className="command-empty">{(role === "employee") ? "No matching assigned projects." : "No matching records. Try a client, project, lead, or retainer."}</div>}</div> : null}
      {term.trim() && results.length > 0 && <div className="command-navigation-hint" role="status">{results.length} results <span>↑ ↓ to navigate · Enter to open</span></div>}
    </section>
  </div>;
}
