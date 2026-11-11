"use client";
import {ReportImageUpload} from "@/app/_components/report-image-upload";
import type {CompressedImage} from "@/lib/image-compression";
import {readGeneralTasks} from "@/lib/general-tasks";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Bug,FolderOpen,Plus,X} from "lucide-react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {getProjectDisplayTitle,isProjectAssignedToUser,readProjects,type Project,type ProjectWorkItem} from "@/lib/projects";
import {qaKindLabels,readQaReports,saveQaReport,type QaKind,type QaReport} from "@/lib/qa";
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
  <header><div><h2 id="qa-form-title">New QA report</h2><p>Report a bug, change, or improvement.</p></div><button type="button" className="icon-button" aria-label="Close QA form" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  <form onSubmit={submit}><fieldset className="qa-form-fields" disabled={busy||Boolean(pending.current)}>
   <div className="qa-form-row">
    <label className="field">Report type<select name="kind" defaultValue="BUG">{Object.entries(qaKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="field">Project (optional)<select aria-label="Project" value={projectId} onChange={event=>setProjectId(event.target.value)}><option value="">General report</option>{options.map(project=><option key={project.id} value={project.id}>{getProjectDisplayTitle(project)}</option>)}</select></label>
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
 return <dialog ref={dialog} className="qa-image-dialog" aria-label="Report image" onCancel={onClose}><header><h2>{report.title}</h2><button type="button" className="icon-button" aria-label="Close image" onClick={onClose}><X size={18}/></button></header><img src={report.image_data_url!} alt={`Image for ${report.title}`}/><a className="button button-quiet" href={report.image_data_url!} download={report.image_name||"report-image.webp"}>Download image</a></dialog>;
}
export default function QaPage(){
 const {role,user}=useWorkspaceAuth();const [projects,setProjects]=useState<Project[]>([]),[reports,setReports]=useState<QaReport[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[form,setForm]=useState(false);
 const [generalTasks,setGeneralTasks]=useState<ProjectWorkItem[]>([]);
 const [preview,setPreview]=useState<QaReport|null>(null);
 const internal=role==="admin"||role==="project_manager"||role==="employee";
 async function refresh(){try{setError("");setReports(await readQaReports());}catch(cause){setError(cause instanceof Error?cause.message:"Could not load QA reports.");}finally{setLoading(false);}}
 useEffect(()=>{if(!internal)return;void refresh();const update=()=>{setProjects(readProjects());setGeneralTasks(readGeneralTasks());};update();window.addEventListener("evecture:projects-updated",update);window.addEventListener("evecture:general-tasks-updated",update);return()=>{window.removeEventListener("evecture:projects-updated",update);window.removeEventListener("evecture:general-tasks-updated",update);};},[internal,user?.id]);
 if(!internal)return null;
 return <div className="page-content qa-page"><section className="welcome-row qa-page-heading"><div><h1>QA</h1><p className="welcome-subtitle">Report bugs, changes, and improvements.</p></div><button type="button" className="button button-primary" onClick={()=>setForm(true)}><Plus size={16}/>New report</button></section>
  {error&&<p className="form-error" role="alert">{error} <button type="button" className="button button-quiet" onClick={()=>void refresh()}>Retry</button></p>}
  {loading?<p role="status">Loading reports…</p>:reports.length===0&&!error?<section className="panel qa-empty"><Bug size={28} strokeWidth={1.5} aria-hidden="true"/><h2>No reports yet</h2><p>Report a bug, request a change, or share an improvement.</p></section>:<div className="qa-report-list">{reports.map(report=>{
   const project=projects.find(project=>project.id===report.project?.external_id),task=(project?.workItems||generalTasks).find(task=>task.id===report.task?.external_id);
   const status=task?.status||report.task?.status||"OPEN";
   const statusLabel:Record<string,string>={OPEN:"Open",TO_DO:"To do",IN_PROGRESS:"In progress",BLOCKED:"Blocked",UNDER_REVIEW:"In review",DONE:"Completed"};
   return <article key={report.id} className="panel qa-report"><div className="qa-report-meta"><span>{qaKindLabels[report.kind]}</span><span>{statusLabel[status]||status.replaceAll("_"," ")}</span></div><h2>{report.title}</h2><p className="qa-report-details">{report.details}</p>{report.image_data_url&&<button type="button" className="qa-report-image" aria-label={`View image for ${report.title}`} onClick={()=>setPreview(report)}><img src={report.image_data_url} alt={`Image for ${report.title}`} loading="lazy"/><span>View image</span></button>}<footer>{report.project?<Link href={`/projects/${report.project.external_id}`}><FolderOpen size={14} aria-hidden="true"/>{project?getProjectDisplayTitle(project):report.project.external_id}</Link>:<span>General report</span>}{report.task?<Link href="/work">Task · {task?.assignee||report.task.assignee_name}</Link>:null}</footer></article>;
  })}</div>}
  {preview&&<ReportImageDialog report={preview} onClose={()=>setPreview(null)}/>}
  {form&&<QaForm projects={projects} onClose={()=>setForm(false)} onSaved={()=>void refresh()}/>}
 </div>;
}
