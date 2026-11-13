"use client";
import {useEffect,useRef,useState} from "react";
import {deleteClientProfile} from "@/lib/client-deletion";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {canEditRecordDetails} from "@/lib/record-editing";
export function DeleteClientDialog({client,onClose,onDeleted}:{client:Parameters<typeof deleteClientProfile>[0];onClose:()=>void;onDeleted:()=>void}){
 const {role}=useWorkspaceAuth();const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const previous=document.activeElement,node=dialog.current;node?.showModal();return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="edit-details-dialog delete-client-dialog" aria-label="Delete client" onCancel={event=>{event.preventDefault();if(!saving.current)onClose();}}>
  <header className="edit-details-heading"><h2>Delete client</h2></header>
  <div className="delete-client-copy"><p>Delete <strong>{client.name}</strong> from Clients?</p><p>This removes the client profile and its shared-client links. Projects, leads, managed plans, and invoices are kept.</p></div>
  {error&&<p className="edit-details-error" role="alert">{error}</p>}
  <footer className="edit-details-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-primary" disabled={busy} onClick={async()=>{
   if(saving.current)return;if(!canEditRecordDetails(role)){setError("You do not have permission to delete clients.");return;}
   saving.current=true;setBusy(true);setError("");
   try{await deleteClientProfile(client);onDeleted();onClose();}catch(cause){setError(cause instanceof Error?cause.message:"Could not delete the client.");}finally{saving.current=false;setBusy(false);}
  }}>{busy?"Deleting…":"Delete client"}</button></footer>
 </dialog>;
}
