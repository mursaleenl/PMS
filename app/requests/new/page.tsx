"use client";

import { createUuid } from "@/lib/uuid";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleHelp, ExternalLink } from "lucide-react";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { existingProjectClients, type ExistingProjectClient } from "@/lib/client-projects";
import { readProjects } from "@/lib/projects";
import { addLead, readLeads, acquisitionSources, budgetRanges, industries, serviceTypes } from "@/lib/leads";

export default function ProjectEnquiryPage() {
  const router = useRouter();
  const [clients,setClients]=useState<ExistingProjectClient[]>([]);
  const [selectedClient,setSelectedClient]=useState("");
  const emptyContact={fullName:"",designation:"",email:"",phone:"",companyName:"",companyWebsite:"",country:""};
  const [contact,setContact]=useState(emptyContact);
  const [industry,setIndustry]=useState("");
  useEffect(()=>{
    const refresh=()=>setClients(existingProjectClients(readProjects(),readLeads()));
    refresh();
    window.addEventListener("evecture:projects-updated",refresh);window.addEventListener("evecture:leads-updated",refresh);
    return ()=>{window.removeEventListener("evecture:projects-updated",refresh);window.removeEventListener("evecture:leads-updated",refresh);};
  },[]);
  function selectClient(value:string){
    setSelectedClient(value);setError("");
    const client=clients.find(item=>clientKey(item)===value);
    if(!client){setContact(emptyContact);return;}
    const lead=readLeads().find(item=>client.email?item.email.trim().toLowerCase()===client.email.trim().toLowerCase():item.fullName.trim().toLowerCase()===client.name.trim().toLowerCase()&&item.companyName.trim().toLowerCase()===(client.companyName||"").trim().toLowerCase());
    setContact({fullName:client.name||client.companyName||"",companyName:client.companyName||"",email:client.email||"",phone:client.contactDetails?.phone??lead?.phone??"",designation:client.contactDetails?.designation??lead?.designation??"",companyWebsite:client.contactDetails?.companyWebsite??lead?.companyWebsite??"",country:client.contactDetails?.country??lead?.country??""});
    const clientIndustry=client.contactDetails?.industry??lead?.industry;
    if(clientIndustry&&industries.some(item=>item===clientIndustry))setIndustry(clientIndustry);
  }
  function clientKey(client:ExistingProjectClient){return JSON.stringify([client.email?.trim().toLowerCase()||"",client.companyName||"",client.name]);}
  const [services, setServices] = useState<string[]>([]);
  const [budgetShared, setBudgetShared] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function toggleService(value: string) {
    setServices((current) => current.includes(value) ? current.filter((service) => service !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(selectedClient&&!clients.some(client=>clientKey(client)===selectedClient)){
      setError("Select an existing client before saving the enquiry.");return;
    }
    if(!String(new FormData(event.currentTarget).get("projectName")||"").trim()){
      setError("Enter a project name.");return;
    }
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
      id: createUuid(), createdAt: now,
      projectName: String(form.get("projectName") || "").trim(),
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

  if (submitted) return <div className="page-content enquiry-page"><div className="enquiry-success panel"><span className="success-check"><Check size={25} /></span><h1>Enquiry logged.</h1><p>The record is now available in Leads for proposal and project setup.</p><div className="success-actions"><button className="button button-primary" onClick={() => router.push("/requests")}>Open leads <ArrowRight size={15} /></button><Link className="button button-quiet" href="/">Back to workspace</Link></div><p className="storage-note">The enquiry has been saved to your workspace database.</p></div></div>;

  return <div className="page-content enquiry-page">
    <div className="enquiry-heading"><Link className="back-link" href="/"><ArrowLeft size={15} />Workspace overview</Link><h1>Log a client enquiry</h1></div>
    <form className="enquiry-form panel" onSubmit={submit}>
      <section className="form-section"><div className="form-section-title"><span>01</span><div><h2>Contact details</h2><p>Who made the enquiry, and how can the team reach them?</p></div></div>
        <div className="enquiry-client-selection">
          <label className="field" htmlFor="enquiry-existing-client">Existing client
            <select id="enquiry-existing-client" value={selectedClient} onChange={event=>selectClient(event.target.value)} aria-describedby="enquiry-client-hint">
              <option value="">Select an existing client (optional)</option>
              {clients.map(client=><option key={clientKey(client)} value={clientKey(client)}>{client.companyName?`${client.companyName} · ${client.name}`:client.name}{client.email?` (${client.email})`:""}</option>)}
            </select>
          </label>
          <p id="enquiry-client-hint" className="field-hint">Select a client to fill their contact details, or leave blank for a new client.</p>
        </div>
        <div className="form-grid">
        <label className="field required">Full name<input name="fullName" value={contact.fullName} onChange={event=>setContact(current=>({...current,fullName:event.target.value}))} readOnly={Boolean(selectedClient)} autoComplete="name" placeholder="Contact full name" required /></label>
        <label className="field">Designation<input name="designation" value={contact.designation} onChange={event=>setContact(current=>({...current,designation:event.target.value}))} autoComplete="organization-title" placeholder="e.g. Founder, Marketing Director" /></label>
        <label className="field">Email address (optional)<input name="email" value={contact.email} onChange={event=>setContact(current=>({...current,email:event.target.value}))} readOnly={Boolean(selectedClient)} type="email" autoComplete="email" placeholder="contact@example.com" /></label>
        <label className="field">Phone number (optional)<input name="phone" value={contact.phone} onChange={event=>setContact(current=>({...current,phone:event.target.value}))} type="tel" autoComplete="tel" placeholder="+1 555 000 0000" /></label>
        <label className="field">Company / organization name<input name="companyName" value={contact.companyName} onChange={event=>setContact(current=>({...current,companyName:event.target.value}))} autoComplete="organization" placeholder="Enter company or organization name" /></label>
        <label className="field">Company website<input name="companyWebsite" value={contact.companyWebsite} onChange={event=>setContact(current=>({...current,companyWebsite:event.target.value}))} type="text" placeholder="example.com" /></label>
        <label className="field">Country<input name="country" value={contact.country} onChange={event=>setContact(current=>({...current,country:event.target.value}))} autoComplete="country-name" placeholder="Country or region" /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title"><span>02</span><div><h2>Project details</h2><p>Record the project requirements and expected outcomes.</p></div></div>
        <label className="field required">Project name<input name="projectName" required maxLength={200} placeholder="e.g. Website redesign or mobile app" /></label>
        <fieldset className="field service-field"><legend className="field-label required">Services required</legend><div className="choice-grid">{serviceTypes.map((service) => <label className={`choice-card ${services.includes(service) ? "choice-selected" : ""}`} key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} /><span className="choice-check">{services.includes(service) && <Check size={11} strokeWidth={2.5} />}</span><span>{service}</span></label>)}</div><small className="field-hint">Select all that apply.</small></fieldset>
        <div className="form-grid"><label className="field required">Industry<select name="industry" required value={industry} onChange={event=>setIndustry(event.target.value)}><option value="" disabled>Select an industry</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select></label><label className="field required">Urgency<select name="urgency" defaultValue="Standard"><option>Standard</option><option>Rush</option></select></label></div>
        <label className="field required description-field">Project goals<textarea name="description" rows={5} required placeholder="Describe the project challenge, expected outcome, and relevant requirements." /></label>
      </section>

      <section className="form-section"><div className="form-section-title"><span>03</span><div><h2>Budget & source</h2><p>Record budget details and the enquiry source.</p></div></div>
        <div className="form-grid"><label className="field">Estimated budget range<select name="budgetRange" disabled={!budgetShared} defaultValue=""><option value="">Select a range (optional)</option>{budgetRanges.map((range) => <option key={range}>{range}</option>)}</select></label><label className="field">Acquisition source<select name="acquisitionSource" defaultValue=""><option value="">Select (optional)</option>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label></div>
        <label className="budget-refusal"><input type="checkbox" checked={!budgetShared} onChange={(event) => setBudgetShared(!event.target.checked)} /><span className="custom-check">{!budgetShared && <Check size={11} strokeWidth={2.5} />}</span><span>Contact declined to share a budget</span></label>
        {!budgetShared && <label className="field budget-note">Optional note<textarea name="budgetNote" rows={2} placeholder="Budget timing, constraints, or additional context" /></label>}
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit"><p><CircleHelp size={14} />Internal lead record.</p><button className="button button-primary" type="submit">Save lead record <ArrowRight size={15} /></button></div>
    </form>
    <p className="enquiry-footnote">Employee workspace · <Link href="/requests">Open leads <ExternalLink size={12} /></Link></p>
  </div>;
}
