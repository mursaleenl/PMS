"use client";

import Link from "next/link";
import { ArrowRight, FileText, FolderKanban, MessageCircle } from "lucide-react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function ClientPortalPage() {
  const { user } = useWorkspaceAuth();
  const metadata = user?.user_metadata;
  const proposalToken = metadata && typeof metadata === "object" && "proposalToken" in metadata && typeof metadata.proposalToken === "string" ? metadata.proposalToken : null;

  return <div className="page-content role-dashboard-page client-portal-page">
    <section className="welcome-row"><div><span className="section-kicker">CLIENT PORTAL</span><h1>Welcome{user?.user_metadata?.full_name ? `, ${String(user.user_metadata.full_name).split(" ")[0]}` : ""}</h1><p className="welcome-subtitle">Review proposals, follow project progress, and stay connected with your team.</p></div></section>
    <section className="role-summary-grid">
      <Link href={proposalToken ? `/proposal/${proposalToken}` : "/client/proposals"} className="role-summary-card"><div><small>Proposals</small><strong>{proposalToken ? "Review latest proposal" : "No proposals yet"}</strong></div><ArrowRight size={18} /></Link>
      <Link href="/client/projects" className="role-summary-card"><div><small>Projects</small><strong>View project progress</strong></div><ArrowRight size={18} /></Link>
      <Link href="/client/messages" className="role-summary-card"><div><small>Questions</small><strong>Contact your team</strong></div><ArrowRight size={18} /></Link>
    </section>
  </div>;
}
