"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Clock3, Inbox, Plus, ShieldCheck } from "lucide-react";
import { type Lead, readLeads } from "@/lib/leads";
import { type Project, readProjects } from "@/lib/projects";

export default function OverviewPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    const refreshLeads = () => setLeads(readLeads());
    const refreshProjects = () => setProjects(readProjects());
    const refresh = () => { refreshLeads(); refreshProjects(); };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const newCount = leads.filter((lead) => lead.status === "NEW").length;
  const today = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return <div className="page-content">
    <section className="welcome-row">
      <div><div className="eyebrow"><span className="live-dot"/>{today.toUpperCase()}</div><h1>Studio overview</h1><p className="welcome-subtitle">Employee workspace for lead intake, proposals, and active project delivery.</p></div>
      <div className="welcome-actions"><Link className="button button-primary" href="/requests/new"><Plus size={16}/>Log enquiry</Link></div>
    </section>

    <section className="stats-grid enquiry-stats" aria-label="Enquiry summary">
      <article className="stat-card"><div className="stat-top"><span>Lead records</span><span className="stat-icon icon-blue"><Inbox size={18}/></span></div><div className="stat-value">{leads.length}</div><div className="stat-foot">Enquiries entered by employees</div></article>
      <article className="stat-card"><div className="stat-top"><span>New · needs review</span><span className="stat-icon icon-yellow"><Clock3 size={18}/></span></div><div className="stat-value">{newCount}</div><div className="stat-foot">Review fit, scope, and capacity</div></article>
      <article className="stat-card"><div className="stat-top"><span>Qualified</span><span className="stat-icon icon-green"><ShieldCheck size={18}/></span></div><div className="stat-value">{leads.filter((lead) => lead.status === "QUALIFIED").length}</div><div className="stat-foot">Ready for proposal preparation</div></article>
      <article className="stat-card"><div className="stat-top"><span>Active projects</span><span className="stat-icon icon-purple"><BriefcaseBusiness size={18}/></span></div><div className="stat-value">{projects.filter((project) => project.status === "ACTIVE").length}</div><div className="stat-foot">Moved from accepted leads</div></article>
    </section>

    <section className="panel overview-pipeline">
      <div className="panel-heading"><div><h2>Request pipeline</h2><p>Lead records entered by the studio team</p></div><Link className="text-link" href="/requests">Open pipeline <ArrowRight size={15}/></Link></div>
      {leads.length === 0 ? <div className="pipeline-empty"><span className="empty-icon"><Inbox size={22}/></span><h3>No leads logged</h3><p>Record enquiries received by the team through the website, email, phone, referrals, or social channels.</p><Link className="button button-quiet" href="/requests/new">Log an enquiry <ArrowRight size={14}/></Link></div> : <div className="overview-lead-list">{leads.slice(0, 5).map((lead) => <Link href={`/requests#${lead.id}`} key={lead.id} className="overview-lead"><span className="lead-initial">{lead.fullName.slice(0, 1).toUpperCase()}</span><span className="overview-lead-name"><strong>{lead.fullName}</strong><small>{lead.companyName || "Individual enquiry"} · {lead.services.join(", ")}</small></span><span className={`lead-status status-${lead.status.toLowerCase().replace("_", "-")}`}>{lead.status.replaceAll("_", " ")}</span><span className="overview-lead-arrow"><ArrowRight size={15}/></span></Link>)}</div>}
    </section>
    <section className="panel overview-pipeline overview-projects">
      <div className="panel-heading"><div><h2>Active projects</h2><p>Project workspaces created from accepted proposals</p></div><Link className="text-link" href="/projects">Project portfolio <ArrowRight size={15}/></Link></div>
      {projects.length === 0 ? <div className="pipeline-empty project-overview-empty"><span className="empty-icon"><BriefcaseBusiness size={22}/></span><h3>No active projects</h3><p>Move an accepted lead into its project workspace from the request pipeline.</p></div> : <div className="overview-lead-list">{projects.filter((project) => project.status === "ACTIVE").slice(0, 5).map((project) => <Link href={`/projects/${project.id}`} key={project.id} className="overview-lead"><span className="lead-initial"><BriefcaseBusiness size={15}/></span><span className="overview-lead-name"><strong>{project.title}</strong><small>{project.id} · {project.clientCompany || project.clientName} · {project.services.join(", ")}</small></span><span className="project-active-pill"><i/>ACTIVE</span><span className="overview-lead-arrow"><ArrowRight size={15}/></span></Link>)}</div>}
    </section>
    <p className="storage-note">This workspace currently saves enquiry records in this browser. Connect shared database storage and notification services before using it across your team.</p>
  </div>;
}
