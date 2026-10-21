"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, Clock3, Download, FileText, Printer, Send, ShieldCheck } from "lucide-react";
import { formatLeadId, type Lead, type LeadInvoice, type ProposalVersion, readLeads, updateLead } from "@/lib/leads";
import { addProject, projectFromLead, type ProjectClassification, type ProjectTeamMember } from "@/lib/projects";

const MAX_DOCUMENT_BYTES = 1_200_000;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read file"));
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function nextInvoiceNumber(leads: Lead[]) {
  const year = new Date().getFullYear();
  const values = leads.map((lead) => lead.invoice?.invoiceNumber.match(new RegExp(`^INV-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `INV-${year}-${String(Math.max(0, ...values) + 1).padStart(3, "0")}`;
}

export default function LeadWorkspacePage() {
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const leadId = params.leadId;
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proposalFile, setProposalFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [acceptanceFile, setAcceptanceFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [revisionMode, setRevisionMode] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const refresh = () => {
      setLead(readLeads().find((item) => item.id === leadId) ?? null);
      setLoading(false);
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("storage", refresh);
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("storage", refresh);
      window.clearInterval(interval);
    };
  }, [leadId]);

  function saveLead(updates: Partial<Lead>) {
    if (!lead) return;
    updateLead(lead.id, updates);
    setLead({ ...lead, ...updates });
  }

  async function selectDocument(file: File | undefined, setter: (value: { name: string; dataUrl: string } | null) => void) {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError("For this browser prototype, attached documents must be under 1.2 MB.");
      return;
    }
    try {
      setter({ name: file.name, dataUrl: await readFile(file) });
      setError("");
    } catch {
      setError("Could not read the selected document.");
    }
  }

  function submitProposal(event: FormEvent<HTMLFormElement>, send: boolean) {
    event.preventDefault();
    if (!lead) return;
    if (!proposalFile) {
      setError("Attach the proposal or SOW file before saving this version.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const quotedAmount = Number(data.get("quotedAmount"));
    const depositPercent = Number(data.get("depositPercent"));
    const expiryDate = String(data.get("expiryDate") || "");
    const finalFollowUpDate = String(data.get("finalFollowUpDate") || "");
    if (!Number.isFinite(quotedAmount) || quotedAmount <= 0 || !expiryDate || !finalFollowUpDate) {
      setError("Enter a contract amount and both proposal follow-up dates.");
      return;
    }
    const earliestFinalNudge = new Date(`${expiryDate}T09:00:00`).getTime() + 3 * 86400000;
    if (new Date(`${finalFollowUpDate}T09:00:00`).getTime() < earliestFinalNudge) {
      setError("Set the final nudge at least three days after the proposal expiry date.");
      return;
    }
    const previous = lead.proposals ?? [];
    const version = Math.max(0, ...previous.map((item) => item.version)) + 1;
    const expiry = new Date(`${expiryDate}T09:00:00`).toISOString();
    const plusThree = new Date(new Date(expiry).getTime() + 3 * 86400000).toISOString();
    const proposal: ProposalVersion = {
      version,
      status: send ? "SENT" : "DRAFT",
      createdAt: new Date().toISOString(),
      sentAt: send ? new Date().toISOString() : undefined,
      expiryDate,
      finalFollowUpDate,
      quotedAmount,
      currency: String(data.get("currency") || ""),
      scopeIncluded: String(data.get("scopeIncluded") || ""),
      scopeExcluded: String(data.get("scopeExcluded") || ""),
      deliverables: String(data.get("deliverables") || ""),
      revisionRounds: Number(data.get("revisionRounds") || 0),
      depositPercent,
      billingStructure: String(data.get("billingStructure") || "Fixed") as ProposalVersion["billingStructure"],
      paymentTerms: String(data.get("paymentTerms") || ""),
      approvalProcess: String(data.get("approvalProcess") || ""),
      clientRequirements: String(data.get("clientRequirements") || ""),
      assumptions: String(data.get("assumptions") || ""),
      documentName: proposalFile.name,
      documentDataUrl: proposalFile.dataUrl,
      followUps: [
        { label: "Expiry day", dueAt: expiry },
        { label: "3 days after expiry", dueAt: plusThree },
        { label: "Final nudge", dueAt: new Date(`${finalFollowUpDate}T09:00:00`).toISOString() },
      ],
    };
    const versions = previous.map((item) => item.status === "SENT" ? { ...item, status: "SUPERSEDED" as const } : item);
    saveLead({ proposals: [...versions, proposal], status: send ? "PROPOSAL_SENT" : "QUALIFIED" });
    setProposalFile(null);
    setRevisionMode(false);
    setError("");
  }

  function logFollowUp(proposal: ProposalVersion, index: number) {
    if (!lead) return;
    const proposals = [...(lead.proposals ?? [])];
    const versionIndex = proposals.findIndex((item) => item.version === proposal.version);
    if (versionIndex < 0) return;
    const followUps = [...proposals[versionIndex].followUps];
    followUps[index] = { ...followUps[index], loggedAt: new Date().toISOString() };
    proposals[versionIndex] = { ...proposals[versionIndex], followUps };
    saveLead({ proposals });
  }

  function acceptProposal(event: FormEvent<HTMLFormElement>, proposal: ProposalVersion) {
    event.preventDefault();
    if (!lead) return;
    const data = new FormData(event.currentTarget);
    const proposals = (lead.proposals ?? []).map((item) => item.version === proposal.version ? { ...item, status: "ACCEPTED" as const } : item);
    saveLead({
      status: "ACCEPTED",
      acceptedAt: new Date().toISOString(),
      acceptanceName: String(data.get("acceptanceName") || "").trim(),
      acceptanceDocumentName: acceptanceFile?.name,
      acceptanceDocumentDataUrl: acceptanceFile?.dataUrl,
      proposals,
    });
    setAcceptanceFile(null);
    setError("");
  }

  function markDeclined(proposal: ProposalVersion) {
    if (!lead || !declineReason.trim()) return;
    const proposals = (lead.proposals ?? []).map((item) => item.version === proposal.version ? { ...item, status: "DECLINED" as const } : item);
    saveLead({ status: "LOST", disqualificationReason: `Client declined: ${declineReason.trim()}`, proposals });
    setDeclineReason("");
  }

  function markNoResponse(proposal: ProposalVersion) {
    if (!lead) return;
    const proposals = (lead.proposals ?? []).map((item) => item.version === proposal.version ? { ...item, status: "DECLINED" as const } : item);
    saveLead({ status: "LOST", disqualificationReason: "No response after proposal follow-up sequence", proposals });
  }

  function generateInvoice(event: FormEvent<HTMLFormElement>, proposal: ProposalVersion) {
    event.preventDefault();
    if (!lead) return;
    const data = new FormData(event.currentTarget);
    const depositPercent = Number(data.get("depositPercent"));
    const issueDate = String(data.get("issueDate") || "");
    const dueDate = String(data.get("dueDate") || "");
    if (!issueDate || !dueDate || !Number.isFinite(depositPercent) || depositPercent <= 0 || depositPercent > 100) {
      setError("Enter an issue date, due date, and deposit percentage between 1 and 100.");
      return;
    }
    const invoice: LeadInvoice = {
      invoiceNumber: nextInvoiceNumber(readLeads()),
      issueDate,
      dueDate,
      contractValue: proposal.quotedAmount,
      depositPercent,
      depositAmount: proposal.quotedAmount * depositPercent / 100,
      currency: proposal.currency,
      paymentTerms: String(data.get("paymentTerms") || ""),
      paymentInstructions: String(data.get("paymentInstructions") || ""),
      externalPaymentLink: String(data.get("externalPaymentLink") || ""),
      status: "GENERATED",
    };
    saveLead({ invoice });
    setError("");
  }

  function markInvoiceSent() {
    if (!lead?.invoice) return;
    saveLead({ invoice: { ...lead.invoice, status: "SENT", sentAt: new Date().toISOString() } });
  }

  function confirmExternalPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead?.invoice) return;
    const data = new FormData(event.currentTarget);
    saveLead({ invoice: { ...lead.invoice, status: "CONFIRMED_PAID", transactionReference: String(data.get("transactionReference") || "").trim(), confirmedPaidAt: new Date().toISOString() } });
  }

  function createProjectFromLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || lead.status !== "ACCEPTED" || lead.projectId) {
      setError("Only an accepted lead can be moved into Projects.");
      return;
    }
    const acceptedProposal = [...(lead.proposals ?? [])].find((proposal) => proposal.status === "ACCEPTED");
    if (!acceptedProposal) {
      setError("No accepted proposal is linked to this lead record.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const allocation = (key: string) => Number(data.get(`${key}Allocation`) || 0);
    const team: ProjectTeamMember[] = ([
      ["Project Manager", "projectManager"],
      ["Lead Designer", "leadDesigner"],
      ["Lead Developer", "leadDeveloper"],
      ["QA Owner", "qaOwner"],
      ["Supporting team member", "supportingMember"],
    ] as const).map(([role, key]) => ({ role, name: String(data.get(key) || "").trim(), allocationPercent: allocation(key) }));
    try {
      const project = projectFromLead({
        lead,
        proposal: acceptedProposal,
        title: String(data.get("projectTitle") || "").trim(),
        classification: String(data.get("classification") || "New Client") as ProjectClassification,
        startDate: String(data.get("startDate") || ""),
        kickoffScheduledAt: new Date(String(data.get("kickoffScheduledAt") || "")).toISOString(),
        team,
      });
      addProject(project);
      updateLead(lead.id, { status: "CONVERTED", projectId: project.id });
      router.push(`/projects/${project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project workspace could not be created.");
    }
  }

  if (loading) return <div className="page-content"><div className="panel pipeline-empty"><p>Loading lead record…</p></div></div>;
  if (!lead) return <div className="page-content"><div className="panel pipeline-empty"><h2>Lead record not found</h2><p>It may have been removed from this browser or created in another workspace.</p><Link className="button button-quiet" href="/requests"><ArrowLeft size={14}/>Back to pipeline</Link></div></div>;

  const latest = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
  const sequenceComplete = !!latest && latest.followUps.length > 0 && latest.followUps.every((item) => !!item.loggedAt);
  const outstandingFollowUp = latest?.status === "SENT" ? latest.followUps.findIndex((item) => !item.loggedAt && new Date(item.dueAt).getTime() <= now) : -1;

  return <div className="page-content lead-workspace-page">
    <Link className="back-link" href="/requests"><ArrowLeft size={15}/>Request pipeline</Link>
    <header className="record-heading"><div><div className="eyebrow">{formatLeadId(lead.id)} · {lead.source}</div><h1>{lead.companyName || lead.fullName}</h1><p>{lead.fullName}{lead.designation ? ` · ${lead.designation}` : ""} · {lead.services.join(", ")}</p></div><span className={`lead-status status-${lead.status.toLowerCase().replace("_", "-")}`}>{lead.status.replaceAll("_", " ")}</span></header>

    {lead.qualification && <section className="panel record-section"><div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17}/></span><div><h2>Qualification</h2><p>Discovery call recorded {lead.qualification.discoveryCallAt ? new Date(lead.qualification.discoveryCallAt).toLocaleString() : ""}</p></div></div><span className={`lead-status status-${lead.status.toLowerCase().replace("_", "-")}`}>{lead.status === "DISQUALIFIED" ? "DISQUALIFIED" : "QUALIFICATION RECORDED"}</span></div><div className="qualification-summary-grid"><div><small>Actual problem</small><p>{lead.qualification.actualProblem || "Not recorded"}</p></div><div><small>Desired outcome</small><p>{lead.qualification.desiredOutcome || "Not recorded"}</p></div><div><small>Budget / scope fit</small><p>{lead.qualification.budgetFit}</p></div><div><small>Good fit</small><p>{lead.qualification.goodFit}</p></div><div><small>Decision maker</small><p>{lead.qualification.decisionMaker || "Not recorded"}</p></div><div><small>Decision timeline</small><p>{lead.qualification.decisionTimeline || "Not recorded"}</p></div></div>{lead.qualification.callNotes && <div className="saved-call-notes"><small>Discovery call notes</small><p>{lead.qualification.callNotes}</p></div>}</section>}

    {lead.status === "ACCEPTED" && <section className="panel record-section acceptance-record"><div className="record-section-heading"><div><span className="section-icon"><Check size={17}/></span><div><h2>Proposal accepted</h2><p>{lead.acceptedAt ? new Date(lead.acceptedAt).toLocaleString() : "Acceptance recorded"}</p></div></div></div><div className="detail-line"><b>Signatory</b>{lead.acceptanceName || "Not recorded"}</div>{lead.acceptanceDocumentName && <div className="detail-line"><b>Signed document</b>{lead.acceptanceDocumentDataUrl ? <a href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}>{lead.acceptanceDocumentName} <Download size={12}/></a> : lead.acceptanceDocumentName}</div>}</section>}

    {(lead.status === "QUALIFIED" || lead.status === "PROPOSAL_SENT" || lead.status === "ACCEPTED") && <section className="panel record-section proposal-section">
      <div className="record-section-heading"><div><span className="section-icon"><FileText size={17}/></span><div><h2>Proposal & SOW</h2><p>Prepare a versioned scope, record the quote, and track client response.</p></div></div>{latest && <span className={`proposal-version-status version-${latest.status.toLowerCase()}`}>Version {latest.version} · {latest.status}</span>}</div>
      {latest?.status === "SENT" && !revisionMode && <div className="sent-proposal-meta"><div><strong>Proposal v{latest.version}</strong><span>{latest.documentName} · Sent {latest.sentAt ? new Date(latest.sentAt).toLocaleString() : ""}</span><span>Quoted {money(latest.quotedAmount, latest.currency)} · Expires {latest.expiryDate}</span>{latest.documentDataUrl && <a href={latest.documentDataUrl} download={latest.documentName}><Download size={13}/>Download proposal / SOW</a>}</div><button className="button button-quiet" onClick={() => { setRevisionMode(true); setProposalFile(null); }}>Revise proposal</button></div>}
      {lead.status === "QUALIFIED" && !revisionMode && latest?.status !== "SENT" && <button className="button button-primary proposal-start" onClick={() => { setRevisionMode(true); setProposalFile(null); }}>Prepare proposal <ArrowRight size={14}/></button>}
      {revisionMode && <form className="proposal-form" onSubmit={(event) => submitProposal(event, true)}>
        <div className="form-callout"><CalendarClock size={15}/>Proposal submission schedules follow-up reminders at expiry, three days later, and the final date you set below.</div>
        <div className="proposal-fields-grid">
          <label className="field required">Quoted amount<input name="quotedAmount" type="number" min="0.01" step="0.01" required placeholder="0.00" defaultValue={latest?.quotedAmount || ""}/></label>
          <label className="field required">Currency<select name="currency" required defaultValue={latest?.currency || ""}><option value="" disabled>Select currency</option>{["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label className="field required">Proposal expiry date<input name="expiryDate" type="date" required defaultValue={latest?.expiryDate || ""}/></label>
          <label className="field required">Final follow-up date<input name="finalFollowUpDate" type="date" required defaultValue={latest?.finalFollowUpDate || ""}/></label>
          <label className="field required">Included revision rounds<input name="revisionRounds" type="number" min="0" step="1" required defaultValue={latest?.revisionRounds ?? ""}/></label>
          <label className="field required">Deposit percentage<input name="depositPercent" type="number" min="1" max="100" step="1" required defaultValue={latest?.depositPercent ?? ""}/></label>
          <label className="field required">Billing structure<select name="billingStructure" required defaultValue={latest?.billingStructure || ""}><option value="" disabled>Select structure</option><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label>
        </div>
        <div className="proposal-fields-grid proposal-copy-fields">
          <label className="field required">Included scope<textarea name="scopeIncluded" rows={3} required defaultValue={latest?.scopeIncluded || ""} placeholder="Precisely what is included"/></label>
          <label className="field">Excluded scope<textarea name="scopeExcluded" rows={3} defaultValue={latest?.scopeExcluded || ""} placeholder="What is outside this proposal"/></label>
          <label className="field required">Deliverables<textarea name="deliverables" rows={3} required defaultValue={latest?.deliverables || ""} placeholder="List each specific output"/></label>
          <label className="field">Payment terms<textarea name="paymentTerms" rows={3} defaultValue={latest?.paymentTerms || ""} placeholder="Deposit and payment conditions"/></label>
          <label className="field">Approval process<textarea name="approvalProcess" rows={3} defaultValue={latest?.approvalProcess || ""} placeholder="How client sign-offs are recorded"/></label>
          <label className="field">Client requirements<textarea name="clientRequirements" rows={3} defaultValue={latest?.clientRequirements || ""} placeholder="Assets, access, and timely feedback needed"/></label>
          <label className="field">Assumptions & exclusions<textarea name="assumptions" rows={3} defaultValue={latest?.assumptions || ""} placeholder="For example, copywriting is not included"/></label>
        </div>
        <label className="field document-upload">Attach proposal / SOW file<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => void selectDocument(event.target.files?.[0], setProposalFile)}/><small>{proposalFile ? `Attached: ${proposalFile.name}` : latest?.documentName ? `New version required. Previous file: ${latest.documentName}` : "PDF or Word file. Prototype limit: 1.2 MB."}</small></label>
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setRevisionMode(false)}>Cancel</button><button type="submit" className="button button-primary"><Send size={14}/>{latest?.status === "SENT" ? "Save & send revised version" : "Save & mark proposal sent"}</button></div>
      </form>}

      {latest?.status === "SENT" && !revisionMode && <div className="followup-panel"><h3><CalendarClock size={15}/>Proposal follow-up sequence</h3><p>Record each follow-up after the PM contacts the client. Email delivery is not connected in this workspace.</p><div className="followup-steps">{latest.followUps.map((followUp, index) => { const due = new Date(followUp.dueAt); const overdue = !followUp.loggedAt && due.getTime() < now; return <div className="followup-step" key={`${latest.version}-${followUp.label}`}><span className={`followup-marker ${followUp.loggedAt ? "done" : overdue ? "overdue" : ""}`}>{followUp.loggedAt ? <Check size={12}/> : index + 1}</span><div><strong>{followUp.label}</strong><small>{due.toLocaleDateString()} {overdue ? "· due" : ""}</small>{followUp.loggedAt && <small>Logged {new Date(followUp.loggedAt).toLocaleString()}</small>}</div>{!followUp.loggedAt && index === outstandingFollowUp && <button className="button button-quiet" onClick={() => logFollowUp(latest, index)}>Log follow-up sent</button>}</div>; })}</div></div>}

      {latest?.status === "SENT" && !revisionMode && <div className="proposal-outcomes"><form className="acceptance-form" onSubmit={(event) => acceptProposal(event, latest)}><h3>Client accepts</h3><p>Record the authorized signatory to mark the proposal accepted. The signed SOW may be attached later.</p><label className="field">Name of signatory<input name="acceptanceName" required placeholder="Authorized signatory"/></label><label className="field document-upload">Attach signed SOW (optional)<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => void selectDocument(event.target.files?.[0], setAcceptanceFile)}/><small>{acceptanceFile?.name || "You can add the signed document later."}</small></label><button className="button button-primary" type="submit"><Check size={14}/>Record acceptance</button></form>
        <div className="decline-form"><h3>Client declines</h3><p>Archive the lead with a reason.</p><label className="field">Decline reason<textarea rows={2} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Reason provided, if any"/></label><button className="button button-quiet" disabled={!declineReason.trim()} onClick={() => markDeclined(latest)}>Mark lost · declined</button></div>
        <div className="silent-form"><h3>Client goes silent</h3><p>After the follow-up sequence is complete, archive as no response.</p><button className="button button-quiet" disabled={!sequenceComplete} onClick={() => markNoResponse(latest)}>Mark lost · no response</button></div>
      </div>}

      {lead.status === "ACCEPTED" && !lead.invoice && latest && <form className="invoice-generator" onSubmit={(event) => generateInvoice(event, latest)}><div className="invoice-generator-heading"><span className="section-icon"><FileText size={17}/></span><div><h2>Deposit invoice</h2><p>Proposal accepted. Generate the invoice record for external payment collection.</p></div></div><div className="invoice-summary-value"><span>Contract value</span><strong>{money(latest.quotedAmount, latest.currency)}</strong></div><div className="proposal-fields-grid"><label className="field required">Issue date<input type="date" name="issueDate" required defaultValue={new Date().toISOString().slice(0, 10)}/></label><label className="field required">Due date<input type="date" name="dueDate" required/></label><label className="field required">Deposit percentage<input type="number" name="depositPercent" min="1" max="100" step="1" required defaultValue={latest.depositPercent}/></label><label className="field">Payment terms<input name="paymentTerms" defaultValue={latest.paymentTerms} placeholder="e.g. Due within 14 days"/></label><label className="field">Bank wire instructions<textarea name="paymentInstructions" rows={2} placeholder="Account name, bank, and transfer instructions"/></label><label className="field">External payment link<input name="externalPaymentLink" type="url" placeholder="https://…"/></label></div><p className="payment-boundary">Payment processing is external. This module records invoice status and external transaction reference only.</p><button className="button button-primary" type="submit">Generate deposit invoice <ArrowRight size={14}/></button></form>}

    {lead.invoice && <div className="invoice-block"><div className="record-section-heading"><div><span className="section-icon"><FileText size={17}/></span><div><h2>Deposit invoice</h2><p>{lead.invoice.invoiceNumber} · {lead.invoice.status.replaceAll("_", " ")}{lead.invoice.sentAt ? ` · sent ${new Date(lead.invoice.sentAt).toLocaleString()}` : ""}</p></div></div><div className="invoice-actions"><button className="button button-quiet" onClick={() => window.print()}><Printer size={14}/>Print / save PDF</button>{lead.invoice.status === "GENERATED" && <button className="button button-primary" onClick={markInvoiceSent}><Send size={14}/>Log invoice sent</button>}</div></div>
        <div className="invoice-print-area"><div className="invoice-paper-head"><div><span className="brand-mark"><svg viewBox="0 0 32 32"><path d="M6 7h20M6 16h16M6 25h20"/><path d="M22 12l4 4-4 4"/></svg></span><strong>Evecture Studio</strong></div><div className="invoice-title"><span>DEPOSIT INVOICE</span><h2>{lead.invoice.invoiceNumber}</h2></div></div><div className="invoice-paper-meta"><div><small>BILL TO</small><strong>{lead.companyName || lead.fullName}</strong><span>{lead.fullName}</span><span>{lead.email}</span></div><div><small>PROJECT / PROPOSAL</small><strong>{lead.services.join(", ")}</strong><span>Proposal v{latest?.version}</span><span>Issued {lead.invoice.issueDate} · Due {lead.invoice.dueDate}</span></div></div><table className="invoice-lines"><thead><tr><th>DESCRIPTION</th><th>CONTRACT VALUE</th><th>DEPOSIT</th></tr></thead><tbody><tr><td>Project deposit · {lead.services.join(", ")}</td><td>{money(lead.invoice.contractValue, lead.invoice.currency)}</td><td>{lead.invoice.depositPercent}%</td></tr></tbody></table><div className="invoice-total"><span>Deposit due</span><strong>{money(lead.invoice.depositAmount, lead.invoice.currency)}</strong></div><div className="invoice-paper-terms"><strong>Payment terms</strong><p>{lead.invoice.paymentTerms || "As agreed in the signed proposal."}</p>{lead.invoice.paymentInstructions && <><strong>Bank wire instructions</strong><p>{lead.invoice.paymentInstructions}</p></>}{lead.invoice.externalPaymentLink && <><strong>External payment link</strong><p>{lead.invoice.externalPaymentLink}</p></>}</div><p className="invoice-reference">Proposal / SOW · {formatLeadId(lead.id)} · {lead.companyName || lead.fullName}</p></div>
        <p className="payment-boundary">Invoice email delivery is not connected. Print or save the invoice and send it through the studio billing workflow. Payment remains external.</p>
        {lead.invoice.status === "SENT" ? <form className="confirm-payment-form" onSubmit={confirmExternalPayment}><div><strong>Confirm external payment</strong><small>Only mark paid after finance confirms receipt outside this module.</small></div><input name="transactionReference" required placeholder="Bank / accounting transaction reference"/><button className="button button-quiet" type="submit">Confirm paid externally</button></form> : lead.invoice.status === "GENERATED" ? <p className="payment-boundary">Log the invoice as sent before confirming external payment.</p> : <div className="payment-confirmed"><Check size={15}/><span>Confirmed paid {lead.invoice.confirmedPaidAt ? new Date(lead.invoice.confirmedPaidAt).toLocaleString() : ""}</span>{lead.invoice.transactionReference && <small>Reference: {lead.invoice.transactionReference}</small>}</div>}
      </div>}
    </section>}

    {lead.status === "CONVERTED" && lead.projectId && <section className="panel record-section project-gate-complete"><div className="record-section-heading"><div><span className="section-icon"><Check size={17}/></span><div><h2>Project workspace created</h2><p>Accepted proposal details and any available commercial records are linked to the active project.</p></div></div></div><Link className="button button-primary" href={`/projects/${lead.projectId}`}>Open project workspace <ArrowRight size={14}/></Link></section>}

    {lead.status === "ACCEPTED" && !lead.projectId && latest && <section className="panel record-section project-create-section"><div className="record-section-heading"><div><span className="section-icon"><Check size={17}/></span><div><h2>Move accepted project into Projects</h2><p>Set the project owner and setup details to create its workspace. Deposit and SOW tracking can be completed separately.</p></div></div></div>
      <div className="commercial-proof"><span className={lead.acceptanceDocumentDataUrl ? "" : "commercial-proof-pending"}>{lead.acceptanceDocumentDataUrl ? <Check size={13}/> : <Clock3 size={13}/>}Signed SOW · {lead.acceptanceDocumentDataUrl ? lead.acceptanceDocumentName : "not attached"}</span><span className={lead.invoice?.status === "CONFIRMED_PAID" ? "" : "commercial-proof-pending"}>{lead.invoice?.status === "CONFIRMED_PAID" ? <Check size={13}/> : <Clock3 size={13}/>}Deposit · {lead.invoice ? lead.invoice.status.replaceAll("_", " ") : "not recorded"}</span></div>
      <form className="project-create-form" onSubmit={createProjectFromLead}>
        <div className="proposal-fields-grid"><label className="field required">Project title<input name="projectTitle" required defaultValue={`${lead.companyName || lead.fullName} — ${lead.services.join(", ")}`}/></label><label className="field required">Project classification<select name="classification" required defaultValue={lead.acquisitionSource === "Referral" ? "Referral" : lead.acquisitionSource === "Repeat client" ? "Repeat Client" : "New Client"}><option>New Client</option><option>Repeat Client</option><option>Referral</option></select></label><label className="field required">Project start date<input type="date" name="startDate" required/></label><label className="field required">Kickoff meeting date & time<input type="datetime-local" name="kickoffScheduledAt" required/></label></div>
        <div className="project-team-setup"><div><h3>Initial team assignment</h3><p>Resource availability is not connected yet. Enter the assigned employee and allocation; blank roles can be assigned later.</p></div><div className="project-team-grid">{([["Project Manager", "projectManager", true], ["Lead Designer", "leadDesigner", false], ["Lead Developer", "leadDeveloper", false], ["QA Owner", "qaOwner", false], ["Supporting team member", "supportingMember", false]] as const).map(([role, key, required]) => <div className="project-team-row" key={key}><label className="field">{role}<input name={key} required={required} placeholder={required ? "Assigned PM" : "Unassigned"}/></label><label className="field">Allocation %<input name={`${key}Allocation`} type="number" min="0" max="100" step="1" required={required} placeholder="%"/></label></div>)}</div></div>
        <div className="project-template-note"><span><Check size={13}/></span><p>Proposal scope, exclusions, assumptions, revision rounds, billing structure, and payment terms carry over. Any SOW or invoice records already captured will be linked. The assigned Project Manager is recorded on the project team.</p></div>
        <div className="form-actions"><button className="button button-primary" type="submit">Move to Projects <ArrowRight size={14}/></button></div>
      </form>
    </section>}

    {lead.proposals && lead.proposals.length > 0 && <section className="panel record-section proposal-history"><div className="record-section-heading"><div><span className="section-icon"><FileText size={17}/></span><div><h2>Proposal versions</h2><p>Version history remains attached to this lead record.</p></div></div></div>{[...lead.proposals].sort((a, b) => b.version - a.version).map((proposal) => <details className="proposal-history-item" key={proposal.version}><summary><strong>Proposal v{proposal.version}</strong><span className={`proposal-version-status version-${proposal.status.toLowerCase()}`}>{proposal.status}</span><span>{money(proposal.quotedAmount, proposal.currency)}</span><span>Expires {proposal.expiryDate}</span></summary><div className="proposal-history-content"><p><b>Included:</b> {proposal.scopeIncluded}</p><p><b>Excluded:</b> {proposal.scopeExcluded || "None specified"}</p><p><b>Deliverables:</b> {proposal.deliverables}</p><p><b>Revisions:</b> {proposal.revisionRounds} rounds · <b>Deposit:</b> {proposal.depositPercent}%</p><p><b>Assumptions:</b> {proposal.assumptions || "None specified"}</p>{proposal.documentDataUrl && <a href={proposal.documentDataUrl} download={proposal.documentName}><Download size={13}/>Download {proposal.documentName}</a>}</div></details>)}</section>}

    {lead.status === "LOST" && <section className="panel record-section lost-panel"><h2>Lead archived</h2><p>{lead.disqualificationReason || "Lost reason not recorded"}</p><small>This lead is retained in the pipeline history and is not deleted.</small></section>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="pipeline-system-note"><CalendarClock size={14}/><span>Proposal reminders are stored as due follow-ups. Automated email delivery and server-side scheduling require connected notification services.</span></div>
  </div>;
}
