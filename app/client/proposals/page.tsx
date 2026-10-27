import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

export default function ClientProposalsPage() {
  return <div className="page-content role-dashboard-page"><Link className="back-link" href="/client"><ArrowLeft size={15} /> Client portal</Link><section className="welcome-row"><div><span className="section-kicker">CLIENT PORTAL</span><h1>Your proposals</h1><p className="welcome-subtitle">Review, download, and respond to proposals shared with you.</p></div></section><section className="client-empty-state panel"><FileText size={24} /><h2>Proposal access is shared by your team</h2><p>When a proposal is ready, you’ll receive a secure link here or by email.</p></section></div>;
}
