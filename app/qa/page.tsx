"use client";
import {QaProjectPicker} from "@/app/_components/qa-project-picker";
import {ReportImageUpload} from "@/app/_components/report-image-upload";
import type {CompressedImage} from "@/lib/image-compression";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Bug,FolderOpen,Image as ImageIcon,Plus,Trash2,X} from "lucide-react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {getProjectClientLabel,getProjectDisplayTitle,isProjectAssignedToUser,readProjects,type Project} from "@/lib/projects";
import {deleteResolvedQaReport,setQaStatus,qaKindLabels,readQaReports,saveQaReport,type QaKind,type QaReport} from "@/lib/qa";
import {createUuid} from "@/lib/uuid";

function QaForm({projects,onClose,onSaved}:{projects:Project[];onClose:()=>void;onSaved:()=>void}){
 const {role,user,members}=useWorkspaceAuth();
 const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false),pending=useRef<Parameters<typeof saveQaReport>[0]|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[projectId,setProjectId]=useState("");
 const [image,setImage]=useState<CompressedImage|null>(null),[imageBusy,setImageBusy]=useState(false);
 const employee=role==="employee",name=members.find(member=>member.user_id===user?.id)?.display_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"";
 const options=employee?projects.filter(project=>isProjectAssignedToUser(project,user?.id,name)):projects;
 useEffect(()=>{const node=dialog.current;const previous=document.activeElement;node?.showModal();return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving.current||imageBusy)return;
  const data=new FormData(event.currentTarget);saving.current=true;setBusy(true);setError("");
  try{
   if(!pending.current){
    if(!String(data.get("title")||"").trim()||!String(data.get("details")||"").trim())throw new Error("Enter a title and details for the report.");
    if(projectId&&!options.some(project=>project.id===projectId))throw new Error("Choose an available project.");
    pending.current={id:createUuid(),kind:data.get("kind") as QaKind,title:String(data.get("title")||""),details:String(data.get("details")||""),projectId,imageDataUrl:image?.dataUrl,imageName:image?.name};
   }
   await saveQaReport(pending.current);
   onSaved();onClose();
  }catch(cause){setError(cause instanceof Error?cause.message:"Could not save the report.");}
  finally{saving.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="assign-task-dialog qa-dialog" aria-labelledby="qa-form-title" onCancel={event=>{if(saving.current)event.preventDefault();else onClose();}}>
  <header><div><h2 id="qa-form-title">New QA report</h2><p>Report a bug, change, or improvement.</p></div><button type="button" className="icon-button" aria-label="Close QA form" disabled={busy} onClick={onClose}><X size={18} aria-hidden="true"/></button></header>
  <form onSubmit={submit}><fieldset className="qa-form-fields" disabled={busy||Boolean(pending.current)}>
   <div className="qa-form-row">
    <label className="field">Report type<select name="kind" defaultValue="BUG">{Object.entries(qaKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <QaProjectPicker projects={options} value={projectId} onChange={setProjectId}/>
   </div>
   <label className="field required">Title<input name="title" required maxLength={1000} placeholder="Give your report a short title"/></label>
   <label className="field required">Details<textarea name="details" required rows={5} maxLength={5000} placeholder="Describe what happened or what you would like to improve"/></label>
   <ReportImageUpload value={image} onChange={setImage} onProcessingChange={setImageBusy}/>
  </fieldset>{error&&<p className="form-error qa-form-error" role="alert">{error}</p>}<div className="form-actions qa-form-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy||imageBusy}>{busy?"Saving…":pending.current?"Retry saving":"Save report"}</button></div></form>
 </dialog>;
}
function ReportImageDialog({report,onClose}:{report:QaReport;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current,previous=document.activeElement;node?.showModal();return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="qa-image-dialog" aria-label="Report image" onCancel={onClose}><header><h2>{report.title}</h2><button type="button" className="icon-button" aria-label="Close image" onClick={onClose}><X size={18} aria-hidden="true"/></button></header><img src={report.image_data_url!} alt={`Image for ${report.title}`}/><a className="button button-quiet" href={report.image_data_url!} download={report.image_name||"report-image.webp"}>Download image</a></dialog>;
}
export default function QaPage(){
 const {role,user}=useWorkspaceAuth();const [projects,setProjects]=useState<Project[]>([]),[reports,setReports]=useState<QaReport[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[form,setForm]=useState(false);
 const [busyId,setBusyId]=useState<string|null>(null);
 const busy=useRef(false);
 const canManage=role==="admin"||role==="project_manager";
 const [preview,setPreview]=useState<QaReport|null>(null);
 const internal=role==="admin"||role==="project_manager"||role==="employee";
 async function refresh(){try{setError("");setReports(await readQaReports());}catch(cause){setError(cause instanceof Error?cause.message:"Could not load QA reports.");}finally{setLoading(false);}}
 useEffect(()=>{if(!internal)return;void refresh();const update=()=>setProjects(readProjects());update();window.addEventListener("evecture:projects-updated",update);return()=>{window.removeEventListener("evecture:projects-updated",update);};},[internal,user?.id]);
 async function changeStatus(report:QaReport,status:"OPEN"|"RESOLVED"){
  if(!canManage||busy.current)return;busy.current=true;setBusyId(report.id);setError("");
  try{await setQaStatus(report.id,status);setReports(items=>items.map(item=>item.id===report.id?{...item,status}:item));}catch(cause){setError(cause instanceof Error?cause.message:"Could not update the status.");}finally{busy.current=false;setBusyId(null);}
 }
 async function removeReport(report:QaReport){
  if(!canManage||report.status!=="RESOLVED"||busy.current)return;
  if(!window.confirm(`Delete “${report.title}”? This permanently removes the resolved report and its image.`))return;
  busy.current=true;setBusyId(report.id);setError("");try{await deleteResolvedQaReport(report.id);setReports(items=>items.filter(item=>item.id!==report.id));}catch(cause){setError(cause instanceof Error?cause.message:"Could not delete the report.");}finally{busy.current=false;setBusyId(null);}
 }
 if(!internal)return null;
 return <div className="page-content qa-page"><section className="welcome-row qa-page-heading"><div><h1>QA</h1><p className="welcome-subtitle">Report bugs, changes, and improvements.</p></div><button type="button" className="button button-primary" onClick={()=>setForm(true)}><Plus size={16}/>New report</button></section>
  {error&&<p className="form-error" role="alert">{error} <button type="button" className="button button-quiet" onClick={()=>void refresh()}>Retry</button></p>}
  {loading?<p role="status">Loading reports…</p>:reports.length===0&&!error?<section className="panel qa-empty"><Bug size={28} strokeWidth={1.5} aria-hidden="true"/><h2>No reports yet</h2><p>Report a bug, request a change, or share an improvement.</p></section>:<div className="qa-report-list">{reports.map(report=>{
   const project=projects.find(project=>project.id===report.project?.external_id);
   const projectName=project?getProjectDisplayTitle(project):report.project?.title||report.project?.external_id;
   const organization=project?getProjectClientLabel(project):report.project?.client_company;
   const status=report.status||"OPEN";
   return <article key={report.id} className="panel qa-report"><header className="qa-report-header"><span className="qa-report-kind">{qaKindLabels[report.kind]}</span>{canManage?<label className="qa-report-status">Status<select aria-label={`Status for ${report.title}`} value={status} disabled={busyId!==null} onChange={event=>void changeStatus(report,event.target.value as "OPEN"|"RESOLVED")}><option value="OPEN">Open</option><option value="RESOLVED">Resolved</option></select></label>:<span>{status==="RESOLVED"?"Resolved":"Open"}</span>}</header>
    <div className="qa-report-content"><div className="qa-report-copy"><section><span className="qa-section-label">Title</span><h2>{report.title}</h2></section><section><span className="qa-section-label">Details</span><p className="qa-report-details">{report.details}</p></section></div>{report.image_data_url&&<aside className="qa-report-attachment"><span className="qa-section-label">Attachment</span><button type="button" className="button button-quiet" aria-label={`View image for ${report.title}`} onClick={()=>setPreview(report)}><ImageIcon size={16}/>View image</button></aside>}</div>
    <footer><div className="qa-report-project"><span className="qa-section-label">Project</span>{report.project?<><Link href={`/projects/${report.project.external_id}`}><FolderOpen size={14} aria-hidden="true"/>{projectName}</Link>{organization&&<small>{organization}</small>}</>:<span>General report</span>}</div>{canManage&&status==="RESOLVED"&&<button type="button" className="button button-quiet" disabled={busyId!==null} onClick={()=>void removeReport(report)}><Trash2 size={14}/>Delete</button>}</footer></article>;
  })}</div>}
  {preview&&<ReportImageDialog report={preview} onClose={()=>setPreview(null)}/>}
  {form&&<QaForm projects={projects} onClose={()=>setForm(false)} onSaved={()=>void refresh()}/>}
 </div>;
}
