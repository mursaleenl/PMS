"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Download, FileText, Receipt, Send, ShieldCheck } from "lucide-react";
import { type Lead, type ProposalVersion, readLeads, updateLead } from "@/lib/leads";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { addProject, projectFromLead, updateProject, type Project, type ProjectClassification, type ProjectTeamMember } from "@/lib/projects";
import { updateInvoice } from "@/lib/invoices";
import { StatusBadge } from "@/app/_components/status-badge";
import { useAssignableUsers } from "@/lib/assignees";
import { CalendarPicker } from "@/app/_components/calendar-picker";
import { operatingCompanies, type OperatingCompany } from "@/lib/companies";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

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

export default function LeadWorkspacePage() {
  const { role } = useWorkspaceAuth();
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const leadId = params.leadId;
  const { users: assignableUsers } = useAssignableUsers();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proposalFile, setProposalFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [acceptanceFile, setAcceptanceFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [savingAttachment, setSavingAttachment] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const converting = useRef(false);

  useEffect(() => {
    const refresh = () => {
      setLead(readLeads().find((item) => item.id === leadId) ?? null);
      setLoading(false);
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("storage", refresh);
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
      setError("Attachments must be under 1.2 MB.");
      return;
    }
    try {
      setter({ name: file.name, dataUrl: await readFile(file) });
      setError("");
    } catch {
      setError("Could not read the selected document.");
    }
  }

  async function saveProposalAttachment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || !proposalFile || savingAttachment) return;
    setSavingAttachment(true);setError("");
    saveLead({qualification: {
      callNotes: "", actualProblem: "", desiredOutcome: "", budgetFit: "unknown", decisionMaker: "", decisionTimeline: "", goodFit: "unknown",
      ...lead.qualification, proposalAttachment: proposalFile,
    }});
    try { await flushWorkspaceChanges(); setProposalFile(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The attachment could not be saved."); }
    finally { setSavingAttachment(false); }
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
    saveLead({ status: "LOST", disqualificationReason: "No response from client", proposals });
  }

  function markInvoiceSent() {
    if (!lead?.invoice) return;
    const invoice = { ...lead.invoice, status: "SENT" as const, sentAt: new Date().toISOString() };
    saveLead({ invoice });
    if (lead.projectId) updateProject(lead.projectId, { invoice });
    updateInvoice(lead.invoice.invoiceNumber, { status: "SENT", sentAt: invoice.sentAt });
  }

  function confirmExternalPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead?.invoice) return;
    const data = new FormData(event.currentTarget);
    const ref = String(data.get("transactionReference") || "").trim();
    const invoice = { ...lead.invoice, status: "CONFIRMED_PAID" as const, transactionReference: ref, confirmedPaidAt: new Date().toISOString() };
    saveLead({ invoice });
    if (lead.projectId) updateProject(lead.projectId, { invoice, depositStatus: "CONFIRMED_PAID", depositAmount: invoice.depositAmount });
    updateInvoice(lead.invoice.invoiceNumber, { status: "CONFIRMED_PAID", transactionReference: ref, confirmedPaidAt: invoice.confirmedPaidAt });
  }

  async function createProjectFromLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (converting.current) return;
    if (!lead || !["QUALIFIED", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status) || lead.projectId) {
      setError("This lead cannot be moved into Projects in its current stage.");
      return;
    }
    if (!lead.operatingCompany) {
      setError("Choose Evecture or Servn in First contact before moving this project into Projects.");
      return;
    }
    const proposalForProject = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version).find((proposal) => proposal.status === "ACCEPTED")
      ?? [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
    const data = new FormData(event.currentTarget);
    const allocation = (key: string) => Number(data.get(`${key}Allocation`) || 0);
    const team: ProjectTeamMember[] = ([
      ["Project Manager", "projectManager"],
      ["Lead Designer", "leadDesigner"],
      ["Lead Developer", "leadDeveloper"],
      ["QA Owner", "qaOwner"],
      ["Supporting team member", "supportingMember"],
    ] as const).map(([role, key]) => {
      const name = String(data.get(key) || "").trim();
      return { role, name, userId: assignableUsers.find((person) => person.name === name)?.id, allocationPercent: allocation(key) };
    });
    converting.current = true;
    try {
      const project = await projectFromLead({
        lead,
        proposal: proposalForProject,
        contractedValue: Number(data.get("contractedValue")),
        currency: String(data.get("currency") || "USD"),
        billingStructure: String(data.get("billingStructure") || "Fixed") as Project["billingStructure"],
        title: String(data.get("projectTitle") || "").trim(),
        classification: String(data.get("classification") || "New Client") as ProjectClassification,
        operatingCompany: lead.operatingCompany,
        startDate: String(data.get("startDate") || ""),
        team,
      });
      addProject(project);
      updateLead(lead.id, { status: "CONVERTED", projectId: project.id });
      await flushWorkspaceChanges();
      router.push(`/projects/${project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project workspace could not be created.");
    } finally { converting.current = false; }
  }

  if (loading) return <div className="page-content"><div className="panel pipeline-empty"><p>Loading lead record…</p></div></div>;
  if (!lead) return <div className="page-content"><div className="panel pipeline-empty"><h2>Lead record not found</h2><p>This lead may have been removed or you may not have access to it.</p><Link className="button button-quiet" href="/requests"><ArrowLeft size={14} />Back to pipeline</Link></div></div>;

  const latest = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
  const projectProposal = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version).find((proposal) => proposal.status === "ACCEPTED") ?? latest;
  if (role === "employee") return <div className="page-content lead-workspace-page">
    <Link className="back-link" href="/requests"><ArrowLeft size={15} />Leads</Link>
    <header className="record-heading"><div><h1>{lead.companyName || lead.fullName}</h1><p className="welcome-subtitle">{lead.fullName}{lead.designation ? ` · ${lead.designation}` : ""} · {lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</p></div><StatusBadge status={lead.status} /></header>
    <section className="panel record-section"><div className="record-section-heading"><div><h2>Enquiry details</h2><p>{lead.services.join(" · ") || "Project enquiry"}</p></div></div><div className="qualification-summary-grid"><div><small>Company</small><p>{lead.companyName || "Individual enquiry"}</p></div><div><small>Industry</small><p>{lead.industry || "Not recorded"}</p></div><div><small>Urgency</small><p>{lead.urgency || "Not recorded"}</p></div><div><small>Country</small><p>{lead.country || "Not recorded"}</p></div></div><p className="lead-description">{lead.description || "No enquiry description recorded."}</p>{lead.referenceLinks && <p><a href={lead.referenceLinks.startsWith("http") ? lead.referenceLinks : `https://${lead.referenceLinks}`} target="_blank" rel="noreferrer">Reference link</a></p>}</section>
    {lead.qualification && <section className="panel record-section"><div className="record-section-heading"><div><h2>Qualification notes</h2><p>Recorded {lead.qualification.discoveryCallAt ? new Date(lead.qualification.discoveryCallAt).toLocaleString() : ""}</p></div></div><div className="qualification-summary-grid"><div><small>Actual problem</small><p>{lead.qualification.actualProblem || "Not recorded"}</p></div><div><small>Desired outcome</small><p>{lead.qualification.desiredOutcome || "Not recorded"}</p></div><div><small>Budget / scope fit</small><p>{lead.qualification.budgetFit || "Not recorded"}</p></div><div><small>Good fit</small><p>{lead.qualification.goodFit || "Not recorded"}</p></div></div>{lead.qualification.callNotes && <p>{lead.qualification.callNotes}</p>}</section>}
  </div>;
  const workflowOpen = lead.status !== "LOST" && lead.status !== "DISQUALIFIED";
  const companySelectionLocked = Boolean(lead.operatingCompany && (lead.projectId || lead.invoice || (lead.proposals ?? []).some((proposal) => ["SENT", "ACCEPTED", "SUPERSEDED"].includes(proposal.status))));

  return <div className="page-content lead-workspace-page">
    <Link className="back-link" href="/requests"><ArrowLeft size={15} />Leads</Link>
    <header className="record-heading"><div><h1>{lead.companyName || lead.fullName}</h1></div><StatusBadge status={lead.status} /></header>

    {workflowOpen && <section className={`panel record-section operating-company-step ${lead.operatingCompany ? "is-selected" : "needs-selection"}`} id="workflow-company">
      <div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17} /></span><div><h2>Choose operating company</h2><p>Choose the studio responsible for this lead and its project.</p></div></div><span className="workflow-state">{companySelectionLocked ? "Company confirmed" : lead.operatingCompany ? "Selected" : "Required before project setup"}</span></div>
      <label className="field required">Operating company<select aria-label="Choose the operating company for this lead" required disabled={companySelectionLocked} value={lead.operatingCompany ?? ""} onChange={(event) => { const value = event.target.value; if (operatingCompanies.some((company) => company === value)) saveLead({ operatingCompany: value as OperatingCompany }); }}><option value="" disabled>Select Evecture or Servn</option>{operatingCompanies.map((company) => <option key={company} value={company}>{company}</option>)}</select>{companySelectionLocked && <small>The company is fixed once a proposal is sent, an invoice is created, or the lead becomes a project.</small>}</label>
    </section>}

    {lead.qualification && <section className="panel record-section"><div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17} /></span><div><h2>Qualification</h2><p>Discovery call recorded {lead.qualification.discoveryCallAt ? new Date(lead.qualification.discoveryCallAt).toLocaleString() : ""}</p></div></div><StatusBadge status={lead.status}>{lead.status === "DISQUALIFIED" ? "DISQUALIFIED" : "QUALIFICATION RECORDED"}</StatusBadge></div><div className="qualification-summary-grid"><div><small>Actual problem</small><p>{lead.qualification.actualProblem || "Not recorded"}</p></div><div><small>Desired outcome</small><p>{lead.qualification.desiredOutcome || "Not recorded"}</p></div><div><small>Budget / scope fit</small><p>{lead.qualification.budgetFit}</p></div><div><small>Good fit</small><p>{lead.qualification.goodFit}</p></div><div><small>Decision maker</small><p>{lead.qualification.decisionMaker || "Not recorded"}</p></div><div><small>Decision timeline</small><p>{lead.qualification.decisionTimeline || "Not recorded"}</p></div></div>{lead.qualification.callNotes && <div className="saved-call-notes"><small>Discovery call notes</small><p>{lead.qualification.callNotes}</p></div>}</section>}

    {lead.status === "ACCEPTED" && <section className="panel record-section acceptance-record"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Proposal accepted</h2><p>{lead.acceptedAt ? new Date(lead.acceptedAt).toLocaleString() : "Acceptance recorded"}</p></div></div></div><div className="detail-line"><b>Signatory</b>{lead.acceptanceName || "Not recorded"}</div>{lead.acceptanceDocumentName && <div className="detail-line"><b>Signed document</b>{lead.acceptanceDocumentDataUrl ? <a href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}>{lead.acceptanceDocumentName} <Download size={12} /></a> : lead.acceptanceDocumentName}</div>}</section>}

    {(lead.status === "QUALIFIED" || lead.status === "PROPOSAL_SENT" || lead.status === "ACCEPTED") && <section className="panel record-section proposal-section" id="workflow-proposal">
      <div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal & SOW</h2><p>Optionally attach an existing proposal or SOW.</p></div></div>{latest && <StatusBadge status={latest.status}>Version {latest.version} · {latest.status.replaceAll("_", " ")}</StatusBadge>}</div>
      <form className="proposal-form" onSubmit={saveProposalAttachment}>
        <label className="field document-upload">Upload proposal (optional)<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => { setProposalFile(null); void selectDocument(event.target.files?.[0], setProposalFile); }} /><small>{proposalFile?.name || "Attach an existing PDF or Word document, up to 1.2 MB. You can continue without uploading one."}</small></label>
        {(lead.qualification?.proposalAttachment || latest?.documentDataUrl) && <a className="button button-quiet" href={lead.qualification?.proposalAttachment?.dataUrl || latest?.documentDataUrl} download={lead.qualification?.proposalAttachment?.name || latest?.documentName}><Download size={14}/>Download attached proposal</a>}
        {proposalFile && <div className="form-actions"><button type="submit" className="button button-quiet" disabled={savingAttachment}>{savingAttachment ? "Saving…" : "Save attachment"}</button></div>}
      </form>

      {latest?.status === "SENT" && <div className="proposal-outcomes"><form className="acceptance-form" onSubmit={(event) => acceptProposal(event, latest)}><h3>Client accepts</h3><p>Record the authorized signatory to mark the proposal accepted. The signed SOW may be attached later.</p><label className="field">Name of signatory<input name="acceptanceName" required placeholder="Authorized signatory" /></label><label className="field document-upload">Attach signed SOW (optional)<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => void selectDocument(event.target.files?.[0], setAcceptanceFile)} /><small>{acceptanceFile?.name || "You can add the signed document later."}</small></label><button className="button button-primary" type="submit"><Check size={14} />Record acceptance</button></form>
        <div className="decline-form"><h3>Client declines</h3><p>Archive the lead with a reason.</p><label className="field">Decline reason<textarea rows={2} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="Reason provided, if any" /></label><button className="button button-quiet" disabled={!declineReason.trim()} onClick={() => markDeclined(latest)}>Mark lost · declined</button></div>
        <div className="silent-form"><h3>Client goes silent</h3><p>Archive the lead as no response if the client becomes unresponsive.</p><button className="button button-quiet" onClick={() => markNoResponse(latest)}>Mark lost · no response</button></div>
      </div>}

      {lead.status === "ACCEPTED" && latest && <div className="invoice-generator"><div className="invoice-generator-heading"><span className="section-icon"><FileText size={17} /></span><div><h2>{lead.invoice ? "Invoice generated" : "Proposal accepted"}</h2><p>{lead.invoice ? `${lead.invoice.invoiceNumber} · ${lead.invoice.status.replaceAll("_", " ")}` : "Create the client invoice from the accepted proposal."}</p></div></div><Link className="button button-primary" href={`/invoices?lead=${lead.id}`}>{lead.invoice ? "View invoice" : "Open invoice generator"} <ArrowRight size={14} /></Link></div>}

      {lead.invoice && <div className="invoice-block"><div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Invoice</h2><p>{lead.invoice.invoiceNumber} · {lead.invoice.status.replaceAll("_", " ")}{lead.invoice.sentAt ? ` · sent ${new Date(lead.invoice.sentAt).toLocaleString()}` : ""}</p></div></div><div className="invoice-actions"><Link className="button button-quiet" href={`/invoices?lead=${lead.id}`}>View / print invoice <ArrowRight size={13} /></Link>{lead.invoice.status === "GENERATED" && <button className="button button-primary" onClick={markInvoiceSent}><Send size={14} />Log invoice sent</button>}</div></div>
        <p className="payment-boundary">Print or save the invoice and send it through the studio billing workflow. Payment remains external.</p>
        {lead.invoice.status === "SENT" ? <form className="confirm-payment-form" onSubmit={confirmExternalPayment}><div><strong>Confirm external payment</strong><small>Only mark paid after finance confirms receipt outside this module.</small></div><input name="transactionReference" required placeholder="Bank / accounting transaction reference" /><button className="button button-quiet" type="submit">Confirm paid externally</button></form> : lead.invoice.status === "GENERATED" ? <p className="payment-boundary">Log the invoice as sent before confirming external payment.</p> : <div className="payment-confirmed"><Check size={15} /><span>Confirmed paid {lead.invoice.confirmedPaidAt ? new Date(lead.invoice.confirmedPaidAt).toLocaleString() : ""}</span>{lead.invoice.transactionReference && <small>Reference: {lead.invoice.transactionReference}</small>}</div>}
      </div>}
    </section>}

    {lead.status === "CONVERTED" && lead.projectId && <section className="panel record-section project-gate-complete"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Project workspace created</h2><p>Accepted proposal details and any available commercial records are linked to the active project.</p></div></div></div><Link className="button button-primary" href={`/projects/${lead.projectId}`}>Open project workspace <ArrowRight size={14} /></Link></section>}

    {(["QUALIFIED", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status)) && !lead.projectId && <section className="panel record-section project-create-section"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Move to Projects</h2><p>{lead.status === "ACCEPTED" ? "Set the project owner and setup details to create its workspace." : "Create a project workspace. A proposal upload is optional."} Deposit and SOW tracking can be completed separately.</p></div></div></div>
      <div className="commercial-proof"><span className={lead.acceptanceDocumentDataUrl ? "" : "commercial-proof-pending"}>{lead.acceptanceDocumentDataUrl ? <Check size={13} /> : <Clock3 size={13} />}Signed SOW · {lead.acceptanceDocumentDataUrl ? lead.acceptanceDocumentName : "not attached"}</span><span className={lead.invoice?.status === "CONFIRMED_PAID" ? "" : "commercial-proof-pending"}>{lead.invoice?.status === "CONFIRMED_PAID" ? <Check size={13} /> : <Clock3 size={13} />}Deposit · {lead.invoice ? lead.invoice.status.replaceAll("_", " ") : "not recorded"}</span></div>
      <form className="project-create-form" onSubmit={createProjectFromLead}>
        <div className="proposal-fields-grid"><label className="field required">Project title<input name="projectTitle" required defaultValue={lead.services.length > 0 ? lead.services.join(", ") : `${lead.companyName || lead.fullName} Delivery`} /></label><label className="field required">Project classification<select name="classification" required defaultValue={lead.acquisitionSource === "Referral" ? "Referral" : lead.acquisitionSource === "Repeat client" ? "Repeat Client" : "New Client"}><option>New Client</option><option>Repeat Client</option><option>Referral</option></select></label><label className="field required">Project start date<CalendarPicker name="startDate" required /></label></div>
        {!projectProposal && <div className="proposal-fields-grid"><label className="field required">Contract amount<input name="contractedValue" type="number" min="0" step="0.01" required placeholder="0.00" /></label><label className="field">Currency<select name="currency" defaultValue="USD">{["USD","INR","EUR","GBP","AED","AUD","CAD"].map(currency=><option key={currency}>{currency}</option>)}</select></label><label className="field">Billing structure<select name="billingStructure" defaultValue="Fixed"><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label></div>}
        <div className="project-team-setup">
          <div>
            <h3>Initial team assignment</h3>
            <p>Select assigned employees from the workspace directory and specify allocation percentage; blank roles can be assigned later.</p>
          </div>
          <div className="project-team-grid">
            {([
              ["Project Manager", "projectManager", true],
              ["Lead Designer", "leadDesigner", false],
              ["Lead Developer", "leadDeveloper", false],
              ["QA Owner", "qaOwner", false],
              ["Supporting team member", "supportingMember", false]
            ] as const).map(([role, key, required]) => (
              <div className="project-team-row" key={key}>
                <label className="field">
                  {role}
                  <select
                    name={key}
                    required={required}
                    defaultValue=""
                    className="assignee-select"
                  >
                    <option value="">{required ? "Select Project Manager..." : "Unassigned"}</option>
                    {assignableUsers.map((person) => (
                      <option key={person.name} value={person.name}>
                        {person.name} {person.role ? `· ${person.role}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Allocation %
                  <input
                    name={`${key}Allocation`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    required={required}
                    defaultValue={required ? 100 : ""}
                    placeholder="%"
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
        <div className="project-template-note"><span><Check size={13} /></span><p>Proposal scope, exclusions, assumptions, revision rounds, billing structure, and payment terms carry over. Any SOW or invoice records already captured will be linked. The assigned Project Manager is recorded on the project team.</p></div>
        <div className="form-actions"><button className="button button-primary" type="submit">Move to Projects <ArrowRight size={14} /></button></div>
      </form>
    </section>}

    {lead.proposals && lead.proposals.length > 0 && <section className="panel record-section proposal-history"><div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal versions</h2><p>Version history remains attached to this lead record.</p></div></div>{lead.proposals.some((proposal) => proposal.status === "ACCEPTED") && <Link className="button button-quiet" href={`/invoices?lead=${lead.id}`}><Receipt size={14} />Invoice generator</Link>}</div>{[...lead.proposals].sort((a, b) => b.version - a.version).map((proposal) => <details className="proposal-history-item" key={proposal.version}><summary><strong>Proposal v{proposal.version}</strong><StatusBadge status={proposal.status}/><span>{money(proposal.quotedAmount, proposal.currency)}</span><span>Expires {proposal.expiryDate}</span></summary><div className="proposal-history-content"><p><b>Included:</b> {proposal.scopeIncluded}</p><p><b>Excluded:</b> {proposal.scopeExcluded || "None specified"}</p><p><b>Deliverables:</b> {proposal.deliverables}</p><p>{proposal.revisionRounds ? <><b>Revisions:</b> {proposal.revisionRounds} rounds · </> : null}<b>Deposit:</b> {proposal.depositPercent}%</p><p><b>Assumptions:</b> {proposal.assumptions || "None specified"}</p>{proposal.documentDataUrl && <a href={proposal.documentDataUrl} download={proposal.documentName}><Download size={13} />Download {proposal.documentName}</a>}</div></details>)}</section>}

    {lead.status === "LOST" && <section className="panel record-section lost-panel"><h2>Lead archived</h2><p>{lead.disqualificationReason || "Lost reason not recorded"}</p><small>This lead is retained in the pipeline history and is not deleted.</small></section>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
