"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {canEditRecordDetails} from "@/lib/record-editing";
export type DetailField={name:string;label:string;value?:string|number;type?:"text"|"email"|"url"|"date"|"number"|"textarea";required?:boolean;options?:string[];min?:number;max?:number};
export function EditDetailsDialog({title,fields,onSave,onClose}:{title:string;fields:DetailField[];onSave:(values:Record<string,string>)=>Promise<void>;onClose:()=>void}){
 const {role}=useWorkspaceAuth();
 const dialog=useRef<HTMLDialogElement>(null);
 const savingRef=useRef(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const previous=document.activeElement;dialog.current?.showModal();return()=>{if(previous instanceof HTMLElement && previous.isConnected)previous.focus();};},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(savingRef.current)return;
  if(!canEditRecordDetails(role)){setError("You do not have permission to edit these details.");return;}
  const data=new FormData(event.currentTarget);
  const values=Object.fromEntries(fields.map(field=>[field.name,String(data.get(field.name)??"").trim()]));
  savingRef.current=true;setSaving(true);setError("");
  try{await onSave(values);onClose();}catch(cause){setError(cause instanceof Error?cause.message:"Unable to save changes. Please retry.");}finally{savingRef.current=false;setSaving(false);}
 }
 return <dialog ref={dialog} aria-label={title} onCancel={event=>{event.preventDefault();if(!savingRef.current)onClose();}} style={{width:"min(680px, calc(100vw - 32px))",maxHeight:"85vh",overflowY:"auto",padding:24,border:"1px solid #e2e8f0",background:"#fff",color:"#0f172a"}}>
 <h2 style={{marginTop:0}}>{title}</h2><form onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:"grid",gap:14}}>
 {fields.map(field=><label className="field" key={field.name}>{field.label}{field.options?<select aria-label={field.label} name={field.name} defaultValue={field.value??""} required={field.required}>{field.options.map(option=><option key={option} value={option}>{option||"Not set"}</option>)}</select>:field.type==="textarea"?<textarea aria-label={field.label} name={field.name} defaultValue={field.value??""} rows={4} required={field.required}/>:<input aria-label={field.label} name={field.name} defaultValue={field.value??""} type={field.type??"text"} required={field.required} min={field.min} max={field.max} step={field.type==="number"?"any":undefined}/>}</label>)}
 </fieldset>{error&&<p role="alert">{error}</p>}<div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}><button type="button" className="button button-quiet" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving?"Saving…":"Save changes"}</button></div></form></dialog>;
}
