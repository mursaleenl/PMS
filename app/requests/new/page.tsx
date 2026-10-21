"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleHelp, ExternalLink } from "lucide-react";
import { addLead, acquisitionSources, budgetRanges, enquirySources, industries, serviceTypes } from "@/lib/leads";

export default function ProjectEnquiryPage() {
  const router = useRouter();
  const [services, setServices] = useState<string[]>([]);
  const [budgetShared, setBudgetShared] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function toggleService(value: string) {
    setServices((current) => current.includes(value) ? current.filter((service) => service !== value) : [...current, value]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (services.length === 0) {
      setError("Select at least one service so we can route the enquiry correctly.");
      return;
    }
    setError("");
    const form = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const lead = {
      id: crypto.randomUUID(), createdAt: now,
      fullName: String(form.get("fullName") || "").trim(),
      designation: String(form.get("designation") || "").trim(),
      companyName: String(form.get("companyName") || "").trim(),
      companyWebsite: String(form.get("companyWebsite") || "").trim(),
      email: String(form.get("email") || "").trim(),
      phone: String(form.get("phone") || "").trim(),
      country: String(form.get("country") || "").trim(),
      timezone: String(form.get("timezone") || "").trim(),
      services, industry: String(form.get("industry") || ""),
      description: String(form.get("description") || "").trim(),
      referenceLinks: String(form.get("referenceLinks") || "").trim(),
      budgetRange: budgetShared ? String(form.get("budgetRange") || "") : "",
      budgetShared,
      budgetNote: budgetShared ? "" : String(form.get("budgetNote") || "").trim(),
      urgency: String(form.get("urgency") || "Standard") as "Standard" | "Rush",
      source: String(form.get("source") || "Website form"),
      acquisitionSource: String(form.get("acquisitionSource") || "Other / unknown"),
      status: "NEW" as const,
    };
    addLead(lead);
    setSubmitted(true);
  }

  if (submitted) return <div className="page-content enquiry-page"><div className="enquiry-success panel"><span className="success-check"><Check size={25} /></span><p className="eyebrow">LEAD RECORD CREATED · NEW</p><h1>Enquiry logged.</h1><p>The record is in the employee request pipeline for first contact and qualification review.</p><div className="success-actions"><button className="button button-primary" onClick={() => router.push("/requests")}>Open request pipeline <ArrowRight size={15} /></button><Link className="button button-quiet" href="/">Back to workspace</Link></div><p className="storage-note">Records are currently saved in this browser during this early build.</p></div></div>;

  return <div className="page-content enquiry-page">
    <div className="enquiry-heading"><Link className="back-link" href="/"><ArrowLeft size={15} />Workspace overview</Link><div className="eyebrow"><span className="live-dot" />STAGE 01 · EMPLOYEE INTAKE</div><h1>Log a client enquiry</h1><p>Record an inbound enquiry received by the team through any channel.</p></div>
    <form className="enquiry-form panel" onSubmit={submit}>
      <section className="form-section"><div className="form-section-title"><span>01</span><div><h2>Contact details</h2><p>Who made the enquiry, and how can the team reach them?</p></div></div><div className="form-grid">
        <label className="field required">Full name<input name="fullName" autoComplete="name" placeholder="Your name" required /></label>
        <label className="field">Designation<input name="designation" autoComplete="organization-title" placeholder="e.g. Founder, Marketing Director" /></label>
        <label className="field required">Email address<input name="email" type="email" autoComplete="email" placeholder="you@company.com" required /></label>
        <label className="field">Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="+1 555 000 0000" /></label>
        <label className="field">Company name<input name="companyName" autoComplete="organization" placeholder="Your company" /></label>
        <label className="field">Company website<input name="companyWebsite" type="url" placeholder="https://example.com" /></label>
        <label className="field">Country<input name="country" autoComplete="country-name" placeholder="Country or region" /></label>
        <label className="field">Timezone<input name="timezone" placeholder="e.g. Asia/Kolkata or UTC+5:30" /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>Project details</h2><p>Help us understand what you need and what success looks like.</p></div></div>
        <fieldset className="field service-field"><legend className="field-label required">What services are you looking for?</legend><div className="choice-grid">{serviceTypes.map((service) => <label className={`choice-card ${services.includes(service) ? "choice-selected" : ""}`} key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} /><span className="choice-check"><Check size={12} /></span><span>{service}</span></label>)}</div><small className="field-hint">Select all that apply.</small></fieldset>
        <div className="form-grid"><label className="field required">Industry<select name="industry" required defaultValue=""><option value="" disabled>Select an industry</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select></label><label className="field required">Urgency<select name="urgency" defaultValue="Standard"><option>Standard</option><option>Rush</option></select></label></div>
        <label className="field required description-field">What are you looking to achieve?<textarea name="description" rows={5} required placeholder="Tell us about the challenge, the outcome you have in mind, and anything else we should know." /></label>
        <label className="field">Reference links or inspiration<textarea name="referenceLinks" rows={3} placeholder="Add competitor sites, examples, or inspiration links (one per line)." /><small className="field-hint">You can include multiple links.</small></label>
      </section>

      <section className="form-section"><div className="form-section-title"><span>03</span><div><h2>Budget & source</h2><p>This helps us assess fit and prepare the right next steps.</p></div></div>
        <div className="form-grid"><label className="field">Estimated budget range<select name="budgetRange" disabled={!budgetShared} defaultValue=""><option value="">Select a range (optional)</option>{budgetRanges.map((range) => <option key={range}>{range}</option>)}</select></label><label className="field">How did the contact hear about Evecture?<select name="acquisitionSource" defaultValue=""><option value="">Select (optional)</option>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label></div>
        <label className="budget-refusal"><input type="checkbox" checked={!budgetShared} onChange={(event) => setBudgetShared(!event.target.checked)} /><span className="custom-check"><Check size={12} /></span><span>I’d prefer not to share my budget yet</span></label>
        {!budgetShared && <label className="field budget-note">Optional note<textarea name="budgetNote" rows={2} placeholder="Anything you'd like us to know about budget timing or constraints?" /></label>}
        <label className="field channel-field">How did this enquiry reach the studio?<select name="source" defaultValue="Website form">{enquirySources.map((source) => <option key={source}>{source}</option>)}</select><small className="field-hint">For studio use when recording an enquiry received outside this form.</small></label>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit"><p><CircleHelp size={14} />Internal lead record. Use the channel field to note how the enquiry reached the studio.</p><button className="button button-primary" type="submit">Save lead record <ArrowRight size={15} /></button></div>
    </form>
    <p className="enquiry-footnote">Employee workspace · <Link href="/requests">Open the request pipeline <ExternalLink size={12} /></Link></p>
  </div>;
}
