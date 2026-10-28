"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, Download, FileText, Receipt, Send, ShieldCheck } from "lucide-react";
import { type Lead, type LeadInvoice, type ProposalVersion, readLeads, updateLead } from "@/lib/leads";
import { addProject, projectFromLead, updateProject, type ProjectClassification, type ProjectTeamMember } from "@/lib/projects";
import { updateInvoice } from "@/lib/invoices";
import { StatusBadge } from "@/app/_components/status-badge";
import { useAssignableUsers } from "@/lib/assignees";

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

const proposalTemplateDefaults = {
  executiveSummary: "This proposal outlines the recommended solution, delivery approach, investment, and expected outcomes for the client’s project.",
  challenge: "The current workflow creates avoidable manual effort, limited visibility, and unnecessary delivery risk. This project will replace those gaps with a clear, reliable, and measurable process.",
  approach: "We will deliver the solution in focused phases: discovery and alignment, build, review and validation, then launch and handoff. Decisions will be visible and scope will be controlled throughout delivery.",
  paymentTerms: "Invoices are payable within 14 days. Any additional work outside the agreed scope will be estimated and approved before work begins.",
  approvalProcess: "Milestones, scope decisions, and final acceptance will be confirmed in writing by the client contact and project lead.",
  clientRequirements: "The client will provide timely access to stakeholders, content, credentials, feedback, approvals, and any systems required to complete the work.",
  assumptions: "The proposal assumes timely client feedback and access to the agreed stakeholders. Work outside the included scope will be discussed and approved separately.",
  background: "The project is intended to improve the client’s current workflow with a purpose-built software solution. The final requirements and implementation priorities will be confirmed during discovery.",
  objectives: "• Deliver a reliable solution aligned with the client’s operational goals.\n• Improve visibility, consistency, and efficiency in the target workflow.\n• Validate the solution with stakeholder review before launch.\n• Provide documentation, training, and a clear handoff for continued use.",
  softwareProcessModel: "An iterative phased delivery model is recommended. Discovery confirms the requirements, build delivers the highest-value functionality, review validates the solution with stakeholders, and launch follows only after agreed acceptance criteria are met.",
  processActivities: "Discovery — confirm requirements, users, workflows, risks, and acceptance criteria.\nBuild — implement the agreed functionality in reviewable increments.\nValidation — test core workflows, edge cases, permissions, responsive behaviour, and integrations.\nLaunch and handoff — deploy the approved release, provide documentation and training, and monitor the first period of use.\nQuality assurance — use code review, acceptance criteria, regression testing, stakeholder review, and a documented issue log.",
  budgetBreakdown: "The final investment is based on the agreed scope, delivery timeline, team allocation, software and infrastructure requirements, testing, and handoff. Any third-party or ongoing service costs will be identified separately before approval.",
  systemArchitecture: "The solution architecture will be selected around the project’s users, data, security, and deployment needs. The proposal will document the application layers, data storage, integrations, hosting environment, access controls, and operational dependencies before build begins.",
  riskAssessment: "Scope risk — control changes through written estimates and approval.\nDelivery risk — use milestones, reviews, and visible issue tracking.\nAdoption risk — include representative users in discovery and validation.\nSecurity risk — apply authenticated access, least-privilege permissions, protected data handling, and environment separation.\nSchedule risk — prioritise the agreed MVP and make dependencies visible early.",
  resources: "The project will require a project lead, engineering and design capacity appropriate to the agreed scope, client subject-matter experts, review stakeholders, required software accounts, hosting or infrastructure access, and timely client participation.",
  technicalSpecifications: "Technical specifications will cover data sources, data structures, transformations, integrations, programming languages, frameworks, libraries, hosting, hardware and software requirements, testing, monitoring, and security controls. The final specification will be confirmed during discovery.",
  timelineDeliverables: "Discovery — requirements, workflow map, technical direction, and acceptance criteria.\nBuild — working software increments for stakeholder review.\nValidation — tested release, issue log, and acceptance record.\nLaunch — production deployment, documentation, training, and handoff.\nThe final dates and owners will be confirmed after scope and availability are approved.",
  conclusion: "This proposal provides a practical path from the current workflow to a more reliable and measurable solution. Approval allows the team to confirm the remaining project details, reserve delivery capacity, and begin discovery.",
  aboutUs: "We are a focused software studio that builds practical digital products and internal tools for teams with real operational needs. Our work emphasises clear communication, thoughtful implementation, and dependable handoff.",
  howWeWork: "One project lead stays accountable from discovery through launch. We use short delivery cycles, regular demonstrations, written decisions, structured reviews, and direct communication with the people who will use the system.",
  paymentSchedule: "The payment schedule will follow agreed milestones. Each invoice will identify the milestone completed, the amount due, and any approved additional work.",
  changeRequestPolicy: "Changes after scope approval are documented, estimated, and reviewed for their effect on cost and timeline. Work begins only after the client provides written approval.",
  intellectualProperty: "Ownership and handoff of source code, designs, documentation, data, and infrastructure will follow the commercial agreement and will be made explicit before launch.",
  warrantySupport: "The agreed warranty covers defects in the delivered scope during the stated warranty period. New features, scope changes, and ongoing support can be handled through a separate support arrangement.",
  cancellationPolicy: "Either party may cancel with written notice under the agreed terms. The client remains responsible for completed work and committed third-party costs.",
};

