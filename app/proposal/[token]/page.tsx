"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { Check, Download, Printer, Send } from "lucide-react";
import { type Lead, type ProposalVersion } from "@/lib/leads";

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function lines(value: string) {
  return value.split(/\r?\n|•/).map((line) => line.trim()).filter(Boolean);
}

export default function ClientProposalPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [responseMode, setResponseMode] = useState<"accept" | "decline" | "changes" | null>(null);
  const [responseName, setResponseName] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [responseSaved, setResponseSaved] = useState(false);
  const [error, setError] = useState("");
  const [submitting,setSubmitting] = useState(false);

  useEffect(() => {
    const controller=new AbortController();
    setLoading(true); setResponseSaved(false); setResponseMode(null); setLead(null); setError("");
    void fetch(`/api/proposals/${encodeURIComponent(token)}`,{signal:controller.signal,cache:"no-store"})
      .then(async response => { const result=await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(result => setLead(result.lead))
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load proposal."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[token]);

  const proposal = lead?.proposals?.find((item) => item.shareToken === token);
  const isOpen = proposal?.status === "SENT";
  const expired = !!proposal && new Date(`${proposal.expiryDate}T23:59:59Z`).getTime() < Date.now();

  async function respond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || !proposal || !isOpen || expired || submitting) return;
    if (responseMode === "accept" && !responseName.trim()) {
      setError("Enter the name of the person approving this proposal.");
      return;
    }
    if ((responseMode === "decline" || responseMode === "changes") && !responseNote.trim()) {
      setError(responseMode === "decline" ? "Tell us why you are declining the proposal." : "Tell us what you would like changed.");
      return;
    }
    const nextStatus: ProposalVersion["status"] = responseMode === "accept" ? "ACCEPTED" : responseMode === "decline" ? "DECLINED" : "CHANGES_REQUESTED";
    setSubmitting(true); setError("");
    try {
      const response=await fetch(`/api/proposals/${encodeURIComponent(token)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({response:nextStatus,name:responseName.trim(),note:responseNote.trim()})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error || "Response could not be saved.");
      setLead({...lead,proposals:[{...proposal,status:nextStatus,respondedAt:new Date().toISOString(),changeRequest:responseNote.trim(),responseName:responseName.trim()}]});
      setResponseSaved(true);
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Response could not be saved. Please retry."); }
    finally { setSubmitting(false); }

  }

  if (loading) return <main className="client-proposal-page"><div className="client-proposal-state">Loading proposal…</div></main>;
  if (!lead || !proposal) return <main className="client-proposal-page"><div className="client-proposal-state"><h1>Proposal unavailable</h1><p>{error || "This proposal link is invalid or is no longer available."}</p></div></main>;

  const templateSections = [
    { id: "challenge", title: "The Challenge", body: proposal.challenge },
    { id: "approach", title: "Our Approach", body: proposal.approach },
    { id: "background", title: "2. Background", body: proposal.background },
    { id: "objectives", title: "3. Objectives", body: proposal.objectives },
    { id: "process-model", title: "5. Software process model", body: proposal.softwareProcessModel },
    { id: "process-activities", title: "5a. Process activities and quality assurance", body: proposal.processActivities },
    { id: "budget", title: "6. Budget", body: proposal.budgetBreakdown },
    { id: "architecture", title: "7. System architecture", body: proposal.systemArchitecture },
    { id: "risks", title: "8. Risk assessment", body: proposal.riskAssessment },
    { id: "resources", title: "9. Resources", body: proposal.resources },
    { id: "technical", title: "10. Technical specifications", body: proposal.technicalSpecifications },
    { id: "timeline-deliverables", title: "11. Timeline and deliverables", body: proposal.timelineDeliverables },
    { id: "conclusion", title: "12. Conclusion", body: proposal.conclusion },
    { id: "about-us", title: "About Us", body: proposal.aboutUs },
    { id: "how-we-work", title: "How We Work", body: proposal.howWeWork },
    { id: "recent-work", title: "Recent Work", body: proposal.recentWork },
    { id: "testimonial", title: "What Clients Say", body: proposal.testimonial },
    { id: "payment-schedule", title: "Payment Schedule", body: proposal.paymentSchedule },
    { id: "change-request-policy", title: "Change Requests", body: proposal.changeRequestPolicy },
    { id: "intellectual-property", title: "Intellectual Property", body: proposal.intellectualProperty },
    { id: "warranty-support", title: "Warranty and Post-Launch Support", body: proposal.warrantySupport },
    { id: "cancellation-policy", title: "Cancellation", body: proposal.cancellationPolicy },
  ].filter((section): section is { id: string; title: string; body: string } => !!section.body?.trim());
  const narrativeSections = templateSections.filter((section) => section.id === "challenge" || section.id === "approach");
  const detailSections = templateSections.filter((section) => section.id !== "challenge" && section.id !== "approach");

  const company = lead.operatingCompany || (["Evecture", "Servn"].includes(proposal.preparedBy || "") ? proposal.preparedBy : "Evecture");
  const basic = templateSections.length === 0;
  const templateLabels = new Map(templateSections.map((section) => [section.id, section.title]));
  const contents = [
    { id: "overview", label: "1. Executive Summary", visible: true },
    { id: "challenge", label: templateLabels.get("challenge") || "The Challenge", visible: templateLabels.has("challenge") },
    { id: "approach", label: templateLabels.get("approach") || "Our Approach", visible: templateLabels.has("approach") },
    { id: "background", label: templateLabels.get("background") || "2. Background", visible: templateLabels.has("background") },
    { id: "objectives", label: templateLabels.get("objectives") || "3. Objectives", visible: templateLabels.has("objectives") },
    { id: "scope", label: "4. Scope and deliverables", visible: true },
    { id: "process-model", label: templateLabels.get("process-model") || "5. Software process model", visible: templateLabels.has("process-model") },
    { id: "process-activities", label: templateLabels.get("process-activities") || "5a. Process activities and quality assurance", visible: templateLabels.has("process-activities") },
    { id: "budget", label: templateLabels.get("budget") || "6. Budget", visible: templateLabels.has("budget") },
    { id: "architecture", label: templateLabels.get("architecture") || "7. System architecture", visible: templateLabels.has("architecture") },
    { id: "risks", label: templateLabels.get("risks") || "8. Risk assessment", visible: templateLabels.has("risks") },
    { id: "resources", label: templateLabels.get("resources") || "9. Resources", visible: templateLabels.has("resources") },
    { id: "technical", label: templateLabels.get("technical") || "10. Technical specifications", visible: templateLabels.has("technical") },
    { id: "timeline-deliverables", label: templateLabels.get("timeline-deliverables") || "11. Timeline and deliverables", visible: templateLabels.has("timeline-deliverables") },
    { id: "conclusion", label: templateLabels.get("conclusion") || "12. Conclusion", visible: templateLabels.has("conclusion") },
    { id: "about-us", label: templateLabels.get("about-us") || "About Us", visible: templateLabels.has("about-us") },
    { id: "how-we-work", label: templateLabels.get("how-we-work") || "How We Work", visible: templateLabels.has("how-we-work") },
    { id: "recent-work", label: templateLabels.get("recent-work") || "Recent Work", visible: templateLabels.has("recent-work") },
    { id: "testimonial", label: templateLabels.get("testimonial") || "What Clients Say", visible: templateLabels.has("testimonial") },
    { id: "payment-schedule", label: templateLabels.get("payment-schedule") || "Payment Schedule", visible: templateLabels.has("payment-schedule") },
    { id: "change-request-policy", label: templateLabels.get("change-request-policy") || "Change Requests", visible: templateLabels.has("change-request-policy") },
    { id: "intellectual-property", label: templateLabels.get("intellectual-property") || "Intellectual Property", visible: templateLabels.has("intellectual-property") },
    { id: "warranty-support", label: templateLabels.get("warranty-support") || "Warranty and Post-Launch Support", visible: templateLabels.has("warranty-support") },
    { id: "cancellation-policy", label: templateLabels.get("cancellation-policy") || "Cancellation", visible: templateLabels.has("cancellation-policy") },
    { id: "timeline", label: "Timeline and investment", visible: true },
    { id: "working-together", label: "Working together", visible: true },
    { id: "questions", label: "Questions", visible: true },
  ].filter((item) => item.visible);

  return <main className="client-proposal-page">
    <header className="client-proposal-header">
      <div className="client-proposal-brand"><strong>{company}</strong></div>
      <div className="client-proposal-header-actions"><button type="button" onClick={() => window.print()}><Printer size={15} />Save A4 PDF</button>{proposal.documentDataUrl && <a href={proposal.documentDataUrl} download={proposal.documentName}><Download size={15} />Download attachment</a>}</div>
    </header>

    <section className="client-proposal-hero">
      <p className="client-proposal-kicker">Proposal v{proposal.version}</p>
      <h1>{proposal.proposalTitle || proposal.projectTitle || `Proposal for ${lead.companyName || lead.fullName}`}</h1>
      {proposal.projectTitle && proposal.projectTitle !== proposal.proposalTitle && <p className="client-proposal-project-title">Project: {proposal.projectTitle}</p>}
      <p className="client-proposal-intro">Prepared for <strong>{lead.companyName || lead.fullName}</strong></p>
      {proposal.preparedBy && proposal.preparedBy !== company && <p className="client-proposal-prepared-by">Prepared by {lines(proposal.preparedBy).join(" · ")}</p>}
      <div className="client-proposal-meta"><span>Prepared by {company}</span><span>Valid until {proposal.expiryDate}</span><span>{proposal.currency} {proposal.billingStructure}</span></div>
    </section>

    {!basic && <nav className="client-proposal-toc" aria-label="Table of contents"><h2>Table of Contents</h2><ol>{contents.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.label}</a></li>)}</ol></nav>}

    {responseSaved && <section className="client-proposal-response-saved"><Check size={18} /><div><strong>Thank you. Your response has been recorded.</strong><span>{proposal.status === "ACCEPTED" ? "We will be in touch with the next steps." : proposal.status === "CHANGES_REQUESTED" ? "The team will review your requested changes." : "We have recorded your decision."}</span></div></section>}
    {expired && isOpen && <div className="client-proposal-notice">This proposal has passed its validity date. Contact the team if you would like an updated version.</div>}

    <div className="client-proposal-content">
      <section id="overview" className="client-proposal-card client-proposal-summary"><h2>Executive summary</h2><p>{proposal.executiveSummary || lead.description || "This proposal outlines the recommended scope, delivery approach, and investment for your project."}</p></section>
      {narrativeSections.length > 0 && <div className="client-proposal-template-grid client-proposal-narrative-grid">{narrativeSections.map((section) => <section id={section.id} className="client-proposal-card client-proposal-template-section" key={section.id}><h2>{section.title}</h2><p className="client-proposal-longform">{section.body}</p></section>)}</div>}
      <div id="scope" className="client-proposal-two-column"><section className="client-proposal-card"><h2>{basic ? "Scope and deliverables" : "4. Scope and deliverables"}</h2><h3>Included scope</h3><ul>{lines(proposal.scopeIncluded).map((item) => <li key={item}>{item}</li>)}</ul><h3>Deliverables</h3><ul>{lines(proposal.deliverables).map((item) => <li key={item}>{item}</li>)}</ul>{proposal.scopeExcluded && <><h3>Not included</h3><ul>{lines(proposal.scopeExcluded).map((item) => <li key={item}>{item}</li>)}</ul></>}</section><section id="timeline" className="client-proposal-card"><h2>Timeline and investment</h2><h3>Timeline</h3><ul>{lines(proposal.timeline || "").map((item) => <li key={item}>{item}</li>)}</ul><div className="client-proposal-price"><span>Total investment</span><strong>{money(proposal.quotedAmount, proposal.currency)}</strong><small>{proposal.billingStructure} · {proposal.depositPercent}% deposit{proposal.revisionRounds ? ` · ${proposal.revisionRounds} revision rounds` : ""}</small></div><h3>Payment terms</h3><p>{proposal.paymentTerms || "Payment terms will be confirmed before the project begins."}</p></section></div>
      {detailSections.length > 0 && <div className="client-proposal-template-grid">{detailSections.map((section) => <section id={section.id} className="client-proposal-card client-proposal-template-section" key={section.id}><h2>{section.title}</h2><p className="client-proposal-longform">{section.body}</p></section>)}</div>}
      <div className="client-proposal-two-column"><section id="working-together" className="client-proposal-card"><h2>Working together</h2><h3>Client requirements</h3><p>{proposal.clientRequirements || "The client will provide timely access, content, feedback, and approvals needed to keep delivery on track."}</p><h3>Assumptions and exclusions</h3><p>{proposal.assumptions || "Any work outside the included scope will be discussed and approved separately."}</p></section><section id="questions" className="client-proposal-card"><h2>Questions</h2><p>For questions about this proposal, contact:</p><div className="client-proposal-contact"><strong>{company} project team</strong><span>Contact the team member who shared this proposal with you.</span></div></section></div>
    </div>

    <section id="acceptance" className="client-proposal-signature-section"><h2>Acceptance</h2><p>By accepting this proposal, the client confirms the scope, investment, payment terms, and assumptions described above.</p><div className="client-proposal-signature-grid"><span>Client name</span><span>Signature</span><span>Date</span></div></section>

    {isOpen && !responseSaved && <section className="client-proposal-actions"><div><h2>Ready to respond?</h2><p>Accept this proposal, request changes, or let us know if it is not the right fit.</p></div><div className="client-proposal-action-buttons"><button type="button" className="client-proposal-accept" disabled={expired || submitting} onClick={() => { setResponseMode("accept"); setError(""); }}><Check size={16} />Accept proposal</button><button type="button" onClick={() => { setResponseMode("changes"); setError(""); }}>Request changes</button><button type="button" onClick={() => { setResponseMode("decline"); setError(""); }}>Decline</button></div></section>}
    {responseMode && !responseSaved && <div className="client-proposal-response-form"><form onSubmit={respond}><h2>{responseMode === "accept" ? "Accept proposal" : responseMode === "changes" ? "Request changes" : "Decline proposal"}</h2>{responseMode === "accept" ? <label>Name of approving contact<input value={responseName} onChange={(event) => setResponseName(event.target.value)} placeholder="Your full name" autoFocus /></label> : <label>{responseMode === "changes" ? "What would you like changed?" : "Why are you declining?"}<textarea value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder={responseMode === "changes" ? "Add notes for the team" : "Optional context for the team"} autoFocus /></label>}{error && <p className="client-proposal-error">{error}</p>}<div><button type="button" onClick={() => setResponseMode(null)}>Cancel</button><button type="submit" disabled={submitting || expired} className="client-proposal-accept"><Send size={15} />{submitting ? "Saving response…" : "Submit response"}</button></div></form></div>}
    <footer className="client-proposal-footer">{company} · This proposal is private to the recipient of this link.</footer>
  </main>;
}
