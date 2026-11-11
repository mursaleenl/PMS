"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {X} from "lucide-react";
import {existingProjectClients} from "@/lib/client-projects";
import {getProjectClients,projectClientKey,readProjects,updateProject,type Project} from "@/lib/projects";
import {readLeads} from "@/lib/leads";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {canEditRecordDetails} from "@/lib/record-editing";

export function ProjectClientsDialog({project,onClose}:{project:Project;onClose:()=>void}){
  const {role}=useWorkspaceAuth();
  const dialog=useRef<HTMLDialogElement>(null);
  const primary=getProjectClients({...project,additionalClients:[]})[0];
  const [clients]=useState(()=>{
    const options=existingProjectClients(readProjects(),readLeads(),true);
    for(const client of project.additionalClients??[])if(!options.some(item=>projectClientKey(item)===projectClientKey(client)))options.push(client);
    return options.filter(client=>!primary||projectClientKey(client)!==projectClientKey(primary));
  });
  const [selected,setSelected]=useState(()=>new Set((project.additionalClients??[]).map(projectClientKey)));
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  const savingRef=useRef(false);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return ()=>previous?.focus();},[]);
  async function submit(event:FormEvent){
    event.preventDefault();if(savingRef.current)return;
    if(!canEditRecordDetails(role)){setError("You do not have permission to manage project clients.");return;}
    savingRef.current=true;setSaving(true);setError("");
    try{updateProject(project.id,{additionalClients:clients.filter(client=>selected.has(projectClientKey(client)))});await flushWorkspaceChanges();onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to save project clients.");}
    finally{savingRef.current=false;setSaving(false);}
  }
  return <dialog ref={dialog} className="client-project-dialog project-clients-dialog" aria-labelledby="project-clients-title" onCancel={event=>{event.preventDefault();if(!savingRef.current)onClose();}}>
    <header><h2 id="project-clients-title">Manage project clients</h2><button type="button" className="icon-button" aria-label="Close project clients" disabled={saving} onClick={onClose}><X size={18}/></button></header>
    <p>Linked clients can view this project and its shared messages. Billing stays with the primary client.</p>
    <div className="project-primary-client"><small>Primary / billing client</small><strong>{primary?.companyName||primary?.name||"No primary client"}</strong>{primary?.email&&<span>{primary.email}</span>}</div>
    <form onSubmit={submit}><fieldset disabled={saving}><legend>Additional clients</legend>
      {clients.length?<div className="project-clients-list">{clients.map(client=>{const key=projectClientKey(client);return <label key={key}><input type="checkbox" checked={selected.has(key)} onChange={event=>setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(key);else next.delete(key);return next;})}/><span><strong>{client.companyName||client.name}</strong><small>{[client.companyName?client.name:"",client.email].filter(Boolean).join(" · ")}</small></span></label>;})}</div>:<p>No other clients yet. Log another client enquiry to add them here.</p>}
    </fieldset>{error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button button-quiet" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving?"Saving…":"Save clients"}</button></div></form>
  </dialog>;
}
