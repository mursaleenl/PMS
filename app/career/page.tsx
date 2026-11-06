"use client";

import { BriefcaseBusiness, FileUser, Globe, ArrowRight } from "lucide-react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function CareerPage() {
  const { role } = useWorkspaceAuth();
  if (role !== "admin") return null;

  return <div className="page-content career-page">
    <header className="welcome-row">
      <div><h1>Career</h1><p className="welcome-subtitle">A workspace for hiring and incoming applications.</p></div>
      <span className="career-progress">Work in progress</span>
    </header>
    <section className="panel career-connection" aria-labelledby="career-portal-title">
      <Globe size={24} strokeWidth={1.5} aria-hidden="true" />
      <div><h2 id="career-portal-title">Career portal connection</h2><p>This section will connect to your career portal so applications arrive directly in this workspace.</p><span>Portal connection pending</span></div>
    </section>
    <section className="panel career-applications" aria-labelledby="career-applications-title">
      <div className="panel-heading"><div><h2 id="career-applications-title">Applications</h2><p>Future home for applicants, resumes, and hiring progress.</p></div><FileUser size={20} aria-hidden="true" /></div>
      <div className="career-empty"><BriefcaseBusiness size={32} strokeWidth={1.5} aria-hidden="true" /><h3>Applications will appear here</h3><p>Once the portal is connected, submissions will be available here for your team to review.</p></div>
    </section>
    <div className="career-flow" aria-label="Planned application flow"><span>Career portal</span><ArrowRight size={14} aria-hidden="true" /><span>Incoming applications</span><ArrowRight size={14} aria-hidden="true" /><span>Team review</span></div>
  </div>;
}
