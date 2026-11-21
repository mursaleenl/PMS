"use client";

import Link from "next/link";
import {clientContactName} from "@/lib/client-identity";
import { getProjectLogoSrc } from "@/lib/project-logo";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ListTodo, Delete, FolderKanban, Handshake, Inbox, Search, Users, X } from "lucide-react";
import { formatLeadId, readLeads, type Lead } from "@/lib/leads";
import { getProjectDisplayTitle, getProjectDisplayServices, readProjects, type Project, type ProjectWorkItem, isProjectAssignedToUser, canViewProjectTask, isTaskAssignedToUser, getTaskAssignees, getProjectClients, type TaskAssignee } from "@/lib/projects";
import { readManagedProjects, type ManagedProject } from "@/lib/post-sale";
import { GENERAL_TASKS_ID, readGeneralTasks } from "@/lib/general-tasks";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

type SearchItem = { kind: string; title: string; detail: string; href: string; terms: string; people?: string[]; logoSrc?: string };
const taskStatuses: Record<ProjectWorkItem["status"], { label: string; aliases: string }> = {
  TO_DO: { label: "To do", aliases: "new pending" },
  IN_PROGRESS: { label: "In progress", aliases: "ongoing" },
  UNDER_REVIEW: { label: "In review", aliases: "under review" },
  BLOCKED: { label: "Blocked", aliases: "" },
  DONE: { label: "Completed", aliases: "done" },
};

