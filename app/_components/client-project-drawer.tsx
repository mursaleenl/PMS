"use client";

import {useEffect,useRef,useState,type FormEvent} from "react";
import {X} from "lucide-react";
import {createClientProject,existingProjectClients,type ExistingProjectClient} from "@/lib/client-projects";
import {addProject,readProjects,type Project,type BillingStructure} from "@/lib/projects";
import {readLeads} from "@/lib/leads";
import {useAssignableUsers} from "@/lib/assignees";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {parseServiceDetails} from "@/lib/record-editing";
import {operatingCompanies,type OperatingCompany} from "@/lib/companies";

export function ClientProjectDrawer({initialClient,onClose,onCreated}:{initialClient?:ExistingProjectClient;onClose:()=>void;onCreated:(project:Project)=>void}){
  const {role}=useWorkspaceAuth();
  const {users}=useAssignableUsers();
  const [clients]=useState(()=>initialClient?[initialClient]:existingProjectClients(readProjects(),readLeads()));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<Project|null>(null),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.showModal();
    const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    if(role!=="admin"&&role!=="project_manager"){setError("You do not have permission to create projects.");return;}
    const data=new FormData(event.currentTarget),client=clients[Number(data.get("client"))];
    if(!client){setError("Choose an existing client.");return;}
    const manager=users.find(person=>person.id===data.get("manager")&&person.role==="project_manager");
    setBusy(true);setError("");
    try{
      if(!pending.current){
        pending.current=await createClientProject({client,title:String(data.get("title")||""),description:String(data.get("description")||""),
          services:parseServiceDetails(String(data.get("services")||"")),startDate:String(data.get("startDate")||""),
          operatingCompany:String(data.get("operatingCompany")) as OperatingCompany,billingStructure:String(data.get("billingStructure")) as BillingStructure,
          contractedValue:Number(data.get("budget")||0),currency:String(data.get("currency")||"USD"),
          team:manager?[{role:"Project Manager",name:manager.name,userId:manager.id,allocationPercent:0}]:[],
        });
        addProject(pending.current);
      }
      await flushWorkspaceChanges();onCreated(pending.current);
    }catch(cause){setError(cause instanceof Error?cause.message:"The project could not be saved.");}
    finally{setBusy(false);}
  }
  return <dialog ref={dialog} className="client-project-dialog" aria-labelledby="client-project-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <header><div><span className="section-kicker">Client projects</span><h2 id="client-project-title">Add project for existing client</h2></div><button type="button" className="icon-button" aria-label="Close project form" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <p>Create a separate workspace for new work under the same client.</p>
    {!clients.length?<><p>No existing clients yet. Create your first client project from a lead.</p><button type="button" className="button button-quiet" onClick={onClose}>Close</button></>:<form onSubmit={submit}>
      <fieldset disabled={busy||Boolean(pending.current)}>
        <label className="field">Client<select name="client" required defaultValue={initialClient?"0":""}><option value="" disabled>Select an existing client</option>{clients.map((client,index)=><option key={index} value={index}>{client.companyName?`${client.companyName} · ${client.name}`:client.name}{client.email?` (${client.email})`:""}</option>)}</select></label>
        <label className="field">Project name<input name="title" required maxLength={200} placeholder="e.g. Mobile app redesign"/></label>
        <label className="field">Scope / description<textarea name="description" rows={3} placeholder="Describe the work for this project"/></label>
        <label className="field">Services<input name="services" placeholder="e.g. UI/UX, Development"/></label>
        <div className="client-project-fields"><label className="field">Operating organization<select name="operatingCompany" defaultValue="Evecture">{operatingCompanies.map(company=><option key={company}>{company}</option>)}</select></label><label className="field">Start date<input name="startDate" type="date"/></label></div>
        <div className="client-project-fields"><label className="field">Billing structure<select name="billingStructure" defaultValue="Fixed"><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label><label className="field">Currency<select name="currency" defaultValue="USD"><option>USD</option><option>INR</option><option>EUR</option><option>GBP</option></select></label></div>
        <label className="field">Project budget<input name="budget" type="number" min="0" step="0.01" defaultValue="0" required/></label>
        <label className="field">Project manager<select name="manager" defaultValue=""><option value="">Unassigned</option>{users.filter(person=>person.id&&person.role==="project_manager").map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      </fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy?"Saving…":pending.current?"Retry saving":"Create project"}</button></div>
    </form>}
  </dialog>;
}