export default function LeadWorkspacePage() {
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const leadId = params.leadId;
  const { users: assignableUsers } = useAssignableUsers();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proposalFile, setProposalFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [acceptanceFile, setAcceptanceFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [revisionMode, setRevisionMode] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
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
    const data = new FormData(event.currentTarget);
    const quotedAmount = Number(data.get("quotedAmount"));
    const depositPercent = Number(data.get("depositPercent"));
    const expiryDate = String(data.get("expiryDate") || "");
    if (!Number.isFinite(quotedAmount) || quotedAmount <= 0 || !Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100 || !expiryDate) {
      setError("Enter a contract amount, a deposit percentage from 0 to 100, and a proposal expiry date.");
      return;
    }
    const finalFollowUpDate = String(data.get("finalFollowUpDate") || (expiryDate ? new Date(new Date(`${expiryDate}T09:00:00`).getTime() + 7 * 86400000).toISOString().slice(0, 10) : ""));
    const previous = lead.proposals ?? [];
    const previousLatest = [...previous].sort((a, b) => b.version - a.version)[0];
    const version = Math.max(0, ...previous.map((item) => item.version)) + 1;
    const expiry = new Date(`${expiryDate}T09:00:00`).toISOString();
    const plusThree = new Date(new Date(expiry).getTime() + 3 * 86400000).toISOString();
    const proposal: ProposalVersion = {
      version,
      status: send ? "SENT" : "DRAFT",
      createdAt: new Date().toISOString(),
      sentAt: send ? new Date().toISOString() : undefined,
      shareToken: send ? crypto.randomUUID() : undefined,
      proposalTitle: String(data.get("proposalTitle") || "").trim(),
      projectTitle: String(data.get("projectTitle") || "").trim(),
      preparedBy: String(data.get("preparedBy") || "").trim(),
      executiveSummary: String(data.get("executiveSummary") || "").trim(),
      challenge: String(data.get("challenge") || "").trim(),
      approach: String(data.get("approach") || "").trim(),
      background: String(data.get("background") || "").trim(),
      objectives: String(data.get("objectives") || "").trim(),
      timeline: String(data.get("timeline") || "").trim(),
      softwareProcessModel: String(data.get("softwareProcessModel") || "").trim(),
      processActivities: String(data.get("processActivities") || "").trim(),
      budgetBreakdown: String(data.get("budgetBreakdown") || "").trim(),
      systemArchitecture: String(data.get("systemArchitecture") || "").trim(),
      riskAssessment: String(data.get("riskAssessment") || "").trim(),
      resources: String(data.get("resources") || "").trim(),
      technicalSpecifications: String(data.get("technicalSpecifications") || "").trim(),
      timelineDeliverables: String(data.get("timelineDeliverables") || "").trim(),
      conclusion: String(data.get("conclusion") || "").trim(),
      aboutUs: String(data.get("aboutUs") || "").trim(),
      howWeWork: String(data.get("howWeWork") || "").trim(),
      recentWork: String(data.get("recentWork") || "").trim(),
      testimonial: String(data.get("testimonial") || "").trim(),
      paymentSchedule: String(data.get("paymentSchedule") || "").trim(),
      changeRequestPolicy: String(data.get("changeRequestPolicy") || "").trim(),
      intellectualProperty: String(data.get("intellectualProperty") || "").trim(),
      warrantySupport: String(data.get("warrantySupport") || "").trim(),
      cancellationPolicy: String(data.get("cancellationPolicy") || "").trim(),
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
      documentName: proposalFile?.name || previousLatest?.documentName || "Online proposal",
      documentDataUrl: proposalFile?.dataUrl || previousLatest?.documentDataUrl,
      followUps: [
        { label: "Expiry day", dueAt: expiry },
        { label: "3 days after expiry", dueAt: plusThree },
        { label: "Final nudge", dueAt: new Date(`${finalFollowUpDate}T09:00:00`).toISOString() },
      ],
    };
    const versions = previous.map((item) => item.status === "SENT" ? { ...item, status: "SUPERSEDED" as const } : item);
    saveLead({ proposals: [...versions, proposal], status: send ? "PROPOSAL_SENT" : "QUALIFIED" });
    setProposalFile(null);
    setLinkCopied(false);
    setRevisionMode(false);
    setError("");
  }

  async function copyProposalLink(token: string) {
    const url = [window.location.origin, "proposal", token].join("/");
    await navigator.clipboard?.writeText(url);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2200);
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

  function createProjectFromLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || lead.status !== "ACCEPTED" || lead.projectId) {
      setError("Only an accepted lead can be moved into Projects.");
      return;
    }
    if (!lead.operatingCompany) {
      setError("Choose Evecture or Servn in First contact before moving this project into Projects.");
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
        operatingCompany: lead.operatingCompany,
        startDate: String(data.get("startDate") || ""),
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
  if (!lead) return <div className="page-content"><div className="panel pipeline-empty"><h2>Lead record not found</h2><p>It may have been removed from this browser or created in another workspace.</p><Link className="button button-quiet" href="/requests"><ArrowLeft size={14} />Back to pipeline</Link></div></div>;

  const latest = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version)[0];

  return <div className="page-content lead-workspace-page">
    <Link className="back-link" href="/requests"><ArrowLeft size={15} />Leads</Link>
    <header className="record-heading"><div><h1>{lead.companyName || lead.fullName}</h1></div><StatusBadge status={lead.status} /></header>

    {lead.qualification && <section className="panel record-section"><div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17} /></span><div><h2>Qualification</h2><p>Discovery call recorded {lead.qualification.discoveryCallAt ? new Date(lead.qualification.discoveryCallAt).toLocaleString() : ""}</p></div></div><StatusBadge status={lead.status}>{lead.status === "DISQUALIFIED" ? "DISQUALIFIED" : "QUALIFICATION RECORDED"}</StatusBadge></div><div className="qualification-summary-grid"><div><small>Actual problem</small><p>{lead.qualification.actualProblem || "Not recorded"}</p></div><div><small>Desired outcome</small><p>{lead.qualification.desiredOutcome || "Not recorded"}</p></div><div><small>Budget / scope fit</small><p>{lead.qualification.budgetFit}</p></div><div><small>Good fit</small><p>{lead.qualification.goodFit}</p></div><div><small>Decision maker</small><p>{lead.qualification.decisionMaker || "Not recorded"}</p></div><div><small>Decision timeline</small><p>{lead.qualification.decisionTimeline || "Not recorded"}</p></div></div>{lead.qualification.callNotes && <div className="saved-call-notes"><small>Discovery call notes</small><p>{lead.qualification.callNotes}</p></div>}</section>}

    {lead.status === "ACCEPTED" && <section className="panel record-section acceptance-record"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Proposal accepted</h2><p>{lead.acceptedAt ? new Date(lead.acceptedAt).toLocaleString() : "Acceptance recorded"}</p></div></div></div><div className="detail-line"><b>Signatory</b>{lead.acceptanceName || "Not recorded"}</div>{lead.acceptanceDocumentName && <div className="detail-line"><b>Signed document</b>{lead.acceptanceDocumentDataUrl ? <a href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}>{lead.acceptanceDocumentName} <Download size={12} /></a> : lead.acceptanceDocumentName}</div>}</section>}

    {(lead.status === "QUALIFIED" || lead.status === "PROPOSAL_SENT" || lead.status === "ACCEPTED") && <section className="panel record-section proposal-section">
      <div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal & SOW</h2><p>Prepare a versioned scope, record the quote, and track client response.</p></div></div>{latest && <span className={`proposal-version-status version-${latest.status.toLowerCase()}`}>Version {latest.version} · {latest.status}</span>}</div>
      {latest?.status === "SENT" && !revisionMode && <div className="sent-proposal-meta"><div><strong>Proposal v{latest.version}</strong><span>{latest.documentName} · Sent {latest.sentAt ? new Date(latest.sentAt).toLocaleString() : ""}</span><span>Quoted {money(latest.quotedAmount, latest.currency)} · Expires {latest.expiryDate}</span><div className="proposal-delivery-actions">{latest.shareToken && <><Link href={"/proposal/" + latest.shareToken} target="_blank" rel="noreferrer"><ArrowRight size={13} />Open client proposal</Link><button type="button" onClick={() => void copyProposalLink(latest.shareToken!)}>{linkCopied ? "Link copied" : "Copy client link"}</button><a href={"mailto:" + lead.email + "?subject=" + encodeURIComponent(latest.proposalTitle || "Your proposal") + "&body=" + encodeURIComponent("Hello " + lead.fullName + ",\n\nPlease review your proposal here:\n/proposal/" + latest.shareToken + "\n\nBest,\nEVECTURE")}>Email client</a></>}{latest.documentDataUrl && <a href={latest.documentDataUrl} download={latest.documentName}><Download size={13} />Download PDF / SOW</a>}</div></div><button className="button button-quiet" onClick={() => { setRevisionMode(true); setProposalFile(null); }}>Revise proposal</button></div>}
      {(lead.status === "QUALIFIED" || latest?.status === "CHANGES_REQUESTED") && !revisionMode && latest?.status !== "SENT" && <button className="button button-primary proposal-start" onClick={() => { setRevisionMode(true); setProposalFile(null); }}>Prepare proposal <ArrowRight size={14} /></button>}
      {revisionMode && <form className="proposal-form" onSubmit={(event) => submitProposal(event, true)}>
        <div className="proposal-fields-grid">
          <label className="field required">Proposal title<input name="proposalTitle" required defaultValue={latest?.proposalTitle || ("Proposal for " + (lead.companyName || lead.fullName))} placeholder="Website design proposal" /></label>
          <label className="field required">Project title<input name="projectTitle" required defaultValue={latest?.projectTitle || latest?.proposalTitle || (lead.companyName || lead.fullName)} placeholder="Client portal system" /></label>
          <label className="field">Prepared by<textarea name="preparedBy" rows={2} defaultValue={latest?.preparedBy || ""} placeholder="Name and matrix no (one per line)" /></label>
          <label className="field required">Quoted amount<input name="quotedAmount" type="number" min="0.01" step="0.01" required placeholder="0.00" defaultValue={latest?.quotedAmount || ""} /></label>
          <label className="field required">Currency<select name="currency" required defaultValue={latest?.currency || ""}><option value="" disabled>Select currency</option>{["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label className="field required">Proposal expiry date<input name="expiryDate" type="date" required defaultValue={latest?.expiryDate || ""} /></label>
          <label className="field required">Deposit percentage<input name="depositPercent" type="number" min="0" max="100" step="1" required defaultValue={latest?.depositPercent ?? 20} /></label>
          <label className="field required">Billing structure<select name="billingStructure" required defaultValue={latest?.billingStructure || "Fixed"}><option value="" disabled>Select structure</option><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label>
        </div>
        <div className="proposal-fields-grid proposal-copy-fields">
          <label className="field required">Executive summary<textarea name="executiveSummary" rows={3} required defaultValue={latest?.executiveSummary || proposalTemplateDefaults.executiveSummary} placeholder="Summarise the client need, recommended solution, and expected outcome" /></label>
          <label className="field">The challenge<textarea name="challenge" rows={3} defaultValue={latest?.challenge || proposalTemplateDefaults.challenge} placeholder="Describe the current workflow, pain points, and cost of leaving the problem unsolved." /></label>
          <label className="field">Our approach<textarea name="approach" rows={3} defaultValue={latest?.approach || proposalTemplateDefaults.approach} placeholder="Explain how your team will solve the problem and why this approach is the right fit." /></label>
          <label className="field required">Included scope<textarea name="scopeIncluded" rows={3} required defaultValue={latest?.scopeIncluded || ""} placeholder="Precisely what is included" /></label>
          <label className="field">Excluded scope<textarea name="scopeExcluded" rows={3} defaultValue={latest?.scopeExcluded || ""} placeholder="What is outside this proposal" /></label>
          <label className="field required">Deliverables<textarea name="deliverables" rows={3} required defaultValue={latest?.deliverables || ""} placeholder="List each specific output" /></label>
          <label className="field">Payment terms<textarea name="paymentTerms" rows={3} defaultValue={latest?.paymentTerms || proposalTemplateDefaults.paymentTerms} placeholder="Deposit and payment conditions" /></label>
          <label className="field">Approval process<textarea name="approvalProcess" rows={3} defaultValue={latest?.approvalProcess || proposalTemplateDefaults.approvalProcess} placeholder="How client sign-offs are recorded" /></label>
          <label className="field">Client requirements<textarea name="clientRequirements" rows={3} defaultValue={latest?.clientRequirements || proposalTemplateDefaults.clientRequirements} placeholder="Assets, access, and timely feedback needed" /></label>
          <label className="field required">Timeline<textarea name="timeline" rows={3} required defaultValue={latest?.timeline || ""} placeholder="Phases, milestones, and estimated delivery dates" /></label>
          <label className="field">Assumptions & exclusions<textarea name="assumptions" rows={3} defaultValue={latest?.assumptions || proposalTemplateDefaults.assumptions} placeholder="For example, copywriting is not included" /></label>
        </div>
        <div className="proposal-template-heading"><div><h3>Proposal template sections</h3><p>Complete the sections below to build the full client-facing software proposal.</p></div><span>Table of contents is generated automatically</span></div>
        <div className="proposal-fields-grid proposal-template-fields">
          <label className="field required">2. Background<textarea name="background" rows={5} required defaultValue={latest?.background || proposalTemplateDefaults.background} placeholder="Introduce the software project, the problem it solves, its benefits, and potential impact." /></label>
          <label className="field required">3. Objectives<textarea name="objectives" rows={5} required defaultValue={latest?.objectives || proposalTemplateDefaults.objectives} placeholder="List specific, measurable, achievable, relevant, and time-bound objectives." /></label>
          <label className="field required">5. Software process model<textarea name="softwareProcessModel" rows={5} required defaultValue={latest?.softwareProcessModel || proposalTemplateDefaults.softwareProcessModel} placeholder="Explain the goal of the process model, your chosen model, and why it is ideal for this project." /></label>
          <label className="field required">5a. Process activities and quality assurance<textarea name="processActivities" rows={5} required defaultValue={latest?.processActivities || proposalTemplateDefaults.processActivities} placeholder="Describe every phase, activities, duration, owner, deliverables, testing methods, project management, and QA practices." /></label>
          <label className="field required">6. Budget breakdown<textarea name="budgetBreakdown" rows={5} required defaultValue={latest?.budgetBreakdown || proposalTemplateDefaults.budgetBreakdown} placeholder="Break down hardware, software, personnel, testing, contingency, and other costs." /></label>
          <label className="field required">7. System architecture<textarea name="systemArchitecture" rows={5} required defaultValue={latest?.systemArchitecture || proposalTemplateDefaults.systemArchitecture} placeholder="Describe the architecture, tools, technologies, data storage, deployment, and include a diagram or flow description if needed." /></label>
          <label className="field required">8. Risk assessment<textarea name="riskAssessment" rows={5} required defaultValue={latest?.riskAssessment || proposalTemplateDefaults.riskAssessment} placeholder="Identify technical, resource, scope, schedule, and security risks with mitigation plans." /></label>
          <label className="field required">9. Resources<textarea name="resources" rows={5} required defaultValue={latest?.resources || proposalTemplateDefaults.resources} placeholder="List required staff, equipment, software, services, and other project resources." /></label>
          <label className="field required">10. Technical specifications<textarea name="technicalSpecifications" rows={5} required defaultValue={latest?.technicalSpecifications || proposalTemplateDefaults.technicalSpecifications} placeholder="Describe data sources, schema, transformations, algorithms, frameworks, libraries, hardware, security, and visualization tools." /></label>
          <label className="field required">11. Timeline and deliverables<textarea name="timelineDeliverables" rows={5} required defaultValue={latest?.timelineDeliverables || proposalTemplateDefaults.timelineDeliverables} placeholder="List milestones, deadlines, deliverables, durations, assigned resources, testing, and quality checks." /></label>
          <label className="field required">12. Conclusion<textarea name="conclusion" rows={5} required defaultValue={latest?.conclusion || proposalTemplateDefaults.conclusion} placeholder="Summarise the solution, benefits, limitations, and the action you want the client to take." /></label>
        </div>
        <div className="proposal-template-heading"><div><h3>Trust and commercial details</h3><p>Optional sections inspired by a full client-ready proposal document.</p></div><span>Use these to add context and confidence</span></div>
        <div className="proposal-fields-grid proposal-template-fields">
          <label className="field">About us<textarea name="aboutUs" rows={4} defaultValue={latest?.aboutUs || proposalTemplateDefaults.aboutUs} placeholder="Introduce your studio, relevant experience, and the type of work you specialise in." /></label>
          <label className="field">How we work<textarea name="howWeWork" rows={4} defaultValue={latest?.howWeWork || proposalTemplateDefaults.howWeWork} placeholder="Explain team ownership, communication, reviews, demos, and handover." /></label>
          <label className="field">Recent work<textarea name="recentWork" rows={4} defaultValue={latest?.recentWork || ""} placeholder="Add relevant case studies or proof points, one project per line." /></label>
          <label className="field">Client testimonial<textarea name="testimonial" rows={4} defaultValue={latest?.testimonial || ""} placeholder="Add a short client quote and attribution if relevant." /></label>
          <label className="field">Payment schedule<textarea name="paymentSchedule" rows={4} defaultValue={latest?.paymentSchedule || proposalTemplateDefaults.paymentSchedule} placeholder="List milestone payments and when each payment is due." /></label>
          <label className="field">Change request policy<textarea name="changeRequestPolicy" rows={4} defaultValue={latest?.changeRequestPolicy || proposalTemplateDefaults.changeRequestPolicy} placeholder="Explain how changes affect scope, cost, and timeline." /></label>
          <label className="field">Intellectual property<textarea name="intellectualProperty" rows={4} defaultValue={latest?.intellectualProperty || proposalTemplateDefaults.intellectualProperty} placeholder="Explain ownership and handover of source code, designs, data, and documentation." /></label>
          <label className="field">Warranty and post-launch support<textarea name="warrantySupport" rows={4} defaultValue={latest?.warrantySupport || proposalTemplateDefaults.warrantySupport} placeholder="Define the warranty period, bug-fix coverage, and ongoing support options." /></label>
          <label className="field">Cancellation policy<textarea name="cancellationPolicy" rows={4} defaultValue={latest?.cancellationPolicy || proposalTemplateDefaults.cancellationPolicy} placeholder="Explain notice, completed work, committed costs, and cancellation terms." /></label>
        </div>
        <label className="field document-upload">Optional PDF / SOW attachment<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => void selectDocument(event.target.files?.[0], setProposalFile)} /><small>{proposalFile ? `Attached: ${proposalFile.name}` : latest?.documentName ? `Keep previous attachment: ${latest.documentName}` : "The online proposal is sent without an attachment. Add a PDF or Word file if needed."}</small></label>
        <div className="form-actions"><button type="button" className="button button-quiet" onClick={() => setRevisionMode(false)}>Cancel</button><button type="submit" className="button button-primary"><Send size={14} />{latest?.status === "SENT" ? "Save & send revised version" : "Save & mark proposal sent"}</button></div>
      </form>}

      {latest?.status === "SENT" && !revisionMode && <div className="proposal-outcomes"><form className="acceptance-form" onSubmit={(event) => acceptProposal(event, latest)}><h3>Client accepts</h3><p>Record the authorized signatory to mark the proposal accepted. The signed SOW may be attached later.</p><label className="field">Name of signatory<input name="acceptanceName" required placeholder="Authorized signatory" /></label><label className="field document-upload">Attach signed SOW (optional)<input type="file" accept=".pdf,.doc,.docx" onChange={(event) => void selectDocument(event.target.files?.[0], setAcceptanceFile)} /><small>{acceptanceFile?.name || "You can add the signed document later."}</small></label><button className="button button-primary" type="submit"><Check size={14} />Record acceptance</button></form>
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

    {lead.status === "ACCEPTED" && !lead.projectId && latest && <section className="panel record-section project-create-section"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Move accepted project into Projects</h2><p>Set the project owner and setup details to create its workspace. Deposit and SOW tracking can be completed separately.</p></div></div></div>
      <div className="commercial-proof"><span className={lead.acceptanceDocumentDataUrl ? "" : "commercial-proof-pending"}>{lead.acceptanceDocumentDataUrl ? <Check size={13} /> : <Clock3 size={13} />}Signed SOW · {lead.acceptanceDocumentDataUrl ? lead.acceptanceDocumentName : "not attached"}</span><span className={lead.invoice?.status === "CONFIRMED_PAID" ? "" : "commercial-proof-pending"}>{lead.invoice?.status === "CONFIRMED_PAID" ? <Check size={13} /> : <Clock3 size={13} />}Deposit · {lead.invoice ? lead.invoice.status.replaceAll("_", " ") : "not recorded"}</span></div>
      <form className="project-create-form" onSubmit={createProjectFromLead}>
        <div className="proposal-fields-grid"><label className="field required">Project title<input name="projectTitle" required defaultValue={lead.services.length > 0 ? lead.services.join(", ") : `${lead.companyName || lead.fullName} Delivery`} /></label><label className="field required">Project classification<select name="classification" required defaultValue={lead.acquisitionSource === "Referral" ? "Referral" : lead.acquisitionSource === "Repeat client" ? "Repeat Client" : "New Client"}><option>New Client</option><option>Repeat Client</option><option>Referral</option></select></label><label className="field required">Project start date<input type="date" name="startDate" required /></label></div>
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

    {lead.proposals && lead.proposals.length > 0 && <section className="panel record-section proposal-history"><div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal versions</h2><p>Version history remains attached to this lead record.</p></div></div>{lead.proposals.some((proposal) => proposal.status === "ACCEPTED") && <Link className="button button-quiet" href={`/invoices?lead=${lead.id}`}><Receipt size={14} />Invoice generator</Link>}</div>{[...lead.proposals].sort((a, b) => b.version - a.version).map((proposal) => <details className="proposal-history-item" key={proposal.version}><summary><strong>Proposal v{proposal.version}</strong><span className={`proposal-version-status version-${proposal.status.toLowerCase()}`}>{proposal.status}</span><span>{money(proposal.quotedAmount, proposal.currency)}</span><span>Expires {proposal.expiryDate}</span></summary><div className="proposal-history-content"><p><b>Included:</b> {proposal.scopeIncluded}</p><p><b>Excluded:</b> {proposal.scopeExcluded || "None specified"}</p><p><b>Deliverables:</b> {proposal.deliverables}</p><p>{proposal.revisionRounds ? <><b>Revisions:</b> {proposal.revisionRounds} rounds · </> : null}<b>Deposit:</b> {proposal.depositPercent}%</p><p><b>Assumptions:</b> {proposal.assumptions || "None specified"}</p>{proposal.documentDataUrl && <a href={proposal.documentDataUrl} download={proposal.documentName}><Download size={13} />Download {proposal.documentName}</a>}</div></details>)}</section>}

    {lead.status === "LOST" && <section className="panel record-section lost-panel"><h2>Lead archived</h2><p>{lead.disqualificationReason || "Lost reason not recorded"}</p><small>This lead is retained in the pipeline history and is not deleted.</small></section>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
