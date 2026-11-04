"use client";

import { useRef, useState, type FormEvent } from "react";
import { Copy, ExternalLink, FileText } from "lucide-react";
import { readLeads, updateLead, addLead, type Lead, type ProposalVersion } from "@/lib/leads";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { createUuid } from "@/lib/uuid";
import { isValidDateValue } from "@/lib/dates";
import { operatingCompanies, type OperatingCompany } from "@/lib/companies";
import { CalendarPicker } from "@/app/_components/calendar-picker";

export function ProposalGenerator({ lead: sourceLead }: { lead?: Lead }) {
  const [createdLead,setCreatedLead]=useState<Lead|null>(null);
  const lead=sourceLead??createdLead;
  const custom=!sourceLead;
  const latest = [...(lead?.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
  const [editing, setEditing] = useState(!latest || latest.status === "DRAFT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  const canGenerate = !lead || ["NEW", "PROPOSAL_SENT"].includes(lead.status);
  const sharePath = latest?.shareToken && latest.status !== "DRAFT" && latest.status !== "SUPERSEDED" ? `/proposal/${latest.shareToken}` : null;

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true); setError("");
    try {
      // Retry the pending write without creating a second version or token.
      if (!pending) {
        const data = new FormData(event.currentTarget);
        const value = (name: string) => String(data.get(name) ?? "").trim();
        const current = lead ? readLeads().find(item=>item.id===lead.id) : undefined;
        if (lead && (!current || !["NEW","PROPOSAL_SENT"].includes(current.status))) throw new Error("This record is no longer open for a new proposal.");
        const company=current?.operatingCompany || value("operatingCompany");
        if (!operatingCompanies.includes(company as OperatingCompany)) throw new Error("Choose an operating company before generating a proposal.");
        if (!current && (!value("contactName") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value("contactEmail")))) throw new Error("Enter a contact name and valid email address.");
        const quotedAmount = Number(value("quotedAmount"));
        const depositPercent = Number(value("depositPercent"));
        if (!["proposalTitle", "scopeIncluded", "deliverables", "paymentTerms"].every((name) => value(name))) throw new Error("Enter a title, scope, deliverables, and payment terms.");
        if (!value("quotedAmount") || !Number.isFinite(quotedAmount) || quotedAmount <= 0) throw new Error("Enter a proposal amount greater than zero.");
        if (!Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100) throw new Error("Deposit must be between 0 and 100%.");
        if (!isValidDateValue(value("expiryDate")) || value("expiryDate") < new Date().toISOString().slice(0, 10)) throw new Error("Choose a valid expiry date today or later.");
        const now = new Date().toISOString();
        const previous = [...(current?.proposals ?? [])].sort((a, b) => b.version - a.version)[0];
        const proposal: ProposalVersion = {
          ...previous,
          version: Math.max(0, ...(current?.proposals ?? []).map((item) => item.version)) + 1,
          status: "SENT", createdAt: now, sentAt: now, shareToken: createUuid(),
          proposalTitle: value("proposalTitle"), preparedBy: company,
          executiveSummary: previous?.executiveSummary || current?.description || value("scopeIncluded"),
          scopeIncluded: value("scopeIncluded"), scopeExcluded: previous?.scopeExcluded || "", deliverables: value("deliverables"),
          timeline: value("timeline"), quotedAmount, currency: value("currency"),
          billingStructure: value("billingStructure") as ProposalVersion["billingStructure"],
          depositPercent, paymentTerms: value("paymentTerms"), expiryDate: value("expiryDate"),
          finalFollowUpDate: value("expiryDate"), revisionRounds: previous?.revisionRounds ?? 0, approvalProcess: previous?.approvalProcess || "",
          clientRequirements: previous?.clientRequirements || "", assumptions: previous?.assumptions || "", documentName: previous?.documentName || "", followUps: [],
          viewedAt: undefined, respondedAt: undefined, responseName: undefined, changeRequest: undefined,
        };
        const proposals = [...(current?.proposals ?? []).map((item): ProposalVersion =>
          ["SENT", "DRAFT", "CHANGES_REQUESTED"].includes(item.status) ? { ...item, status: "SUPERSEDED" } : item), proposal];
        if (current) {
          updateLead(current.id,{status:"PROPOSAL_SENT",proposals});
          if(custom)setCreatedLead({...current,status:"PROPOSAL_SENT",proposals});
        } else {
          const record: Lead={
            id:createUuid(),createdAt:now,fullName:value("contactName"),email:value("contactEmail"),
            companyName:value("companyName"),operatingCompany:company as OperatingCompany,
            designation:"",companyWebsite:"",phone:"",country:"",timezone:"",services:["Custom Request"],
            industry:"Other",description:value("scopeIncluded"),referenceLinks:"",budgetRange:"",budgetShared:false,
            budgetNote:"",urgency:"Standard",source:"Custom proposal",acquisitionSource:"",status:"PROPOSAL_SENT",proposals,
          };
          addLead(record);setCreatedLead(record);
        }
        setPending(true);
      }
      await flushWorkspaceChanges();
      setPending(false); setEditing(false); setCopied(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the proposal. Please retry.");
    } finally {
      busy.current = false; setSaving(false);
    }
  }

  async function copyLink() {
    if (!sharePath) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`); setCopied(true); setError(""); }
    catch { setError("Could not copy the link. Open the proposal and copy its address."); }
  }

  return <div className="basic-proposal-generator">
    {error && <p role="alert" className="form-callout">{error}</p>}
    {sharePath && !pending && !saving && <div className="form-actions">
      <a className="button button-quiet" href={sharePath} target="_blank" rel="noreferrer"><ExternalLink size={14} />View / save PDF</a>
      <button className="button button-quiet" type="button" onClick={() => void copyLink()}><Copy size={14} />{copied ? "Link copied" : "Copy proposal link"}</button>
    </div>}
    {canGenerate && !editing && <button className="button button-quiet" type="button" onClick={() => setEditing(true)}>Create revised proposal</button>}
    {editing && canGenerate && <form className="proposal-form" aria-label="Basic proposal generator" onSubmit={generate}>
      <fieldset disabled={saving || pending} className="basic-proposal-fields">
        {custom && !createdLead && <div className="proposal-fields-grid">
          <label className="field required">Contact name<input name="contactName" required placeholder="Contact full name" /></label>
          <label className="field required">Contact email<input name="contactEmail" type="email" required placeholder="contact@example.com" /></label>
          <label className="field">Company / organization<input name="companyName" placeholder="Company or organization name" /></label>
          <label className="field required">Operating company<select name="operatingCompany" aria-label="Operating company" required defaultValue=""><option value="" disabled>Select an operating company</option>{operatingCompanies.map(company=><option key={company}>{company}</option>)}</select></label>
        </div>}

        <label className="field required">Proposal title<input name="proposalTitle" required defaultValue={latest?.proposalTitle || (lead ? `Proposal for ${lead.companyName || lead.fullName}` : "")} /></label>
        <div className="proposal-fields-grid">
          <label className="field required">Scope of work<textarea name="scopeIncluded" rows={4} required defaultValue={latest?.scopeIncluded || lead?.description} placeholder="What work is included?" /></label>
          <label className="field required">Deliverables<textarea name="deliverables" rows={4} required defaultValue={latest?.deliverables || lead?.services.join("\n")} placeholder="List what the client will receive" /></label>
          <label className="field required">Proposal amount<input name="quotedAmount" type="number" min="0.01" step="0.01" required defaultValue={latest?.quotedAmount} placeholder="0.00" /></label>
          <label className="field">Currency<select name="currency" defaultValue={latest?.currency || "USD"}>{["USD", "INR", "EUR", "GBP", "AED", "AUD", "CAD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
          <label className="field">Billing structure<select name="billingStructure" defaultValue={latest?.billingStructure || "Fixed"}><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label>
          <label className="field">Deposit (%)<input name="depositPercent" type="number" min="0" max="100" step="0.01" defaultValue={latest?.depositPercent ?? 0} /></label>
          <label className="field">Timeline<input name="timeline" defaultValue={latest?.timeline || ""} placeholder="e.g. 4 weeks from approval" /></label>
          <label className="field required">Valid until<CalendarPicker name="expiryDate" required defaultValue={expiry.toISOString().slice(0, 10)} /></label>
        </div>
        <label className="field required">Payment terms<textarea name="paymentTerms" rows={2} required defaultValue={latest?.paymentTerms || ""} placeholder="When and how should the client pay?" /></label>
      </fieldset>
      <p className="payment-boundary">Generating creates a client link and marks this proposal as sent. Share the link yourself; no email is sent.{latest ? " The previous open version will be replaced in the client view and kept in your history." : ""}</p>
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}><FileText size={14} />{saving ? "Saving…" : pending ? "Retry saving proposal" : "Generate proposal"}</button>{latest && !pending && <button className="button button-quiet" type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>}</div>
    </form>}
  </div>;
}
