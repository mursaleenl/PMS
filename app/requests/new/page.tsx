"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleHelp, ExternalLink } from "lucide-react";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { addLead, acquisitionSources, budgetRanges, industries, serviceTypes } from "@/lib/leads";

export default function ProjectEnquiryPage() {
  const router = useRouter();
  const [services, setServices] = useState<string[]>([]);
  const [budgetShared, setBudgetShared] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function toggleService(value: string) {
    setServices((current) => current.includes(value) ? current.filter((service) => service !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (services.length === 0) {
      setError("Select at least one service so we can route the enquiry correctly.");
      return;
    }
    setError("");
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const rawWebsite = String(form.get("companyWebsite") || "").trim();
    const companyWebsite = rawWebsite ? (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`) : "";
    const lead = {
      id: crypto.randomUUID(), createdAt: now,
      fullName: String(form.get("fullName") || "").trim(),
      designation: String(form.get("designation") || "").trim(),
      companyName: String(form.get("companyName") || "").trim(),
      companyWebsite,
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      country: String(form.get("country") || "").trim(),
      timezone: "",
      services, industry: String(form.get("industry") || ""),
      description: String(form.get("description") || "").trim(),
      referenceLinks: "",
      budgetRange: budgetShared ? String(form.get("budgetRange") || "") : "",
      budgetShared,
      budgetNote: budgetShared ? "" : String(form.get("budgetNote") || "").trim(),
      urgency: String(form.get("urgency") || "Standard") as "Standard" | "Rush",
      source: String(form.get("source") || "Website form"),
      acquisitionSource: String(form.get("acquisitionSource") || "Other / unknown"),
      status: "NEW" as const,
    };
    addLead(lead);
    try { await flushWorkspaceChanges(); setSubmitted(true); } catch(cause) { setError(cause instanceof Error ? cause.message : "Enquiry could not be saved."); }
  }

  if (submitted) return <div className="page-content enquiry-page"><div className="enquiry-success panel"><span className="success-check"><Check size={25} /></span><h1>Enquiry logged.</h1><p>The record is now available in Leads for first contact and qualification review.</p><div className="success-actions"><button className="button button-primary" onClick={() => router.push("/requests")}>Open leads <ArrowRight size={15} /></button><Link className="button button-quiet" href="/">Back to workspace</Link></div><p className="storage-note">The enquiry has been saved to your workspace database.</p></div></div>;

  return <div className="page-content enquiry-page">
    <div className="enquiry-heading"><Link className="back-link" href="/"><ArrowLeft size={15} />Workspace overview</Link><h1>Log a client enquiry</h1></div>
    <form className="enquiry-form panel" onSubmit={submit}>
      <section className="form-section"><div className="form-section-title"><span>01</span><div><h2>Contact details</h2><p>Who made the enquiry, and how can the team reach them?</p></div></div><div className="form-grid">
        <label className="field required">Full name<input name="fullName" autoComplete="name" placeholder="Your name" required /></label>
        <label className="field">Designation<input name="designation" autoComplete="organization-title" placeholder="e.g. Founder, Marketing Director" /></label>
        <label className="field required">Email address<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label>
        <label className="field">Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="+1 555 000 0000" /></label>
        <label className="field">Company name<input name="companyName" autoComplete="organization" placeholder="Your company" /></label>
        <label className="field">Company website<input name="companyWebsite" type="text" placeholder="example.com" /></label>
        <label className="field">Country<input name="country" autoComplete="country-name" placeholder="Country or region" /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>Project details</h2><p>Help us understand what you need and what success looks like.</p></div></div>
        <fieldset className="field service-field"><legend className="field-label required">What services are you looking for?</legend><div className="choice-grid">{serviceTypes.map((service) => <label className={`choice-card ${services.includes(service) ? "choice-selected" : ""}`} key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} /><span className="choice-check">{services.includes(service) && <Check size={11} strokeWidth={2.5} />}</span><span>{service}</span></label>)}</div><small className="field-hint">Select all that apply.</small></fieldset>
        <div className="form-grid"><label className="field required">Industry<select name="industry" required defaultValue=""><option value="" disabled>Select an industry</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select></label><label className="field required">Urgency<select name="urgency" defaultValue="Standard"><option>Standard</option><option>Rush</option></select></label></div>
        <label className="field required description-field">What are you looking to achieve?<textarea name="description" rows={5} required placeholder="Tell us about the challenge, the outcome you have in mind, and anything else we should know." /></label>
      </section>

      <section className="form-section"><div className="form-section-title"><span>03</span><div><h2>Budget & source</h2><p>This helps us assess fit and prepare the right next steps.</p></div></div>
        <div className="form-grid"><label className="field">Estimated budget range<select name="budgetRange" disabled={!budgetShared} defaultValue=""><option value="">Select a range (optional)</option>{budgetRanges.map((range) => <option key={range}>{range}</option>)}</select></label><label className="field">How did the contact hear about EVECTURE?<select name="acquisitionSource" defaultValue=""><option value="">Select (optional)</option>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label></div>
        <label className="budget-refusal"><input type="checkbox" checked={!budgetShared} onChange={(event) => setBudgetShared(!event.target.checked)} /><span className="custom-check">{!budgetShared && <Check size={11} strokeWidth={2.5} />}</span><span>I’d prefer not to share my budget yet</span></label>
        {!budgetShared && <label className="field budget-note">Optional note<textarea name="budgetNote" rows={2} placeholder="Anything you'd like us to know about budget timing or constraints?" /></label>}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit"><p><CircleHelp size={14} />Internal lead record.</p><button className="button button-primary" type="submit">Save lead record <ArrowRight size={15} /></button></div>
    </form>
    <p className="enquiry-footnote">Employee workspace · <Link href="/requests">Open leads <ExternalLink size={12} /></Link></p>
  </div>;
}
