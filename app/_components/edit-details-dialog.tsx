"use client";
import {useEffect,useId,useRef,useState,type FormEvent} from "react";
import {X} from "lucide-react";
import {CalendarPicker} from "@/app/_components/calendar-picker";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {canEditRecordDetails} from "@/lib/record-editing";
export type DetailField={name:string;label:string;value?:string|number;type?:"text"|"email"|"url"|"date"|"datetime"|"number"|"textarea";required?:boolean;options?:string[];min?:number;max?:number};
export function EditDetailsDialog({title,fields,onSave,onClose}:{title:string;fields:DetailField[];onSave:(values:Record<string,string>)=>Promise<void>;onClose:()=>void}){
 const {role}=useWorkspaceAuth();
 const dialog=useRef<HTMLDialogElement>(null),prefix=useId();
 const savingRef=useRef(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 useEffect(()=>{const previous=document.activeElement;dialog.current?.showModal();const overflow=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=overflow;if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(savingRef.current)return;
  if(!canEditRecordDetails(role)){setError("You do not have permission to edit these details.");return;}
  const data=new FormData(event.currentTarget);
  const values=Object.fromEntries(fields.map(field=>[field.name,String(data.get(field.name)??"").trim()]));
  savingRef.current=true;setSaving(true);setError("");
  try{await onSave(values);onClose();}catch(cause){setError(cause instanceof Error?cause.message:"Unable to save changes. Please retry.");}finally{savingRef.current=false;setSaving(false);}
 }
 return <dialog ref={dialog} className="edit-details-dialog" aria-label={title} onCancel={event=>{event.preventDefault();if(!savingRef.current)onClose();}}>
  <header className="edit-details-heading"><div><span className="section-kicker">Workspace details</span><h2>{title}</h2></div><button type="button" className="edit-details-close" aria-label="Close edit details" disabled={saving} onClick={onClose}><X size={19}/></button></header>
  <form onSubmit={submit}>
   <fieldset className="edit-details-fields" disabled={saving}>
    {fields.map(field=>{const id=`${prefix}-${field.name}`;return <div className={`field ${field.type==="textarea"||["title","services","companyName","clientCompany"].includes(field.name)?"edit-field-wide":""}`} key={field.name}>
      <label htmlFor={id}>{field.label}{field.required&&<span aria-hidden="true"> *</span>}</label>
      {field.options?<select id={id} aria-label={field.label} name={field.name} defaultValue={field.value??""} required={field.required}>{field.options.map(option=><option key={option} value={option}>{option||"Not set"}</option>)}</select>
      :field.type==="textarea"?<textarea id={id} aria-label={field.label} name={field.name} defaultValue={field.value??""} rows={3} required={field.required}/>
      :field.type==="date"||field.type==="datetime"?<CalendarPicker id={id} ariaLabel={field.label} name={field.name} defaultValue={String(field.value??"")} mode={field.type==="datetime"?"datetime":"date"} required={field.required} disabled={saving}/>
      :<input id={id} aria-label={field.label} name={field.name} defaultValue={field.value??""} type={field.type??"text"} required={field.required} min={field.min} max={field.max} step={field.type==="number"?"any":undefined}/>}
    </div>;})}
   </fieldset>
   {error&&<p className="edit-details-error" role="alert">{error}</p>}
   <footer className="edit-details-actions"><button type="button" className="button button-quiet" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving?"Saving…":"Save changes"}</button></footer>
  </form>
 </dialog>;
}
