"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Download, FileText, Receipt, Send, ShieldCheck } from "lucide-react";
import { type Lead, type ProposalVersion, updateLead } from "@/lib/leads";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { updateProject } from "@/lib/projects";
import { updateInvoice } from "@/lib/invoices";
import { ProposalGenerator } from "@/app/_components/proposal-generator";
import { StatusBadge } from "@/app/_components/status-badge";
import { operatingCompanies, type OperatingCompany } from "@/lib/companies";

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

export function ProposalWorkspace({ lead }: { lead: Lead }) {
  const [error,setError]=useState("");
  const [proposalFile,setProposalFile]=useState<{name:string;dataUrl:string}|null>(null);
  const [acceptanceFile,setAcceptanceFile]=useState<{name:string;dataUrl:string}|null>(null);
  const [savingAttachment,setSavingAttachment]=useState(false);
  const [declineReason,setDeclineReason]=useState("");
  const [sowFile,setSowFile]=useState<{name:string;dataUrl:string}|null>(null);
  const [savingSow,setSavingSow]=useState(false);
  const latest=[...(lead.proposals??[])].sort((a,b)=>b.version-a.version)[0];
  const workflowOpen=lead.status!=="LOST";
  const companySelectionLocked=Boolean(lead.operatingCompany&&(lead.projectId||lead.invoice||(lead.proposals??[]).some(p=>["SENT","ACCEPTED","SUPERSEDED"].includes(p.status))));
  function saveLead(updates: Partial<Lead>) {
    if (!lead) return;
    updateLead(lead.id, updates);
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

  async function saveSignedSow(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!sowFile||savingSow)return;
    setSavingSow(true);setError("");
    saveLead({acceptanceDocumentName:sowFile.name,acceptanceDocumentDataUrl:sowFile.dataUrl});
    if(lead.projectId)updateProject(lead.projectId,{signedContractName:sowFile.name,signedContractDataUrl:sowFile.dataUrl});
    try{await flushWorkspaceChanges();setSowFile(null);}
    catch(cause){setError(cause instanceof Error?cause.message:"The SOW could not be saved.");}
    finally{setSavingSow(false);}
  }

  return <div className="proposal-workspace">
    {workflowOpen && <section className={`panel record-section operating-company-step ${lead.operatingCompany ? "is-selected" : "needs-selection"}`} id="workflow-company">
      <div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17} /></span><div><h2>Choose operating company</h2><p>Choose the studio responsible for this lead and its project.</p></div></div><span className="workflow-state">{companySelectionLocked ? "Company confirmed" : lead.operatingCompany ? "Selected" : "Required before project setup"}</span></div>
      <label className="field required">Operating company<select aria-label="Choose the operating company for this lead" required disabled={companySelectionLocked} value={lead.operatingCompany ?? ""} onChange={(event) => { const value = event.target.value; if (operatingCompanies.some((company) => company === value)) saveLead({ operatingCompany: value as OperatingCompany }); }}><option value="" disabled>Select Evecture or Servn</option>{operatingCompanies.map((company) => <option key={company} value={company}>{company}</option>)}</select>{companySelectionLocked && <small>The company is fixed once a proposal is sent, an invoice is created, or the lead becomes a project.</small>}</label>
    </section>}


    {lead.status === "ACCEPTED" && <section className="panel record-section acceptance-record"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Proposal accepted</h2><p>{lead.acceptedAt ? new Date(lead.acceptedAt).toLocaleString() : "Acceptance recorded"}</p></div></div></div><div className="detail-line"><b>Signatory</b>{lead.acceptanceName || "Not recorded"}</div>{lead.acceptanceDocumentName && <div className="detail-line"><b>Signed document</b>{lead.acceptanceDocumentDataUrl ? <a href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}>{lead.acceptanceDocumentName} <Download size={12} /></a> : lead.acceptanceDocumentName}</div>}</section>}

    <section className="panel record-section proposal-section" id="workflow-proposal">
      <div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal & SOW</h2><p>Generate a proposal or attach an existing document.</p></div></div>{latest && <StatusBadge status={latest.status}>Version {latest.version} · {latest.status.replaceAll("_", " ")}</StatusBadge>}</div>
      <ProposalGenerator key={lead.id} lead={lead} />
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
    </section>

    <section className="panel record-section"><h2>Signed SOW</h2>
      {lead.acceptanceDocumentDataUrl&&<a className="button button-quiet" href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}><Download size={14}/>Download signed SOW</a>}
      <form aria-label="Signed SOW document" onSubmit={saveSignedSow}><label className="field">Signed SOW document<input type="file" accept=".pdf,.doc,.docx" onChange={event=>{setSowFile(null);void selectDocument(event.target.files?.[0],setSowFile);}}/><small>{sowFile?.name||"Attach a signed PDF or Word document, up to 1.2 MB."}</small></label>{sowFile&&<button className="button button-quiet" disabled={savingSow}>{savingSow?"Saving…":"Save signed SOW"}</button>}</form>
    </section>

    {lead.proposals && lead.proposals.length > 0 && <section className="panel record-section proposal-history"><div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal versions</h2><p>Version history remains attached to this lead record.</p></div></div>{lead.proposals.some((proposal) => proposal.status === "ACCEPTED") && <Link className="button button-quiet" href={`/invoices?lead=${lead.id}`}><Receipt size={14} />Invoice generator</Link>}</div>{[...lead.proposals].sort((a, b) => b.version - a.version).map((proposal) => <details className="proposal-history-item" key={proposal.version}><summary><strong>Proposal v{proposal.version}</strong><StatusBadge status={proposal.status}/><span>{money(proposal.quotedAmount, proposal.currency)}</span><span>Expires {proposal.expiryDate}</span></summary><div className="proposal-history-content"><p><b>Included:</b> {proposal.scopeIncluded}</p><p><b>Excluded:</b> {proposal.scopeExcluded || "None specified"}</p><p><b>Deliverables:</b> {proposal.deliverables}</p><p>{proposal.revisionRounds ? <><b>Revisions:</b> {proposal.revisionRounds} rounds · </> : null}<b>Deposit:</b> {proposal.depositPercent}%</p><p><b>Assumptions:</b> {proposal.assumptions || "None specified"}</p>{proposal.documentDataUrl && <a href={proposal.documentDataUrl} download={proposal.documentName}><Download size={13} />Download {proposal.documentName}</a>}</div></details>)}</section>}

    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
