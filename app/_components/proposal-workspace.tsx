"use client";
import {compressImage,readFileDataUrl} from "@/lib/image-compression";
import {OperatingOrganizationField} from "@/app/_components/operating-organization-field";
import { useState, type FormEvent } from "react";
import { Check, Download, FileText, ShieldCheck } from "lucide-react";
import { type Lead, type ProposalVersion, updateLead } from "@/lib/leads";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { updateProject } from "@/lib/projects";
import { ProposalGenerator } from "@/app/_components/proposal-generator";
import { StatusBadge } from "@/app/_components/status-badge";

const MAX_DOCUMENT_BYTES = 1_200_000;

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
  function saveLead(updates: Partial<Lead>) {
    if (!lead) return;
    updateLead(lead.id, updates);
  }

  async function selectDocument(file: File | undefined, setter: (value: { name: string; dataUrl: string } | null) => void) {
    if (!file) return;
    if (!file.type.startsWith("image/") && file.size > MAX_DOCUMENT_BYTES) {
      setError("Attachments must be under 1.2 MB.");
      return;
    }
    try {
      if(file.type.startsWith("image/")){const image=await compressImage(file);setter({name:image.name,dataUrl:image.dataUrl});}
      else setter({ name: file.name, dataUrl: await readFileDataUrl(file) });
      setError("");
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Could not read the selected document.");
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
    const proposals = (lead.proposals ?? []).map((item) => item.version === proposal.version ? { ...item, status: "ACCEPTED" as const, responseName: String(data.get("acceptanceName") || "").trim(), respondedAt: new Date().toISOString() } : item);
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
      <div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17} /></span><div><h2>{lead.operatingCompany?"Operating organization":"Choose operating organization"}</h2><p>The studio responsible for this lead and its project.</p></div></div><span className="workflow-state">{lead.operatingCompany ? "Organization confirmed" : "Required before project setup"}</span></div>
      <OperatingOrganizationField value={lead.operatingCompany} selectLabel="Choose the operating organization for this lead" required onChange={organization=>saveLead({operatingCompany:organization})}/>
    </section>}


    {lead.status === "ACCEPTED" && <section className="panel record-section acceptance-record"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Proposal accepted</h2><p>{lead.acceptedAt ? new Date(lead.acceptedAt).toLocaleString() : "Acceptance recorded"}</p></div></div></div><div className="detail-line"><b>Signatory</b>{lead.acceptanceName || "Not recorded"}</div>{lead.acceptanceDocumentName && <div className="detail-line"><b>Signed document</b>{lead.acceptanceDocumentDataUrl ? <a href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}>{lead.acceptanceDocumentName} <Download size={12} /></a> : lead.acceptanceDocumentName}</div>}</section>}

    <section className="panel record-section proposal-section" id="workflow-proposal">
      <div className="record-section-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>Proposal & SOW</h2><p>Generate a proposal or attach an existing document.</p></div></div>{latest && <StatusBadge status={latest.status}>Version {latest.version} · {latest.status === "SENT" ? "Awaiting acceptance" : latest.status.replaceAll("_", " ")}</StatusBadge>}</div>
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

    </section>

    <section className="panel record-section"><h2>Signed SOW (optional)</h2>
      {lead.acceptanceDocumentDataUrl&&<a className="button button-quiet" href={lead.acceptanceDocumentDataUrl} download={lead.acceptanceDocumentName}><Download size={14}/>Download signed SOW</a>}
      <form aria-label="Signed SOW document" onSubmit={saveSignedSow}><label className="field">Signed SOW document (optional)<input type="file" accept=".pdf,.doc,.docx" onChange={event=>{setSowFile(null);void selectDocument(event.target.files?.[0],setSowFile);}}/><small>{sowFile?.name||"Attach a signed PDF or Word document, up to 1.2 MB. You can leave this empty."}</small></label>{sowFile&&<button className="button button-quiet" disabled={savingSow}>{savingSow?"Saving…":"Save signed SOW"}</button>}</form>
    </section>



    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>;
}
