"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Clock3, ExternalLink, Mail, MapPin, Phone, Plus, Search, ShieldCheck, UserRoundCheck } from "lucide-react";
import { formatLeadId, type Lead, type Qualification, readLeads, updateLead } from "@/lib/leads";

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [now, setNow] = useState(Date.now());
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, typeof blankChecks>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [callFields, setCallFields] = useState<Record<string, typeof blankCall>>({});

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
  }), [leads, query, status]);

  function logFirstContact(lead: Lead) {
    if (!lead.firstContactAt) updateLead(lead.id, { firstContactAt: new Date().toISOString() });
  }

  function makeQualification(lead: Lead): Qualification {
    const answer = checks[lead.id] ?? blankChecks;
    const call = callFields[lead.id] ?? blankCall;
    return {
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

  return <div className="page-content requests-page">
    <section className="welcome-row requests-welcome">
      <div><div className="eyebrow"><span className="live-dot"/>STAGES 01–02 · LEAD & PROPOSAL</div><h1>Request pipeline</h1><p className="welcome-subtitle">Review, qualify, and prepare proposals for incoming enquiries.</p></div>
      <Link className="button button-primary" href="/requests/new"><Plus size={16}/>Log enquiry</Link>
    </section>

    <div className="pipeline-toolbar">
      <div className="pipeline-tabs">{statusOptions.map(([key, label]) => <button key={key} className={status === key ? "selected" : ""} onClick={() => setStatus(key)}>{label}<span>{counts[key]}</span></button>)}</div>
      <label className="pipeline-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads"/></label>
    </div>

    {visibleLeads.length === 0 ? <section className="panel pipeline-empty pipeline-empty-large"><span className="empty-icon"><Mail size={22}/></span><h2>{leads.length === 0 ? "No leads logged" : "No matching leads"}</h2><p>{leads.length === 0 ? "Log an enquiry received by the team to create its NEW lead record." : "Try another search or status filter."}</p>{leads.length === 0 && <Link className="button button-primary" href="/requests/new">Log first enquiry <ArrowRight size={15}/></Link>}</section> : <div className="lead-record-list">
      {visibleLeads.map((lead) => {
        const answer = checks[lead.id] ?? blankChecks;
        const call = callFields[lead.id] ?? blankCall;
        return <article className={`lead-record panel ${expanded === lead.id ? "lead-expanded" : ""}`} id={lead.id} key={lead.id}>
          <button className="lead-record-summary" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)} aria-expanded={expanded === lead.id}>
            <span className="lead-initial">{lead.fullName.slice(0, 1).toUpperCase()}</span>
            <span className="lead-main"><strong>{lead.fullName}<small>{lead.designation ? ` · ${lead.designation}` : ""}</small></strong><span>{lead.companyName || "Individual enquiry"} · {lead.services.join(", ")}</span><small>{formatLeadId(lead.id)} · {lead.source}</small></span>
            <span className={`lead-status status-${lead.status.toLowerCase().replace("_", "-")}`}>{lead.status.replaceAll("_", " ")}</span>
            <span className="lead-received"><Clock3 size={13}/>{ageSince(lead.createdAt, now)}<small>received</small></span>
            <span className="lead-response">{lead.firstContactAt ? <><UserRoundCheck size={14}/><span>First contact logged<small>{new Date(lead.firstContactAt).toLocaleString()}</small></span></> : <><Clock3 size={14}/><span>First contact pending<small>SLA target not configured</small></span></>}</span>
            <span className="lead-expand-caret">⌄</span>
          </button>
          {expanded === lead.id && <div className="lead-detail">
            <div className="lead-detail-columns">
              <section><h3>Contact information</h3><div className="detail-line"><strong>{lead.fullName}</strong>{lead.designation && <span>{lead.designation}</span>}</div>{lead.companyName && <div className="detail-line">{lead.companyName}{lead.companyWebsite && <> · <a href={lead.companyWebsite} target="_blank" rel="noreferrer">Company site <ExternalLink size={11}/></a></>}</div>}<div className="detail-line"><a href={`mailto:${lead.email}`}>{lead.email}</a></div>{lead.phone && <div className="detail-line"><Phone size={13}/><a href={`tel:${lead.phone}`}>{lead.phone}</a></div>}{(lead.country || lead.timezone) && <div className="detail-line"><MapPin size={13}/>{[lead.country, lead.timezone].filter(Boolean).join(" · ")}</div>}</section>
              <section><h3>Project information</h3><div className="detail-line"><b>Industry</b>{lead.industry}</div><div className="detail-line"><b>Urgency</b><span className={lead.urgency === "Rush" ? "rush-label" : ""}>{lead.urgency}</span></div><div className="detail-line"><b>Found us via</b>{lead.acquisitionSource || "Not provided"}</div><div className="detail-line"><b>Budget</b>{lead.budgetShared ? (lead.budgetRange || "Not provided") : "Client declined to share"}</div>{lead.budgetNote && <p className="budget-note-display">{lead.budgetNote}</p>}<p className="lead-description">{lead.description}</p>{lead.referenceLinks && <div className="detail-line reference-links"><b>References</b>{lead.referenceLinks.split(/\s+/).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}<ExternalLink size={11}/></a>)}</div>}</section>
            </div>
            <div className="lead-actions-row">
              <div className="contact-action"><div><h3>First contact</h3><p>{lead.firstContactAt ? `Contact logged ${new Date(lead.firstContactAt).toLocaleString()}.` : "Record when the team first reaches out to this lead."}</p></div>{!lead.firstContactAt && <button className="button button-quiet" onClick={() => logFirstContact(lead)}>Log first contact</button>}</div>
              {lead.status === "NEW" && <div className="qualification-box">
                <div><h3>Discovery call & qualification</h3><p>Record the call and confirm fit before moving to proposal preparation.</p></div>
                <div className="qualification-fields">{([["genuine", "Real enquiry, not spam"], ["budget", "Budget aligns with scope"], ["fit", "Good fit for Evecture"], ["capacity", "Team capacity available"]] as const).map(([key, label]) => <label key={key}>{label}<select value={answer[key]} onChange={(event) => setChecks((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankChecks), [key]: event.target.value } }))}><option value="">Unreviewed</option><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Need more information</option></select></label>)}</div>
                <div className="qualification-call-grid">
                  <label className="field">Actual problem<textarea rows={2} value={call.problem} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), problem: event.target.value } }))} placeholder="What is the client trying to solve?"/></label>
                  <label className="field">Desired outcome<textarea rows={2} value={call.outcome} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), outcome: event.target.value } }))} placeholder="What result would make this successful?"/></label>
                  <label className="field">Decision-maker / sign-off authority<input value={call.decisionMaker} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), decisionMaker: event.target.value } }))} placeholder="Name or role"/></label>
                  <label className="field">Decision timeline<input value={call.timeline} onChange={(event) => setCallFields((current) => ({ ...current, [lead.id]: { ...(current[lead.id] ?? blankCall), timeline: event.target.value } }))} placeholder="Target date or timeframe"/></label>
                </div>
                <label className="field qualification-note">Discovery call notes<textarea rows={3} value={notes[lead.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [lead.id]: event.target.value }))} placeholder="Summary and follow-up from the discovery call"/></label>
                <div className="qualification-actions"><label className="disqualify-select"><span>Disqualify reason</span><select value={reasons[lead.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [lead.id]: event.target.value }))}><option value="">Choose a reason</option>{disqualificationReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><button className="button button-quiet" onClick={() => saveCallNotes(lead)}>Save call notes</button><button className="button button-quiet disqualify-button" disabled={!reasons[lead.id]} onClick={() => disqualify(lead)}>Disqualify</button><button className="button button-primary" disabled={Object.values(answer).some((value) => value !== "yes")} onClick={() => qualify(lead)}>Mark qualified <ArrowRight size={14}/></button></div>
              </div>}
              {lead.status !== "NEW" && <div className="archived-qualification"><ShieldCheck size={15}/><span>{lead.status === "QUALIFIED" ? "Qualified for proposal" : lead.status === "PROPOSAL_SENT" ? "Proposal sent · awaiting client" : lead.status === "ACCEPTED" ? "Accepted · ready for project setup" : lead.status === "CONVERTED" ? "Converted · active project created" : lead.status === "LOST" ? `Lost · ${lead.disqualificationReason || "Reason not recorded"}` : `Disqualified · ${lead.disqualificationReason || "Reason not recorded"}`}</span>{lead.qualificationNote && <p>{lead.qualificationNote}</p>}{lead.status === "CONVERTED" && lead.projectId && <Link className="button button-primary" href={`/projects/${lead.projectId}`}>Open project <ArrowRight size={14}/></Link>}{lead.status === "ACCEPTED" && <Link className="button button-primary" href={`/requests/${lead.id}`}>Move to Projects <ArrowRight size={14}/></Link>}{lead.status !== "ACCEPTED" && <Link className="button button-quiet" href={`/requests/${lead.id}`}>Open lead workspace <ArrowRight size={14}/></Link>}</div>}
            </div>
          </div>}
        </article>;
      })}
    </div>}
    <div className="pipeline-system-note"><Clock3 size={14}/><span>The response clock starts at receipt. Configure the response SLA and team notifications to calculate deadlines and send alerts.</span></div>
  </div>;
}
