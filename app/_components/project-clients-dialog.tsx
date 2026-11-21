"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {X} from "lucide-react";
import {readProjectLeadClientDirectory} from "@/lib/client-projects";
import {getProjectClients,projectClientKey,updateProject,type Project,type ProjectClient} from "@/lib/projects";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {canEditRecordDetails} from "@/lib/record-editing";

export function ProjectClientsDialog({project,onClose}:{project:Project;onClose:()=>void}){
  const {role}=useWorkspaceAuth();
  const dialog=useRef<HTMLDialogElement>(null);
  const primary=getProjectClients({...project,additionalClients:[]})[0];
  const [clients,setClients]=useState<ProjectClient[]>([]);
  const [originalClients] = useState(() => project.additionalClients ?? []);
  const [selected,setSelected]=useState(()=>new Set(originalClients.map(projectClientKey)));
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  const [loading,setLoading]=useState(true),[attempt,setAttempt]=useState(0);
  const savingRef=useRef(false);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return ()=>previous?.focus();},[]);
  useEffect(()=>{
    let active=true;
    void readProjectLeadClientDirectory().then(directory=>{
      if(!active)return;
      const saved = new Map(originalClients.map(client => [projectClientKey(client),client]));
      const options:ProjectClient[]=directory
        .filter(client=>client.clientId!==project.clientId)
        .map(({clientId,name,companyName,email})=>saved.get(clientId) ?? {clientId,name,companyName,email});
      for(const client of originalClients){
        if(!options.some(item=>projectClientKey(item)===projectClientKey(client)))options.push(client);
      }
      setClients(options);
      setLoading(false);
    }).catch(cause=>{
      if(active)setError(cause instanceof Error?cause.message:"Unable to load project clients.");
    });
    return ()=>{active=false;};
  },[project.clientId,originalClients,attempt]);
  async function submit(event:FormEvent){
    event.preventDefault();if(savingRef.current||loading)return;
    if(!canEditRecordDetails(role)){setError("You do not have permission to manage project clients.");return;}
    const additionalClients=clients.filter(client=>selected.has(projectClientKey(client)));
    const current=JSON.stringify(project.additionalClients??[]);
    if(current!==JSON.stringify(originalClients)&&current!==JSON.stringify(additionalClients)){
      setError("Project clients changed while this dialog was open. Reopen it to see the latest selection.");
      return;
    }
    savingRef.current=true;setSaving(true);setError("");
    try{updateProject(project.id,{additionalClients});await flushWorkspaceChanges();onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to save project clients.");}
    finally{savingRef.current=false;setSaving(false);}
  }
  return <dialog ref={dialog} className="client-project-dialog project-clients-dialog" aria-labelledby="project-clients-title" onCancel={event=>{event.preventDefault();if(!savingRef.current)onClose();}}>
    <header><h2 id="project-clients-title">Manage project clients</h2><button type="button" className="icon-button" aria-label="Close project clients" disabled={saving} onClick={onClose}><X size={18}/></button></header>
    <p>Linked clients can view this project and its shared messages. Billing stays with the primary client.</p>
    <div className="project-primary-client"><small>Primary / billing client</small><strong>{primary?.companyName||primary?.name||"No primary client"}</strong>{primary?.email&&<span>{primary.email}</span>}</div>
    <form onSubmit={submit}><fieldset disabled={saving||loading}><legend>Additional clients</legend>
      {clients.length?<div className="project-clients-list">{clients.map(client=>{const key=projectClientKey(client);return <label key={key}><input type="checkbox" checked={selected.has(key)} onChange={event=>setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(key);else next.delete(key);return next;})}/><span><strong>{client.companyName||client.name}</strong><small>{[client.companyName?client.name:"",client.email,!client.clientId?"Contact only":""].filter(Boolean).join(" · ")}</small></span></label>;})}</div>:<p>{loading ? "Loading client directory…" : "No other clients are available."}</p>}
    </fieldset>{error&&<div className="form-error" role="alert">{error}{loading&&<button type="button" className="button button-quiet" onClick={()=>{setError("");setAttempt(value=>value+1);}}>Retry</button>}</div>}<div className="form-actions"><button type="button" className="button button-quiet" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving||loading}>{saving?"Saving…":"Save clients"}</button></div></form>
  </dialog>;
}
