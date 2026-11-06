"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, Clock3, ShieldCheck } from "lucide-react";
import { type Lead, readLeads, updateLead } from "@/lib/leads";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { addProject, projectFromLead, type Project, type ProjectClassification, type ProjectTeamMember } from "@/lib/projects";
import { StatusBadge } from "@/app/_components/status-badge";
import { useAssignableUsers } from "@/lib/assignees";
import { CalendarPicker } from "@/app/_components/calendar-picker";
import { operatingCompanies, type OperatingCompany } from "@/lib/companies";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export default function LeadWorkspacePage() {
  const { role } = useWorkspaceAuth();
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const leadId = params.leadId;
  const { users: assignableUsers } = useAssignableUsers();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const converting = useRef(false);

  useEffect(() => {
    const refresh = () => {
      setLead(readLeads().find((item) => item.id === leadId) ?? null);
      setLoading(false);
    };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [leadId]);

  function saveLead(updates: Partial<Lead>) {
    if (lead) updateLead(lead.id, updates);
  }

  async function createProjectFromLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (converting.current) return;
    if (!lead || !["NEW", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status) || lead.projectId) {
      setError("This lead cannot be moved into Projects in its current stage.");
      return;
    }
    if (!lead.operatingCompany) {
      setError("Choose Evecture or Servn in the lead’s Operating company section before moving this project into Projects.");
      return;
    }
    const proposalForProject = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version).find((proposal) => proposal.status === "ACCEPTED")
      ?? [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
    const data = new FormData(event.currentTarget);
    const manager = assignableUsers.find(person => person.id === String(data.get("projectManager")) && person.role === "project_manager");
    if (data.get("projectManager") && !manager) { setError("Select a user with the Project Manager role."); return; }
    const team: ProjectTeamMember[] = manager ? [{ role: "Project Manager", name: manager.name, userId: manager.id, allocationPercent: 0 }] : [];
    converting.current = true;
    try {
      const project = await projectFromLead({
        lead,
        proposal: proposalForProject,
        contractedValue: Number(data.get("contractedValue")),
        currency: String(data.get("currency") || "USD"),
        billingStructure: String(data.get("billingStructure") || "Fixed") as Project["billingStructure"],
        title: String(data.get("projectTitle") || "").trim(),
        classification: String(data.get("classification") || "New Client") as ProjectClassification,
        operatingCompany: lead.operatingCompany,
        startDate: String(data.get("startDate") || ""),
        team,
      });
      addProject(project);
      updateLead(lead.id, { status: "CONVERTED", projectId: project.id });
      await flushWorkspaceChanges();
      router.push(`/projects/${project.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project workspace could not be created.");
    } finally { converting.current = false; }
  }

  if (loading) return <div className="page-content"><div className="panel pipeline-empty"><p>Loading lead record…</p></div></div>;
  if (!lead) return <div className="page-content"><div className="panel pipeline-empty"><h2>Lead record not found</h2><p>This lead may have been removed or you may not have access to it.</p><Link className="button button-quiet" href="/requests"><ArrowLeft size={14} />Back to pipeline</Link></div></div>;

  const latest = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
  const projectProposal = [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version).find((proposal) => proposal.status === "ACCEPTED") ?? latest;
  if ((role === "employee")) return <div className="page-content lead-workspace-page">
    <Link className="back-link" href="/requests"><ArrowLeft size={15} />Leads</Link>
    <header className="record-heading"><div><h1>{lead.companyName || lead.fullName}</h1><p className="welcome-subtitle">{lead.fullName}{lead.designation ? ` · ${lead.designation}` : ""} · {lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</p></div><StatusBadge status={lead.status} /></header>
    <section className="panel record-section"><div className="record-section-heading"><div><h2>Enquiry details</h2><p>{lead.services.join(" · ") || "Project enquiry"}</p></div></div><div className="enquiry-summary-grid"><div><small>Company</small><p>{lead.companyName || "Individual enquiry"}</p></div><div><small>Industry</small><p>{lead.industry || "Not recorded"}</p></div><div><small>Urgency</small><p>{lead.urgency || "Not recorded"}</p></div><div><small>Country</small><p>{lead.country || "Not recorded"}</p></div></div><p className="lead-description">{lead.description || "No enquiry description recorded."}</p>{lead.referenceLinks && <p><a href={lead.referenceLinks.startsWith("http") ? lead.referenceLinks : `https://${lead.referenceLinks}`} target="_blank" rel="noreferrer">Reference link</a></p>}</section>
  </div>;
  const workflowOpen = lead.status !== "LOST";
  const companySelectionLocked = Boolean(lead.operatingCompany && (lead.projectId || lead.invoice || (lead.proposals ?? []).some((proposal) => ["SENT", "ACCEPTED", "SUPERSEDED"].includes(proposal.status))));

  return <div className="page-content lead-workspace-page">
    <Link className="back-link" href="/requests"><ArrowLeft size={15} />Leads</Link>
    <header className="record-heading"><div><h1>{lead.companyName || lead.fullName}</h1></div><StatusBadge status={lead.status} /></header>

    {workflowOpen && <section className={`panel record-section operating-company-step ${lead.operatingCompany ? "is-selected" : "needs-selection"}`} id="workflow-company">
      <div className="record-section-heading"><div><span className="section-icon"><ShieldCheck size={17} /></span><div><h2>Choose operating company</h2><p>Choose the studio responsible for this lead and its project.</p></div></div><span className="workflow-state">{companySelectionLocked ? "Company confirmed" : lead.operatingCompany ? "Selected" : "Required before project setup"}</span></div>
      <label className="field required">Operating company<select aria-label="Choose the operating company for this lead" required disabled={companySelectionLocked} value={lead.operatingCompany ?? ""} onChange={(event) => { const value = event.target.value; if (operatingCompanies.some((company) => company === value)) saveLead({ operatingCompany: value as OperatingCompany }); }}><option value="" disabled>Select Evecture or Servn</option>{operatingCompanies.map((company) => <option key={company} value={company}>{company}</option>)}</select>{companySelectionLocked && <small>The company is fixed once a proposal is sent, an invoice is created, or the lead becomes a project.</small>}</label>
    </section>}


    {lead.status === "CONVERTED" && lead.projectId && <section className="panel record-section project-gate-complete"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Project workspace created</h2><p>Accepted proposal details and any available commercial records are linked to the active project.</p></div></div></div><Link className="button button-primary" href={`/projects/${lead.projectId}`}>Open project workspace <ArrowRight size={14} /></Link></section>}

    {(["NEW", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status)) && !lead.projectId && <section className="panel record-section project-create-section"><div className="record-section-heading"><div><span className="section-icon"><Check size={17} /></span><div><h2>Move to Projects</h2><p>{lead.status === "ACCEPTED" ? "Set the project owner and setup details to create its workspace." : "Create a project workspace. Proposals can be managed separately on the Proposals page."} Deposit and SOW tracking can be completed separately.</p></div></div></div>
      <div className="commercial-proof"><span className={lead.acceptanceDocumentDataUrl ? "" : "commercial-proof-pending"}>{lead.acceptanceDocumentDataUrl ? <Check size={13} /> : <Clock3 size={13} />}Signed SOW · {lead.acceptanceDocumentDataUrl ? lead.acceptanceDocumentName : "not attached"}</span><span className={lead.invoice?.status === "CONFIRMED_PAID" ? "" : "commercial-proof-pending"}>{lead.invoice?.status === "CONFIRMED_PAID" ? <Check size={13} /> : <Clock3 size={13} />}Deposit · {lead.invoice ? lead.invoice.status.replaceAll("_", " ") : "not recorded"}</span></div>
      <form className="project-create-form" onSubmit={createProjectFromLead}>
        <div className="proposal-fields-grid"><label className="field required">Project title<input name="projectTitle" required defaultValue={lead.services.length > 0 ? lead.services.join(", ") : `${lead.companyName || lead.fullName} Delivery`} /></label><label className="field required">Project classification<select name="classification" required defaultValue={lead.acquisitionSource === "Referral" ? "Referral" : lead.acquisitionSource === "Repeat client" ? "Repeat Client" : "New Client"}><option>New Client</option><option>Repeat Client</option><option>Referral</option></select></label><label className="field required">Project start date<CalendarPicker name="startDate" required /></label></div>
        {!projectProposal && <div className="proposal-fields-grid"><label className="field">Contract amount (optional)<input name="contractedValue" type="number" min="0" step="0.01" placeholder="0.00" /></label><label className="field">Currency<select name="currency" defaultValue="USD">{["USD","INR","EUR","GBP","AED","AUD","CAD"].map(currency=><option key={currency}>{currency}</option>)}</select></label><label className="field">Billing structure<select name="billingStructure" defaultValue="Fixed"><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label></div>}
        <label className="field">Project manager (optional)
          <select name="projectManager" defaultValue="">
            <option value="">Unassigned</option>
            {assignableUsers.filter(person=>person.id && person.role === "project_manager").map(person=><option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <small>A project manager can be assigned or changed in the project workspace.</small>
        </label>
        <div className="project-template-note"><span><Check size={13} /></span><p>Proposal scope, exclusions, assumptions, revision rounds, billing structure, and payment terms carry over. Any SOW or invoice records already captured will be linked. The assigned Project Manager is recorded on the project team.</p></div>
        <div className="form-actions"><button className="button button-primary" type="submit">Move to Projects <ArrowRight size={14} /></button></div>
      </form>
    </section>}

    {lead.status === "LOST" && <section className="panel record-section lost-panel"><h2>Lead archived</h2><p>{lead.disqualificationReason || "Lost reason not recorded"}</p><small>This lead is retained in the pipeline history and is not deleted.</small></section>}
    {error && <div className="form-error" role="alert">{error}</div>}
  </div>;
}
