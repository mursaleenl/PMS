"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Clock3, ExternalLink, Mail, MapPin, Phone, Plus, Search } from "lucide-react";
import { formatLeadId, type Lead, readLeads, updateLead } from "@/lib/leads";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { operatingCompanies, type OperatingCompany } from "@/lib/companies";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

function ageSince(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function LeadSummary({ lead, now }: { lead: Lead; now: number }) {
  const company = lead.companyName?.trim();
  const companyLabel = company && !["none", "n/a"].includes(company.toLowerCase()) ? company : "Individual enquiry";
  return <>
    <span className="lead-main">
      <strong>{lead.projectName || lead.fullName}{lead.projectName ? <small>{lead.fullName}</small> : lead.designation && <small>{lead.designation}</small>}</strong>
      <span className="lead-summary-details"><span>{companyLabel}</span>{lead.services.length > 0 && <><span aria-hidden="true"> &middot; </span><span>{lead.services.join(", ")}</span></>}</span>
    </span>
    <StatusBadge status={lead.status} />
    <span className="lead-received"><Clock3 size={14} aria-hidden="true" /><span>{ageSince(lead.createdAt, now)}<small>Received</small></span></span>
  </>;
}

const statusOptions: [string, string][] = [
  ["NEW", "New"],
  ["PROPOSAL_SENT", "Proposal sent"], ["ACCEPTED", "Accepted"],
  ["CONVERTED", "Won"], ["LOST", "Lost"],
  ["All", "All leads"],
];

export default function RequestsPage() {
  const { role } = useWorkspaceAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("NEW");
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setLeads(readLeads());
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("storage", refresh);
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("storage", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const counts = useMemo<Record<string, number>>(() => Object.fromEntries(statusOptions.map(([key]) => [
    key,
    key === "All" ? leads.length : leads.filter((lead) => lead.status === key).length,
  ])) as Record<string, number>, [leads]);

  const visibleLeads = useMemo(() => leads.filter((lead) => {
    const matchesStatus = status === "All" || lead.status === status;
    const term = query.trim().toLowerCase();
    const matchesQuery = !term || [lead.projectName || "", lead.fullName, lead.companyName, lead.email, lead.services.join(" "), lead.industry].some((text) => text.toLowerCase().includes(term));
    return matchesStatus && matchesQuery;
  }).sort((left,right)=>(Date.parse(right.createdAt)||0)-(Date.parse(left.createdAt)||0)), [leads, query, status]);

  if ((role === "employee")) return <div className="page-content requests-page">
    <section className="welcome-row requests-welcome"><div><h1>Leads</h1><p className="welcome-subtitle">Browse enquiry details and proposal progress.</p></div></section>
    <div className="pipeline-toolbar"><div className="pipeline-tabs" role="tablist" aria-label="Filter leads by status">{statusOptions.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? "selected" : ""} onClick={() => setStatus(key)}>{label}<span>{counts[key]}</span></button>)}</div><label className="pipeline-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" /></label></div>
    {visibleLeads.length === 0 ? <EmptyState icon={<Mail size={22} />} title={leads.length === 0 ? "No leads available" : "No matching leads"} description="Try another search or status filter." /> : <div className="lead-record-list">{visibleLeads.map((lead) => <article className="lead-record panel" key={lead.id}><Link className="lead-record-summary" href={`/requests/${lead.id}`}><LeadSummary lead={lead} now={now} /><ArrowRight className="lead-summary-arrow" size={16} aria-hidden="true" /></Link></article>)}</div>}
  </div>;

  return <div className="page-content requests-page">
    <section className="welcome-row requests-welcome">
      <div><h1>Leads</h1><p className="welcome-subtitle">Review incoming enquiries and move them into proposals or projects.</p></div>
      <Link className="button button-primary" href="/requests/new"><Plus size={16} />Log enquiry</Link>
    </section>

    <div className="pipeline-toolbar">
      <div className="pipeline-tabs" role="tablist" aria-label="Filter leads by status">
        {statusOptions.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={status === key}
            className={status === key ? "selected" : ""}
            onClick={() => setStatus(key)}
          >
            {label}
            <span>{counts[key]}</span>
          </button>
        ))}
      </div>
      <label className="pipeline-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" />
      </label>
    </div>

    {visibleLeads.length === 0 ? <EmptyState icon={<Mail size={22} />} title={leads.length === 0 ? "No leads yet" : "No matching leads"} description={leads.length === 0 ? "Log a new enquiry to add it to your leads." : "Try another search or status filter."} action={leads.length === 0 ? <Link className="button button-primary" href="/requests/new">Log first enquiry <ArrowRight size={15} /></Link> : undefined} /> : <div className="lead-record-list">
      {visibleLeads.map((lead) => {
        const companyLocked = Boolean(lead.operatingCompany && (lead.projectId || lead.invoice || (lead.proposals ?? []).some(proposal => ["SENT", "ACCEPTED", "SUPERSEDED"].includes(proposal.status))));
        return <article className={`lead-record panel ${expanded === lead.id ? "lead-expanded" : ""}`} id={lead.id} key={lead.id}>
          <button type="button" className="lead-record-summary" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)} aria-expanded={expanded === lead.id}>
            <LeadSummary lead={lead} now={now} />
            <ChevronDown className="lead-expand-caret" size={16} aria-hidden="true" />
          </button>
          {expanded === lead.id && <div className="lead-detail">
            <div className="lead-detail-columns">
              <section><h3>Contact information</h3><div className="detail-line"><b>Lead ID</b><span className="mono-meta">{formatLeadId(lead.id)}</span></div><div className="detail-line"><strong>{lead.fullName}</strong>{lead.designation && <span>{lead.designation}</span>}</div>{lead.companyName && <div className="detail-line">{lead.companyName}{lead.companyWebsite && <> · <a href={lead.companyWebsite.startsWith("http") ? lead.companyWebsite : `https://${lead.companyWebsite}`} target="_blank" rel="noreferrer">Company site <ExternalLink size={11} /></a></>}</div>}<div className="detail-line"><a href={`mailto:${lead.email}`}>{lead.email}</a></div>{lead.phone && <div className="detail-line"><Phone size={13} /><a href={`tel:${lead.phone}`}>{lead.phone}</a></div>}{lead.country && <div className="detail-line"><MapPin size={13} />{lead.country}</div>}</section>
              <section><h3>Project information</h3><div className="detail-line"><b>Industry</b>{lead.industry}</div><div className="detail-line"><b>Urgency</b><span className={lead.urgency === "Rush" ? "rush-label" : ""}>{lead.urgency}</span></div><p className="lead-description">{lead.description}</p>{lead.referenceLinks && <div className="detail-line reference-links"><b>References</b>{lead.referenceLinks.split(/\s+/).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}<ExternalLink size={11} /></a>)}</div>}</section>
            </div>
            <div className="lead-actions-row">
              <div className="contact-action">
                <div>
                  <div className="lead-budget-source">
                    <div className="lead-budget-heading"><h4>Budget &amp; source</h4></div>
                    <div className="lead-budget-meta">
                      <span><b>Budget</b>{lead.budgetShared ? lead.budgetRange || "Not provided" : "Declined to share"}</span>
                      <span><b>Source</b>{lead.source || "Not provided"}</span>
                      <span><b>Found via</b>{lead.acquisitionSource || "Not provided"}</span>
                    </div>
                    <section className="lead-company-section" aria-labelledby={`company-heading-${lead.id}`}>
                      <div><h4 id={`company-heading-${lead.id}`}>Operating company</h4><p>Choose the studio responsible for this lead and its project.</p></div>
                      <label className="field">Choose operating company<select value={lead.operatingCompany ?? ""} disabled={companyLocked} onChange={event=>{const value=event.target.value;if(operatingCompanies.some(company=>company===value))updateLead(lead.id,{operatingCompany:value as OperatingCompany});}}><option value="" disabled>Select an operating company</option>{operatingCompanies.map(company=><option key={company} value={company}>{company}</option>)}</select></label>
                      {companyLocked && <small>The company is fixed once a proposal is sent, an invoice is created, or the lead becomes a project.</small>}
                    </section>
                    {lead.budgetNote && <p className="budget-note-display">{lead.budgetNote}</p>}
                  </div>
                </div>


              </div>
              <div className="lead-workspace-actions">
                <Link className="button button-quiet" href={`/requests/${lead.id}`}>Open lead workspace <ArrowRight size={14} /></Link>
                {lead.status === "CONVERTED" && lead.projectId && <Link className="button button-primary" href={`/projects/${lead.projectId}`}>Open project <ArrowRight size={14} /></Link>}
              </div>
            </div>
          </div>}
        </article>;
      })}
    </div>}
  </div>;
}
