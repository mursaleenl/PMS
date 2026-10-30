"use client";
import Link from "next/link";
import {useClientWorkspace} from "@/lib/client-workspace";
import {StatusBadge} from "@/app/_components/status-badge";
import {formatMoney} from "@/lib/currency";
export default function ClientProposalsPage() {
 const {proposals,loading,error,retry}=useClientWorkspace();
 return <div className="page-content role-dashboard-page"><Link className="back-link" href="/client">Client portal</Link><section className="welcome-row"><div><h1>Your proposals</h1><p className="welcome-subtitle">Review and respond to proposals shared with you.</p></div></section>{loading?<p role="status">Loading proposals…</p>:error?<section className="panel"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section>:proposals.length?<div className="portal-records">{proposals.map(proposal=><article className="panel portal-record" key={proposal.id}><div className="panel-heading"><h2>{proposal.proposal_title || proposal.project_title || "Project proposal"}</h2><StatusBadge status={proposal.status}/></div><p>Version {proposal.version} · {formatMoney(proposal.quoted_amount,proposal.currency)} · Valid until {proposal.expiry_date}</p>{proposal.share_token&&<Link className="button button-primary" href={`/proposal/${proposal.share_token}`}>Review proposal</Link>}</article>)}</div>:<section className="panel portal-record"><h2>No proposals yet</h2><p>Proposals shared with your client account will appear here.</p></section>}</div>;
}
