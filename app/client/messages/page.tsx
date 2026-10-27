import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";

export default function ClientMessagesPage() {
  return <div className="page-content role-dashboard-page"><Link className="back-link" href="/client"><ArrowLeft size={15} /> Client portal</Link><section className="welcome-row"><div><span className="section-kicker">CLIENT PORTAL</span><h1>Questions and updates</h1><p className="welcome-subtitle">Keep project conversations in one place.</p></div></section><section className="client-empty-state panel"><MessageCircle size={24} /><h2>Your project conversation will appear here</h2><p>Use the secure contact channel shared by your project team for questions and change requests.</p></section></div>;
}
