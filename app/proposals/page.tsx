"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, ExternalLink, Plus, X } from "lucide-react";
import { readLeads, type Lead } from "@/lib/leads";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";
import { ProposalGenerator } from "@/app/_components/proposal-generator";
import { ProposalWorkspace } from "@/app/_components/proposal-workspace";

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export default function ProposalsPage() {
  const [leads,setLeads]=useState<Lead[]>([]);
  const [editorOpen,setEditorOpen]=useState(false);
  const [managing,setManaging]=useState(false);
  const [selectedId,setSelectedId]=useState("");
  useEffect(()=>{
    const refresh=()=>setLeads(readLeads());refresh();
    const id=new URLSearchParams(window.location.search).get("lead");
    if(id){setSelectedId(id);setManaging(true);setEditorOpen(true);}
    window.addEventListener("evecture:leads-updated",refresh);window.addEventListener("storage",refresh);
    return ()=>{window.removeEventListener("evecture:leads-updated",refresh);window.removeEventListener("storage",refresh);};
  },[]);
  useEffect(()=>{
    if(!editorOpen)return;
    const before=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=before;};
  },[editorOpen]);
  const selected=leads.find(lead=>lead.id===selectedId);
  const records=useMemo(()=>leads.flatMap(lead=>(lead.proposals??[]).map(proposal=>({lead,proposal}))).sort((a,b)=>b.proposal.createdAt.localeCompare(a.proposal.createdAt)),[leads]);
  const documents=leads.filter(lead=>lead.qualification?.proposalAttachment||lead.acceptanceDocumentDataUrl);
  function openRecord(id:string){setManaging(true);setSelectedId(id);setEditorOpen(true);}
  function trapFocus(event:React.KeyboardEvent<HTMLDivElement>){
    if(event.key==="Escape"){event.preventDefault();setEditorOpen(false);return;}
    if(event.key!=="Tab")return;
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')).filter(el=>el.offsetParent!==null);
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  return <div className="page-content proposals-page">
    <section className="welcome-row"><div><h1>Proposals</h1><p className="welcome-subtitle">Generate proposals, manage SOW documents, and track client responses.</p></div><button className="button button-primary" type="button" onClick={()=>{setManaging(false);setSelectedId("");setEditorOpen(true);}}><Plus size={15}/>Generate proposal</button></section>
    {records.length===0?<EmptyState icon={<FileText size={22}/>} title="No proposals yet" description="Generate a proposal from a lead or enter custom client details."/>:<section className="panel proposal-index-panel"><div className="panel-heading"><div><h2>Proposal history</h2><p>{records.length} proposal version{records.length===1?"":"s"}.</p></div></div><div className="proposal-index-list">{records.map(({lead,proposal})=><article className="proposal-index-row" key={`${lead.id}-${proposal.version}`}><span className="proposal-index-mark"><FileText size={17}/></span><div className="proposal-index-main"><strong>{proposal.proposalTitle||`Proposal for ${lead.companyName||lead.fullName}`}</strong><span>{lead.companyName||lead.fullName} · Version {proposal.version}</span><small>{money(proposal.quotedAmount,proposal.currency)}{proposal.expiryDate ? ` · Expires ${proposal.expiryDate}` : ""}</small></div><StatusBadge status={proposal.status}/><div className="proposal-index-actions"><button className="button button-quiet" type="button" onClick={()=>openRecord(lead.id)}>Manage proposal</button>{proposal.shareToken&&!["DRAFT","SUPERSEDED"].includes(proposal.status)&&<Link className="button button-quiet" href={`/proposal/${encodeURIComponent(proposal.shareToken)}`}>Client view <ExternalLink size={13}/></Link>}</div></article>)}</div></section>}
    {documents.length>0&&<section className="panel record-section"><h2>Proposal & SOW documents</h2><div className="proposal-ready-list">{documents.map(lead=><button className="button button-quiet" type="button" key={lead.id} onClick={()=>openRecord(lead.id)}>{lead.companyName||lead.fullName} · Manage documents</button>)}</div></section>}
    {editorOpen&&createPortal(<div className="user-modal-backdrop proposal-compose-backdrop"><div id="proposal-editor" className="invoice-modal-card proposal-compose-dialog" role="dialog" aria-modal="true" aria-labelledby="proposal-editor-heading" onKeyDown={trapFocus}>
      <div className="proposal-compose-heading"><div><h2 id="proposal-editor-heading">{managing?"Manage proposal & SOW":"Generate proposal"}</h2><p>{managing?"Manage documents and client responses.":"Choose a lead or enter custom client details, then customize your proposal."}</p></div><button className="icon-button" type="button" autoFocus aria-label="Close proposal editor" onClick={()=>setEditorOpen(false)}><X size={18}/></button></div>
      <label className="field">Select lead<select aria-label="Select lead" value={selectedId} onChange={event=>{setManaging(false);setSelectedId(event.target.value);}}><option value="">No lead — enter details manually</option>{leads.filter(lead=>managing||["NEW","PROPOSAL_SENT"].includes(lead.status)||(lead.status!=="LOST"&&!lead.proposals?.length)).map(lead=><option value={lead.id} key={lead.id}>{lead.companyName||lead.fullName} · {lead.fullName}</option>)}</select></label>
      {selected&&managing?<ProposalWorkspace key={selected.id} lead={selected}/>:<ProposalGenerator key={selected?.id||"manual"} lead={selected} forceCompose/>}

    </div></div>,document.body)}
  </div>;
}
