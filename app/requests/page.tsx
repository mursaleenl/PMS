"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, ExternalLink, Mail, MapPin, Phone, Plus, Search, UserRoundCheck, X } from "lucide-react";
import { formatLeadId, type Lead, type Qualification, readLeads, updateLead } from "@/lib/leads";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { operatingCompanies, type OperatingCompany } from "@/lib/companies";
import { isValidDateValue } from "@/lib/dates";
import { CalendarPicker } from "@/app/_components/calendar-picker";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

const disqualificationReasons = ["Budget too low", "Not a fit", "Spam", "No response"];
const blankChecks = { genuine: "", budget: "", fit: "", capacity: "" };
const blankCall = { problem: "", outcome: "", decisionMaker: "", timeline: "" };

function ageSince(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusOptions: [string, string][] = [
  ["All", "All leads"], ["NEW", "New"], ["QUALIFIED", "Qualified"],
  ["PROPOSAL_SENT", "Proposal sent"], ["ACCEPTED", "Accepted"],
  ["CONVERTED", "Converted to project"], ["LOST", "Lost"], ["DISQUALIFIED", "Disqualified"],
];

export default function RequestsPage() {
  const { role } = useWorkspaceAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, typeof blankChecks>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [callFields, setCallFields] = useState<Record<string, typeof blankCall>>({});
  const [contactPickerLeadId, setContactPickerLeadId] = useState<string | null>(null);
  const [contactDateTime, setContactDateTime] = useState<string>("");
  const [contactError, setContactError] = useState("");

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
    const matchesQuery = !term || [lead.fullName, lead.companyName, lead.email, lead.services.join(" "), lead.industry].some((text) => text.toLowerCase().includes(term));
    return matchesStatus && matchesQuery;
  }).sort((left,right)=>(Date.parse(right.createdAt)||0)-(Date.parse(left.createdAt)||0)), [leads, query, status]);

  function openContactPicker(lead: Lead) {
    setContactPickerLeadId(lead.id);
    setContactError("");
    setNow(Date.now());
    const existing = lead.firstContactAt && Number.isFinite(Date.parse(lead.firstContactAt)) ? new Date(lead.firstContactAt) : new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const y = existing.getFullYear();
    const m = pad(existing.getMonth() + 1);
    const d = pad(existing.getDate());
    const hh = pad(existing.getHours());
    const mm = pad(existing.getMinutes());
    setContactDateTime(`${y}-${m}-${d}T${hh}:${mm}`);
  }

  function saveManualFirstContact(leadId: string) {
    const dateObj = new Date(contactDateTime);
    if (!isValidDateValue(contactDateTime,true) || Number.isNaN(dateObj.getTime()) || dateObj.getTime()>Date.now()) {
      setContactError("Choose a valid contact date and time up to now.");return;
    }
    updateLead(leadId, { firstContactAt: dateObj.toISOString() });
    setContactPickerLeadId(null);
  }

  function logNowFirstContact(leadId: string) {
    updateLead(leadId, { firstContactAt: new Date().toISOString() });
    setContactPickerLeadId(null);
  }

  function makeQualification(lead: Lead): Qualification {
    const answer = checks[lead.id] ?? blankChecks;
    const call = callFields[lead.id] ?? blankCall;
    return {
      ...lead.qualification,
      discoveryCallAt: new Date().toISOString(),
      callNotes: notes[lead.id]?.trim() || "",
      actualProblem: call.problem.trim(),
      desiredOutcome: call.outcome.trim(),
      budgetFit: (answer.budget || "unknown") as "yes" | "no" | "unknown",
      decisionMaker: call.decisionMaker.trim(),
      decisionTimeline: call.timeline.trim(),
      goodFit: (answer.fit || "unknown") as "yes" | "no" | "unknown",
    };
  }

  function saveCallNotes(lead: Lead) {
    updateLead(lead.id, { qualification: makeQualification(lead), qualificationNote: notes[lead.id]?.trim() || undefined });
  }

  function qualify(lead: Lead) {
    const answer = checks[lead.id] ?? blankChecks;
    if (Object.values(answer).some((value) => value !== "yes")) return;
    updateLead(lead.id, { status: "QUALIFIED", qualification: makeQualification(lead), qualificationNote: notes[lead.id]?.trim() || undefined });
  }

  function disqualify(lead: Lead) {
    const reason = reasons[lead.id];
    if (!reason) return;
    updateLead(lead.id, { status: "DISQUALIFIED", disqualificationReason: reason, qualification: makeQualification(lead), qualificationNote: notes[lead.id]?.trim() || undefined });
  }

  if (role === "employee") return <div className="page-content requests-page">
    <section className="welcome-row requests-welcome"><div><h1>Leads</h1><p className="welcome-subtitle">Browse enquiry details and proposal progress.</p></div></section>
    <div className="pipeline-toolbar"><div className="pipeline-tabs" role="tablist" aria-label="Filter leads by status">{statusOptions.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? "selected" : ""} onClick={() => setStatus(key)}>{label}<span>{counts[key]}</span></button>)}</div><label className="pipeline-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads" /></label></div>
    {visibleLeads.length === 0 ? <EmptyState icon={<Mail size={22} />} title={leads.length === 0 ? "No leads available" : "No matching leads"} description="Try another search or status filter." /> : <div className="lead-record-list">{visibleLeads.map((lead) => <article className="lead-record panel" key={lead.id}><Link className="lead-record-summary" href={`/requests/${lead.id}`}><span className="lead-main"><strong>{lead.fullName}{lead.designation ? <small> · {lead.designation}</small> : null}</strong><span>{lead.companyName || "Individual enquiry"} · {lead.services.join(", ")}</span></span><StatusBadge status={lead.status} /><span className="lead-received"><Clock3 size={13} />{ageSince(lead.createdAt, now)}<small>received</small></span><ArrowRight size={16} /></Link></article>)}</div>}
  </div>;

  return <div className="page-content requests-page">
    <section className="welcome-row requests-welcome">
      <div><h1>Leads</h1><p className="welcome-subtitle">Review, qualify, and move incoming enquiries forward.</p></div>
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
        const answer = checks[lead.id] ?? blankChecks;
        const call = callFields[lead.id] ?? blankCall;
        const companyLocked = Boolean(lead.operatingCompany && (lead.projectId || lead.invoice || (lead.proposals ?? []).some(proposal => ["SENT", "ACCEPTED", "SUPERSEDED"].includes(proposal.status))));
        return <article className={`lead-record panel ${expanded === lead.id ? "lead-expanded" : ""}`} id={lead.id} key={lead.id}>
          <button className="lead-record-summary" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)} aria-expanded={expanded === lead.id}>
            <span className="lead-main"><strong>{lead.fullName}<small>{lead.designation ? ` · ${lead.designation}` : ""}</small></strong><span>{lead.companyName || "Individual enquiry"} · {lead.services.join(", ")}</span></span>
            <StatusBadge status={lead.status} />
            <span className="lead-received"><Clock3 size={13} />{ageSince(lead.createdAt, now)}<small>received</small></span>
            <span className="lead-response">{lead.firstContactAt ? <><UserRoundCheck size={14} /><span>First contact logged<small>{new Date(lead.firstContactAt).toLocaleString()}</small></span></> : <><Clock3 size={14} /><span>First contact pending</span></>}</span>
            <span className="lead-expand-caret">⌄</span>
          </button>
          {expanded === lead.id && <div className="lead-detail">
            <div className="lead-detail-columns">
              <section><h3>Contact information</h3><div className="detail-line"><b>Lead ID</b><span className="mono-meta">{formatLeadId(lead.id)}</span></div><div className="detail-line"><strong>{lead.fullName}</strong>{lead.designation && <span>{lead.designation}</span>}</div>{lead.companyName && <div className="detail-line">{lead.companyName}{lead.companyWebsite && <> · <a href={lead.companyWebsite.startsWith("http") ? lead.companyWebsite : `https://${lead.companyWebsite}`} target="_blank" rel="noreferrer">Company site <ExternalLink size={11} /></a></>}</div>}<div className="detail-line"><a href={`mailto:${lead.email}`}>{lead.email}</a></div>{lead.phone && <div className="detail-line"><Phone size={13} /><a href={`tel:${lead.phone}`}>{lead.phone}</a></div>}{lead.country && <div className="detail-line"><MapPin size={13} />{lead.country}</div>}</section>
              <section><h3>Project information</h3><div className="detail-line"><b>Industry</b>{lead.industry}</div><div className="detail-line"><b>Urgency</b><span className={lead.urgency === "Rush" ? "rush-label" : ""}>{lead.urgency}</span></div><p className="lead-description">{lead.description}</p>{lead.referenceLinks && <div className="detail-line reference-links"><b>References</b>{lead.referenceLinks.split(/\s+/).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}<ExternalLink size={11} /></a>)}</div>}</section>
            </div>
            <div className="lead-actions-row">
              <div className="contact-action">
                <div>
                  <div className="first-contact-title-row">
                    <h3>First contact</h3>
                    {contactPickerLeadId !== lead.id && (
                      <button type="button" className="button button-quiet" onClick={() => openContactPicker(lead)}>
                        {lead.firstContactAt ? "Edit date & time" : "Log first contact"}
                      </button>
                    )}
                  </div>
                  <p>{lead.firstContactAt ? `Contact logged ${new Date(lead.firstContactAt).toLocaleString()}.` : "Record when the team first reaches out to this lead."}</p>
                  {contactPickerLeadId === lead.id && <form className="first-contact-editor" aria-label="First contact date" onSubmit={event=>{event.preventDefault();saveManualFirstContact(lead.id);}}>
                    <div className="first-contact-editor-heading"><h4>{lead.firstContactAt ? "Edit contact date & time" : "Log first contact"}</h4><button className="icon-button" type="button" aria-label="Close contact date editor" onClick={()=>setContactPickerLeadId(null)}><X size={16}/></button></div>
                    <label className="field">First contact date & time<input type="datetime-local" required value={contactDateTime} max={new Date(now-new Date(now).getTimezoneOffset()*60000).toISOString().slice(0,16)} onChange={event=>{setContactDateTime(event.target.value);setContactError("");}}/><small>Use your local date and time.</small></label>
                    {contactError && <p className="form-error" role="alert">{contactError}</p>}
                    <div className="first-contact-editor-actions"><button type="submit" className="button button-primary">Save date & time</button><button type="button" className="button button-quiet" onClick={()=>logNowFirstContact(lead.id)}>Log now</button><button type="button" className="button button-quiet" onClick={()=>setContactPickerLeadId(null)}>Cancel</button></div>
                  </form>}
                  <div className="first-contact-budget-source">
                    <div className="first-contact-budget-heading"><h4>Budget &amp; source</h4></div>
                    <div className="first-contact-meta">
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
              {lead.status === "NEW" && <div className="qualification-box">
                <div><h3>Discovery call & qualification</h3><p>Record the call and confirm fit before setting up the project.</p></div>
                <div className="qualification-fields">{([["genuine", "Real enquiry, not spam"], ["budget", "Budget aligns with scope"], ["fit", "Good fit"], ["capacity", "Team capacity available"]] as const).map(([key, label]) => <label key={key}>{label}<select value={answer[key]} onChange={(event) => setChecks((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankChecks), [key]: event.target.value } }))}><option value="">Unreviewed</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Need more information</option></select></label>)}</div>
                <div className="qualification-call-grid">
                  <label className="field">Actual problem<textarea rows={2} value={call.problem} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), problem: event.target.value } }))} placeholder="What is the client trying to solve?" /></label>
                  <label className="field">Desired outcome<textarea rows={2} value={call.outcome} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), outcome: event.target.value } }))} placeholder="What result would make this successful?" /></label>
                  <label className="field">Decision-maker / sign-off authority<input value={call.decisionMaker} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), decisionMaker: event.target.value } }))} placeholder="Name or role" /></label>
                  <div className="field">
                    <span>Decision timeline</span>
                    <CalendarPicker
                      mode="timeline"
                      value={call.timeline}
                      onChange={(val) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), timeline: val } }))}
                      placeholder="Target date or timeframe"
                    />
                  </div>
                </div>
                <label className="field qualification-note">Discovery call notes<textarea rows={3} value={notes[lead.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [lead.id]: event.target.value }))} placeholder="Summary and follow-up from the discovery call" /></label>
                <div className="qualification-actions"><label className="disqualify-select"><span>Disqualify reason</span><select value={reasons[lead.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [lead.id]: event.target.value }))}><option value="">Choose a reason</option>{disqualificationReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><button className="button button-quiet" onClick={() => saveCallNotes(lead)}>Save call notes</button><button className="button button-quiet disqualify-button" disabled={!reasons[lead.id]} onClick={() => disqualify(lead)}>Disqualify</button><button className="button button-primary" disabled={Object.values(answer).some((value) => value !== "yes")} onClick={() => qualify(lead)}>Mark qualified <ArrowRight size={14} /></button></div>
              </div>}
              {lead.status !== "NEW" && <div className="archived-qualification"><div className="archived-qualification-status"><span>{lead.status === "QUALIFIED" ? "Qualified for proposal" : lead.status === "PROPOSAL_SENT" ? "Proposal sent · awaiting client" : lead.status === "ACCEPTED" ? "Accepted · ready for project setup" : lead.status === "CONVERTED" ? "Converted · active project created" : lead.status === "LOST" ? `Lost · ${lead.disqualificationReason || "Reason not recorded"}` : `Disqualified · ${lead.disqualificationReason || "Reason not recorded"}`}</span></div>{lead.qualificationNote && <p>{lead.qualificationNote}</p>}<div className="archived-qualification-actions">{lead.status === "CONVERTED" && lead.projectId && <Link className="button button-primary" href={`/projects/${lead.projectId}`}>Open project <ArrowRight size={14} /></Link>}{lead.status === "ACCEPTED" && <Link className="button button-primary" href={`/requests/${lead.id}`}>Move to Projects <ArrowRight size={14} /></Link>}{lead.status !== "ACCEPTED" && <Link className="button button-quiet" href={`/requests/${lead.id}`}>Open lead workspace <ArrowRight size={14} /></Link>}</div></div>}
            </div>
          </div>}
        </article>;
      })}
    </div>}
  </div>;
}