export function CommandPalette() {
  const { role, user, members } = useWorkspaceAuth();
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [term, setTerm] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [generalTasks, setGeneralTasks] = useState<ProjectWorkItem[]>([]);
  const [plans, setPlans] = useState<ManagedProject[]>([]);

  useEffect(() => {
    const refresh = () => {
      setLeads(readLeads());
      setProjects(readProjects());
      setPlans(readManagedProjects());
      setGeneralTasks(readGeneralTasks());
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("evecture:general-tasks-updated", refresh);
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
      window.removeEventListener("evecture:general-tasks-updated", refresh);
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
    const panel = dialog.current;
    panel?.querySelector("input")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (document.activeElement === document.body || panel?.contains(document.activeElement)) previous?.focus();
    };
  }, [present]);

  const results = useMemo(() => {
    const query = term.trim().toLowerCase().replace(/\s+/g, " ");
    if (!query) return [];
    const words = query.split(" ");
    const matches = (value: string) => {
      const normalized = value.toLowerCase();
      return words.every(word => normalized.includes(word));
    };
    const items: SearchItem[] = [];
    const memberNames = new Map(members.map(member => [member.user_id, member.display_name?.trim()]));
    const assignedName = (person: TaskAssignee) => (person.userId && memberNames.get(person.userId)) || person.name.trim();
    const employeeName = ((user?.id && memberNames.get(user.id)) || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "").trim();
    const addTask = (task: ProjectWorkItem, projectTitle: string, href: string, relatedTerms = "") => {
      const status = taskStatuses[task.status] ?? { label: task.status.replaceAll("_", " "), aliases: "" };
      const assignees = getTaskAssignees(task);
      const names = assignees.map(assignedName);
      items.push({
        kind: "Task", title: task.title,
        detail: [projectTitle, names.join(", "), status.label].filter(Boolean).join(" · "),
        href, people: [...names, ...assignees.map(person => person.name)],
        terms: [task.id, task.description, task.priority, status.aliases, relatedTerms].join(" "),
      });
    };
    for (const lead of (role === "employee") ? [] : leads) {
      items.push({ kind: "Request", title: lead.projectName || lead.companyName || lead.fullName, detail: `${formatLeadId(lead.id)} · ${lead.status.replaceAll("_", " ")}`, href: `/requests/${lead.id}`, terms: `${lead.projectName || ""} ${lead.fullName} ${lead.companyName} ${lead.email} ${lead.services.join(" ")} ${lead.id}` });
    }
    for (const project of projects) {
      if (role === "employee" && !isProjectAssignedToUser(project, user?.id, employeeName)) continue;
      const title = getProjectDisplayTitle(project);
      const href = `/projects/${encodeURIComponent(project.id)}`;
      const services = getProjectDisplayServices(project);
      const clientTerms = [project.clientEmail, ...getProjectClients(project).flatMap(client =>
        [clientContactName(client.name), clientContactName(client.companyName), client.email]
      )].join(" ");
      const relatedTerms = [title, project.title, project.id, clientTerms].join(" ");
      const visibleTasks = (project.workItems ?? []).filter(task =>
        canViewProjectTask(project, task, role, user?.id, employeeName)
      );
      const assignments = [...project.team, ...visibleTasks.flatMap(getTaskAssignees)];
      const matchingNames = new Set(assignments.filter(person => matches(person.name) || matches(assignedName(person))).map(assignedName));
      items.push({
        kind: "Project", title, href, logoSrc: getProjectLogoSrc(project),
        detail: [project.id, services, [...matchingNames].join(", ")].filter(Boolean).join(" · "),
        terms: relatedTerms, people: assignments.flatMap(person => [assignedName(person), person.name]),
      });
      for (const task of visibleTasks) {
        addTask(task, title, `${href}?tab=tasks&task=${encodeURIComponent(task.id)}`, relatedTerms);
      }
    }
    if (role !== "client") for (const task of generalTasks) {
      if (role === "admin" || role === "project_manager" || isTaskAssignedToUser(task, user?.id, employeeName)) {
        addTask(task, "General task", `/work?project=${GENERAL_TASKS_ID}&task=${encodeURIComponent(task.id)}`);
      }
    }
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
    const score = (item: SearchItem) => {
      const title = item.title.toLowerCase();
      if (title === query) return 6;
      if (title.startsWith(query)) return 5;
      if (title.includes(query)) return 4;
      if (matches(title)) return 3;
      if (item.people?.some(matches)) return item.kind === "Project" ? 2 : 1;
      return 0;
    };
    return items.filter(item => matches([item.title, item.kind, item.detail, item.terms, ...(item.people ?? [])].join(" ")))
      .sort((a, b) => score(b) - score(a));
  }, [leads, projects, plans, generalTasks, term, role, user?.id, user?.email, user?.user_metadata, members]);

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
      }} placeholder="Search projects, clients, tasks, or people…" />
      {term && <button className="icon-button command-clear" type="button" aria-label="Clear search" onClick={() => {
        setTerm(""); setActiveIndex(0); dialog.current?.querySelector("input")?.focus();
      }}><Delete size={16} /></button>}
      <kbd aria-hidden="true">ESC</kbd><button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close search"><X size={17} /></button></div>
      {term.trim() ? <div className="command-results">{results.length ? results.map((item, index) => {
        const Icon = item.kind === "Task" ? ListTodo : item.kind === "Request" ? Inbox : item.kind === "Project" ? FolderKanban : item.kind === "Client" ? Users : Handshake;
        return <Link href={item.href} className={`command-result${index === Math.min(activeIndex, results.length - 1) ? " is-active" : ""}`} onMouseEnter={() => setActiveIndex(index)} key={`${item.kind}-${item.href}-${item.title}`} onClick={() => setOpen(false)}><span className="command-result-icon">{item.logoSrc ? <img className="command-project-logo" src={item.logoSrc} alt="" width={28} height={28} /> : <Icon size={16} />}</span><span className="command-result-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="command-result-kind">{item.kind}</span><ArrowRight size={15} /></Link>;
      }) : <div className="command-empty" role="status">No matches. Try a different title, name, or ID.</div>}</div> : null}
      {term.trim() && results.length > 0 && <div className="command-navigation-hint" role="status">{results.length} {results.length === 1 ? "result" : "results"} <span>↑ ↓ to navigate · Enter to open</span></div>}
    </section>
  </div>;
}
