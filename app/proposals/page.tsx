"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FileText, ExternalLink, Plus } from "lucide-react";
import { readLeads, type Lead } from "@/lib/leads";
import { StatusBadge } from "@/app/_components/status-badge";
import { EmptyState } from "@/app/_components/empty-state";

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ProposalsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    const refresh = () => setLeads(readLeads());
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const records = useMemo(() => leads.flatMap((lead) => (lead.proposals ?? []).map((proposal) => ({ lead, proposal }))).sort((left, right) => right.proposal.createdAt.localeCompare(left.proposal.createdAt)), [leads]);
  const readyLeads = leads.filter((lead) => lead.status === "QUALIFIED" && !(lead.proposals ?? []).some((proposal) => proposal.status === "SENT"));

  return <div className="page-content proposals-page">
    <section className="welcome-row"><div><h1>Proposals</h1><p className="welcome-subtitle">Prepare, send, and track client proposals.</p></div><Link className="button button-primary" href="/requests"><Plus size={15} />Open leads</Link></section>

    {readyLeads.length > 0 && <section className="panel proposal-ready-panel"><div className="panel-heading"><div><h2>Ready to prepare</h2><p>Qualified enquiries that do not have a current sent proposal.</p></div></div><div className="proposal-ready-list">{readyLeads.map((lead) => <Link className="proposal-ready-row" href={`/requests/${lead.id}`} key={lead.id}><span className="proposal-index-mark"><FileText size={17} /></span><span><strong>{lead.companyName || lead.fullName}</strong><small>{lead.services.join(" · ") || "Project enquiry"}</small></span><ArrowRight size={16} /></Link>)}</div></section>}

    {records.length === 0 ? <EmptyState icon={<FileText size={22} />} title="No proposals yet" description="Qualify an enquiry, then prepare its first client proposal here." action={<Link className="button button-primary" href="/requests">Open qualified enquiries <ArrowRight size={14} /></Link>} /> : <section className="panel proposal-index-panel"><div className="panel-heading"><div><h2>Proposal history</h2><p>{records.length} proposal version{records.length === 1 ? "" : "s"} across your enquiries.</p></div></div><div className="proposal-index-list">{records.map(({ lead, proposal }) => <article className="proposal-index-row" key={`${lead.id}-${proposal.version}`}><span className="proposal-index-mark"><FileText size={17} /></span><div className="proposal-index-main"><strong>{proposal.proposalTitle || `Proposal for ${lead.companyName || lead.fullName}`}</strong><span>{lead.companyName || lead.fullName} · Version {proposal.version}</span><small>{money(proposal.quotedAmount, proposal.currency)} · Expires {proposal.expiryDate}</small></div><StatusBadge status={proposal.status}>{label(proposal.status)}</StatusBadge><div className="proposal-index-actions"><Link href={`/requests/${lead.id}`}>Open workspace <ArrowRight size={14} /></Link>{proposal.shareToken && <Link href={`/proposal/${proposal.shareToken}`} target="_blank" rel="noreferrer">Client view <ExternalLink size={13} /></Link>}</div></article>)}</div></section>}
  </div>;
}
