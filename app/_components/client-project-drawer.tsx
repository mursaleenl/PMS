"use client";
import {canBeAssignedProjectManager} from "@/lib/roles";

import {useEffect,useRef,useState,type FormEvent} from "react";
import {CalendarPicker} from "@/app/_components/calendar-picker";
import {SUPPORTED_CURRENCIES} from "@/lib/currency";
import {X} from "lucide-react";
import {createClientProject,type ExistingProjectClient} from "@/lib/client-projects";
import {addProject,type Project,type BillingStructure} from "@/lib/projects";
import {supabase} from "@/lib/supabase";
import {useAssignableUsers} from "@/lib/assignees";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {parseServiceDetails} from "@/lib/record-editing";
import {operatingCompanies,type OperatingCompany} from "@/lib/companies";

export function ClientProjectDrawer({initialClient,mode="existing",onClose,onCreated}:{initialClient?:ExistingProjectClient;mode?:"new"|"existing";onClose:()=>void;onCreated:(project:Project)=>void}){
  const {role}=useWorkspaceAuth();
  const {users}=useAssignableUsers();
  const [clients,setClients]=useState<ExistingProjectClient[]>([]);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);setLoadError("");
    // This RPC is also a capability check: older installations must not fall
    // back to the previous name/email-based project creation path.
    void (async()=>{
      try{
        if(!supabase)throw new Error("Database connection is unavailable.");
        const result=await supabase.rpc("project_creation_clients");
        if(result.error||!Array.isArray(result.data))throw new Error("Direct project creation is unavailable. Ask an administrator to finish setup, then retry.");
        if(active)setClients(result.data);
      }catch(cause){if(active)setLoadError(cause instanceof Error?cause.message:"Unable to load clients.");}
      finally{if(active)setLoading(false);}
    })();
    return ()=>{active=false;};
  },[attempt]);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<Project|null>(null),dialog=useRef<HTMLDialogElement>(null),saving=useRef(false);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.showModal();
    const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving.current||loading||loadError)return;
    if(role!=="admin"&&role!=="project_manager"){setError("You do not have permission to create projects.");return;}
    const data=new FormData(event.currentTarget);
    const client:ExistingProjectClient|undefined=mode==="new"?{name:String(data.get("clientName")||""),companyName:String(data.get("clientCompany")||""),email:String(data.get("clientEmail")||"")}:clients.find(item=>item.clientId===data.get("client"));
    if(!client||(mode==="existing"&&!client.clientId)){setError("Choose an existing client.");return;}
    const manager=users.find(person=>person.id===data.get("manager")&&canBeAssignedProjectManager(person.role));
    if(data.get("manager")&&!manager){setError("Select an admin or project manager.");return;}
    saving.current=true;setBusy(true);setError("");
    try{
      if(!pending.current){
        pending.current=await createClientProject({client,clientSelection:mode,title:String(data.get("title")||""),description:String(data.get("description")||""),
          services:parseServiceDetails(String(data.get("services")||"")),startDate:String(data.get("startDate")||""),
          operatingCompany:String(data.get("operatingCompany")) as OperatingCompany,billingStructure:String(data.get("billingStructure")) as BillingStructure,
          contractedValue:Number(data.get("budget")||0),currency:String(data.get("currency")||"USD"),
          team:manager?[{role:"Project Manager",name:manager.name,userId:manager.id,allocationPercent:0}]:[],
        });
        addProject(pending.current);
      }
      await flushWorkspaceChanges();onCreated(pending.current);
    }catch(cause){setError(cause instanceof Error?cause.message:"The project could not be saved.");}
    finally{saving.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className="client-project-dialog" aria-labelledby="client-project-title" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <header><div><span className="section-kicker">Client projects</span><h2 id="client-project-title">{mode==="new"?"New client project":"Add project for existing client"}</h2></div><button type="button" className="icon-button" aria-label="Close project form" disabled={busy} onClick={onClose}><X size={18}/></button></header>
    <p>{mode==="new"?"Start delivery directly. No lead or proposal is required. Adding client details does not grant portal access.":"Create a separate workspace for a client selected from the directory. Existing portal access follows that client record."}</p>
    {loading?<p role="status">Loading client directory…</p>:loadError?<><p className="form-error" role="alert">{loadError}</p><button type="button" className="button button-quiet" onClick={()=>setAttempt(value=>value+1)}>Retry</button></>:mode==="existing"&&!clients.length?<><p>No clients in the directory yet. Choose New client from Projects to create one directly.</p><button type="button" className="button button-quiet" onClick={onClose}>Close</button></>:<form onSubmit={submit}>
      <fieldset disabled={busy||Boolean(pending.current)}>
        {mode==="new"?<>
          <label className="field">Client name<input name="clientName" required maxLength={200} autoComplete="name"/></label>
          <label className="field">Client company<input name="clientCompany" maxLength={200} autoComplete="organization"/></label>
          <label className="field">Client email<input name="clientEmail" type="email" maxLength={254} autoComplete="email"/></label>
        </>:<label className="field">Client<select name="client" required defaultValue={clients.some(client=>client.clientId===initialClient?.clientId)?initialClient?.clientId:""}><option value="" disabled>Select an existing client</option>{clients.map(client=><option key={client.clientId} value={client.clientId}>{client.companyName&&client.name?`${client.companyName} · ${client.name}`:client.companyName||client.name||client.email}{client.email?` (${client.email})`:""} · {client.portalLinked?"Portal linked":"No portal access"}</option>)}</select></label>}
        <label className="field">Project name<input name="title" required maxLength={200} placeholder="e.g. Mobile app redesign"/></label>
        <label className="field">Scope / description<textarea name="description" rows={3} placeholder="Describe the work for this project"/></label>
        <label className="field">Services<input name="services" placeholder="e.g. UI/UX, Development"/></label>
        <div className="client-project-fields"><label className="field">Operating organization<select name="operatingCompany" defaultValue="Evecture">{operatingCompanies.map(company=><option key={company}>{company}</option>)}</select></label><label className="field">Start date<CalendarPicker name="startDate" ariaLabel="Start date"/></label></div>
        <div className="client-project-fields"><label className="field">Billing structure<select name="billingStructure" defaultValue="Fixed"><option>Fixed</option><option>Hourly</option><option>Retainer</option></select></label><label className="field">Currency<select name="currency" defaultValue="USD">{SUPPORTED_CURRENCIES.map(currency=><option key={currency}>{currency}</option>)}</select></label></div>
        <label className="field">Project budget<input name="budget" type="number" min="0" step="0.01" defaultValue="0" required/></label>
        <label className="field">Project manager<select name="manager" defaultValue=""><option value="">Unassigned</option>{users.filter(person=>person.id&&canBeAssignedProjectManager(person.role)).map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      </fieldset>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-quiet" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy?"Saving…":pending.current?"Retry saving":"Create project"}</button></div>
    </form>}
  </dialog>;
}
