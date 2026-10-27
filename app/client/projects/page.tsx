import Link from "next/link";
import { ArrowLeft, FolderKanban } from "lucide-react";

export default function ClientProjectsPage() {
  return <div className="page-content role-dashboard-page"><Link className="back-link" href="/client"><ArrowLeft size={15} /> Client portal</Link><section className="welcome-row"><div><span className="section-kicker">CLIENT PORTAL</span><h1>Your projects</h1><p className="welcome-subtitle">Follow delivery progress, milestones, and shared files.</p></div></section><section className="client-empty-state panel"><FolderKanban size={24} /><h2>Your project workspace will appear here</h2><p>Accepted proposals become project workspaces once your team starts delivery.</p></section></div>;
}
