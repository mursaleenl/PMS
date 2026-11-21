"use client";

import {clientContactName} from "@/lib/client-identity";
import { createUuid } from "@/lib/uuid";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { readProjectLeadClientDirectory, type ExistingProjectClient } from "@/lib/client-projects";
import { addLead, acquisitionSources, budgetRanges, industries, serviceTypes } from "@/lib/leads";

export default function ProjectEnquiryPage() {
  const router = useRouter();
  const [clients,setClients]=useState<ExistingProjectClient[]>([]);
  const [selectedClient,setSelectedClient]=useState("");
  const emptyContact={fullName:"",designation:"",email:"",phone:"",companyName:"",companyWebsite:"",country:""};
  const [contact,setContact]=useState(emptyContact);
  const [industry,setIndustry]=useState("");
  const [directoryState,setDirectoryState]=useState<"loading"|"ready"|"error">("loading");
  const [directoryAttempt,setDirectoryAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    void readProjectLeadClientDirectory().then(data=>{
      if(active){setClients(data);setDirectoryState("ready");}
    }).catch(()=>{
      if(active)setDirectoryState("error");
    });
    return ()=>{active=false;};
  },[directoryAttempt]);
  function selectClient(value:string){
    setSelectedClient(value);setError("");
    const client=clients.find(item=>item.clientId===value);
    setContact(client?{
      fullName:clientContactName(client.name), companyName:client.companyName||"", email:client.email||"",
      phone:client.contactDetails?.phone||"", designation:client.contactDetails?.designation||"",
      companyWebsite:client.contactDetails?.companyWebsite||"", country:client.contactDetails?.country||"",
    }:emptyContact);
  }
  const [services, setServices] = useState<string[]>([]);
  const [budgetShared, setBudgetShared] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function toggleService(value: string) {
    setServices((current) => current.includes(value) ? current.filter((service) => service !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(directoryState!=="ready")return;
    if(selectedClient&&!clients.some(client=>client.clientId===selectedClient)){
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
    if(!clientContactName(String(form.get("fullName")||""))){setError("Client name is required. Enter a name instead of a placeholder.");return;}
    const now = new Date().toISOString();
    const rawWebsite = String(form.get("companyWebsite") || "").trim();
    const companyWebsite = rawWebsite ? (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`) : "";
    const lead = {
      id: createUuid(), createdAt: now, clientId: selectedClient || undefined,
      projectName: String(form.get("projectName") || "").trim(),
      fullName: clientContactName(String(form.get("fullName") || "")),
      designation: String(form.get("designation") || "").trim(),
      companyName: clientContactName(String(form.get("companyName") || "")),
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

  if (submitted) return <div className="page-content enquiry-page"><div className="enquiry-success panel"><span className="success-check"><Check size={25} /></span><h1>Enquiry logged.</h1><div className="success-actions"><button className="button button-primary" onClick={() => router.push("/requests")}>Open leads <ArrowRight size={15} /></button><Link className="button button-quiet" href="/">Back to workspace</Link></div></div></div>;

  return <div className="page-content enquiry-page">
    <div className="enquiry-heading"><Link className="back-link" href="/"><ArrowLeft size={15} />Workspace overview</Link><h1>Log a client enquiry</h1></div>
    <form className="enquiry-form panel" onSubmit={submit}>
      <section className="form-section"><div className="form-section-title"><h2>Contact details</h2></div>
        <div className="enquiry-client-selection">
          <label className="field" htmlFor="enquiry-existing-client">Existing client
            <select id="enquiry-existing-client" value={selectedClient} onChange={event=>selectClient(event.target.value)} disabled={directoryState!=="ready"}>
              <option value="">Select an existing client (optional)</option>
              {clients.map(client=><option key={client.clientId} value={client.clientId}>{client.companyName&&client.name?`${client.companyName} · ${client.name}`:client.companyName||client.name||client.email}{client.email?` (${client.email})`:""}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid">
        <label className="field required">Full name<input name="fullName" value={contact.fullName} onChange={event=>setContact(current=>({...current,fullName:event.target.value}))} readOnly={Boolean(selectedClient&&clients.find(client=>client.clientId===selectedClient)?.name)} autoComplete="name" placeholder="Contact full name" required /></label>
        <label className="field">Designation<input name="designation" value={contact.designation} onChange={event=>setContact(current=>({...current,designation:event.target.value}))} autoComplete="organization-title" placeholder="e.g. Founder, Marketing Director" /></label>
        <label className="field">Email address (optional)<input name="email" value={contact.email} onChange={event=>setContact(current=>({...current,email:event.target.value}))} readOnly={Boolean(selectedClient)} type="email" autoComplete="email" placeholder="contact@example.com" /></label>
        <label className="field">Phone number (optional)<input name="phone" value={contact.phone} onChange={event=>setContact(current=>({...current,phone:event.target.value}))} type="tel" autoComplete="tel" placeholder="+1 555 000 0000" /></label>
        <label className="field">Organization name<input name="companyName" value={contact.companyName} onChange={event=>setContact(current=>({...current,companyName:event.target.value}))} autoComplete="organization" placeholder="Enter organization name" /></label>
        <label className="field">Organization website<input name="companyWebsite" value={contact.companyWebsite} onChange={event=>setContact(current=>({...current,companyWebsite:event.target.value}))} type="text" placeholder="example.com" /></label>
        <label className="field">Country<input name="country" value={contact.country} onChange={event=>setContact(current=>({...current,country:event.target.value}))} autoComplete="country-name" placeholder="Country or region" /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title"><h2>Project details</h2></div>
        <label className="field required">Project name<input name="projectName" required maxLength={200} placeholder="e.g. Website redesign or mobile app" /></label>
        <fieldset className="field service-field"><legend className="field-label required">Services required</legend><div className="choice-grid">{serviceTypes.map((service) => <label className={`choice-card ${services.includes(service) ? "choice-selected" : ""}`} key={service}><input type="checkbox" checked={services.includes(service)} onChange={() => toggleService(service)} /><span className="choice-check">{services.includes(service) && <Check size={11} strokeWidth={2.5} />}</span><span>{service}</span></label>)}</div><small className="field-hint">Select all that apply.</small></fieldset>
        <div className="form-grid"><label className="field required">Industry<select name="industry" required value={industry} onChange={event=>setIndustry(event.target.value)}><option value="" disabled>Select an industry</option>{industries.map((industry) => <option key={industry}>{industry}</option>)}</select></label><label className="field required">Urgency<select name="urgency" defaultValue="Standard"><option>Standard</option><option>Rush</option></select></label></div>
        <label className="field required description-field">Project goals<textarea name="description" rows={5} required placeholder="Describe the project challenge, expected outcome, and relevant requirements." /></label>
      </section>

      <section className="form-section"><div className="form-section-title"><h2>Budget & source</h2></div>
        <div className="form-grid"><label className="field">Estimated budget range<select name="budgetRange" disabled={!budgetShared} defaultValue=""><option value="">Select a range (optional)</option>{budgetRanges.map((range) => <option key={range}>{range}</option>)}</select></label><label className="field">Acquisition source<select name="acquisitionSource" defaultValue=""><option value="">Select (optional)</option>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label></div>
        <label className="budget-refusal"><input type="checkbox" checked={!budgetShared} onChange={(event) => setBudgetShared(!event.target.checked)} /><span className="custom-check">{!budgetShared && <Check size={11} strokeWidth={2.5} />}</span><span>Contact declined to share a budget</span></label>
        {!budgetShared && <label className="field budget-note">Optional note<textarea name="budgetNote" rows={2} placeholder="Budget timing, constraints, or additional context" /></label>}
      </section>
      {directoryState==="error" && <div className="form-error" role="alert">The client directory could not load. <button type="button" className="button button-quiet" onClick={()=>{setDirectoryState("loading");setDirectoryAttempt(value=>value+1);}}>Retry</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-submit"><button className="button button-primary" type="submit" disabled={directoryState!=="ready"}>Save lead record <ArrowRight size={15} /></button></div>
    </form>
  </div>;
}
