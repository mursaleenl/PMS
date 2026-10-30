"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useClientWorkspace } from "@/lib/client-workspace";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function ClientPortalPage() {
  const { user } = useWorkspaceAuth();
  const {projects,proposals,loading,error,retry}=useClientWorkspace();

  return <div className="page-content role-dashboard-page client-portal-page">
    <section className="welcome-row"><div><span className="section-kicker">CLIENT PORTAL</span><h1>Welcome{user?.user_metadata?.full_name ? `, ${String(user.user_metadata.full_name).split(" ")[0]}` : ""}</h1><p className="welcome-subtitle">Review proposals, follow project progress, and stay connected with your team.</p></div></section>
    {error&&<p role="alert">{error} <button className="button button-quiet" onClick={retry}>Retry</button></p>}
    <section className="role-summary-grid">
      <Link href="/client/proposals" className="role-summary-card"><div><small>Proposals</small><strong>{loading ? "Loading proposals…" : `${proposals.length} shared proposals`}</strong></div><ArrowRight size={18} /></Link>
      <Link href="/client/projects" className="role-summary-card"><div><small>Projects</small><strong>{loading ? "Loading projects…" : `${projects.length} projects`}</strong></div><ArrowRight size={18} /></Link>
      <Link href="/client/messages" className="role-summary-card"><div><small>Questions</small><strong>Contact your team</strong></div><ArrowRight size={18} /></Link>
    </section>
  </div>;
}
