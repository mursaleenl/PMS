"use client";
import {QaProjectPicker} from "@/app/_components/qa-project-picker";
import {ReportImageUpload} from "@/app/_components/report-image-upload";
import type {CompressedImage} from "@/lib/image-compression";
import Link from "next/link";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {ArrowUpRight,Bug,FolderOpen,Image as ImageIcon,Pencil,Plus,Trash2,X} from "lucide-react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {getProjectClientLabel,getProjectDisplayTitle,isProjectAssignedToUser,readProjects,type Project} from "@/lib/projects";
import {deleteResolvedQaReport,editQaReport,setQaAssignee,setQaStatus,qaKindLabels,readQaReports,saveQaReport,type QaKind,type QaReport} from "@/lib/qa";
import {useAssignableUsers, type AssignableUser} from "@/lib/assignees";
import {GENERAL_TASKS_ID} from "@/lib/general-tasks";
import {createUuid} from "@/lib/uuid";

function QaForm({projects,report,onClose,onSaved}:{projects:Project[];report?:QaReport;onClose:()=>void;onSaved:()=>void}){
 const {role,user,members}=useWorkspaceAuth();
 const dialog=useRef<HTMLDialogElement>(null),saving=useRef(false),pending=useRef<Parameters<typeof saveQaReport>[0]|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[projectId,setProjectId]=useState(report?.project?.external_id||"");
 const [image,setImage]=useState<CompressedImage|null>(()=>report?.image_data_url?{dataUrl:report.image_data_url,name:report.image_name||"report-image.webp",bytes:Math.floor((report.image_data_url.split(",")[1]?.replace(/=+$/,"").length||0)*3/4),width:0,height:0}:null),[imageBusy,setImageBusy]=useState(false);
 const linkedTask=Boolean(report?.task||report?.task_id||report?.general_task_id);
 const employee=role==="employee",name=members.find(member=>member.user_id===user?.id)?.display_name||user?.user_metadata?.full_name||user?.email?.split("@")[0]||"";
 const options=employee?projects.filter(project=>isProjectAssignedToUser(project,user?.id,name)):projects;
 useEffect(()=>{const node=dialog.current;const previous=document.activeElement;node?.showModal();return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving.current||imageBusy)return;
  const data=new FormData(event.currentTarget);saving.current=true;setBusy(true);setError("");
  try{
   if(report&&role!=="admin"&&role!=="project_manager")throw new Error("Only administrators and project managers can edit QA reports.");
   if(!pending.current){
    if(!String(data.get("title")||"").trim()||!String(data.get("details")||"").trim())throw new Error("Enter a title and details for the report.");
    if(projectId&&!options.some(project=>project.id===projectId))throw new Error("Choose an available project.");
    pending.current={id:report?.id||createUuid(),kind:data.get("kind") as QaKind,title:String(data.get("title")||""),details:String(data.get("details")||""),projectId,imageDataUrl:image?.dataUrl,imageName:image?.name};
   }
   await (report?editQaReport:saveQaReport)(pending.current);
   onSaved();onClose();
  }catch(cause){if(report)pending.current=null;setError(cause instanceof Error?cause.message:"Could not save the report.");}
  finally{saving.current=false;setBusy(false);}
 }
 return <dialog ref={dialog} className="assign-task-dialog qa-dialog" aria-labelledby="qa-form-title" onCancel={event=>{if(saving.current)event.preventDefault();else onClose();}}>
  <header><div><h2 id="qa-form-title">{report?"Edit QA report":"New QA report"}</h2><p>{report?"Update the report details and attachment.":"Report a bug, change, or improvement."}</p></div><button type="button" className="icon-button" aria-label="Close QA form" disabled={busy} onClick={onClose}><X size={18} aria-hidden="true"/></button></header>
  <form onSubmit={submit}><fieldset className="qa-form-fields" disabled={busy||Boolean(pending.current)}>
   <div className="qa-form-row">
    <label className="field">Report type<select name="kind" defaultValue={report?.kind||"BUG"}>{Object.entries(qaKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <QaProjectPicker projects={options} value={projectId} onChange={setProjectId} disabled={linkedTask}/>
   </div>
   {linkedTask&&<small>The project is fixed because this report is linked to a task.</small>}
   <label className="field required">Title<input name="title" defaultValue={report?.title} required maxLength={1000} placeholder="Give your report a short title"/></label>
   <label className="field required">Details<textarea name="details" defaultValue={report?.details} required rows={5} maxLength={5000} placeholder="Describe what happened or what you would like to improve"/></label>
   <ReportImageUpload value={image} onChange={setImage} onProcessingChange={setImageBusy}/>
  </fieldset><div className="form-actions qa-form-actions">{error&&<p className="form-error qa-form-error" role="alert">{error}</p>}<div className="qa-form-buttons"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy||imageBusy}>{busy?"Saving…":pending.current?"Retry saving":report?"Save changes":"Save report"}</button></div></div></form>
 </dialog>;
}
function ReportImageDialog({report,onClose}:{report:QaReport;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=dialog.current,previous=document.activeElement;node?.showModal();return()=>{node?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
 return <dialog ref={dialog} className="qa-image-dialog" aria-label="Report image" onCancel={onClose}><header><h2>{report.title}</h2><button type="button" className="icon-button" aria-label="Close image" onClick={onClose}><X size={18} aria-hidden="true"/></button></header><img src={report.image_data_url!} alt={`Image for ${report.title}`}/><a className="button button-quiet" href={report.image_data_url!} download={report.image_name||"report-image.webp"}>Download image</a></dialog>;
}
type QaStatus = NonNullable<QaReport["status"]>;
const qaStatuses: Record<QaStatus, { label: string }> = {
  OPEN: { label: "Open" },
  UNDER_REVIEW: { label: "Under review" },
  RESOLVED: { label: "Resolved" },
};

function ReportStatus({ status }: { status: QaStatus }) {
  return <span className="qa-status-text" data-status={status}>{qaStatuses[status].label}</span>;
}

function reportProject(report: QaReport, projects: Project[]) {
  const project = projects.find(item => item.id === report.project?.external_id);
  return {
    title: project ? getProjectDisplayTitle(project) : report.project?.title || report.project?.external_id || "General report",
    organization: project ? getProjectClientLabel(project) : report.project?.client_company,
  };
}

function ReportDetails({ report, projects, canManage, users, onAssign, busy, error, onClose, onStatus, onEdit, onDelete, onImage }: {
  report: QaReport;
  projects: Project[];
  canManage: boolean;
  users: AssignableUser[];
  onAssign: (id:string|null) => void;
  busy: boolean;
  error: string;
  onClose: () => void;
  onStatus: (status: QaStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  onImage: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const {role, user} = useWorkspaceAuth();
  const assignee = users.find(person => person.id && person.id === report.assignee_id);
  const { title, organization } = reportProject(report, projects);
  const status = report.status ?? "OPEN";
  const projectHref = report.project ? `/projects/${encodeURIComponent(report.project.external_id)}` : "";
  const taskId = report.task ? encodeURIComponent(report.task.external_id) : "";
  const taskHref = report.general_task_id
    ? `/work?project=${GENERAL_TASKS_ID}&task=${taskId}`
    : `${projectHref}?tab=tasks&task=${taskId}`;

  return <dialog ref={dialog} className="qa-dialog qa-detail-dialog" aria-labelledby="qa-report-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header>
      <div>
        <div className="qa-card-meta"><span>{qaKindLabels[report.kind]}</span><ReportStatus status={status} /></div>
        <h2 id="qa-report-title">{report.title}</h2>
      </div>
      <button type="button" className="icon-button" aria-label="Close report" disabled={busy} onClick={onClose}><X size={18} /></button>
    </header>
    <div className="qa-detail-body">
      <section>
        <h3>Details</h3>
        <div className="qa-report-details">{report.details.split(/\n\s*\n/).map((paragraph,index) => <p key={index}>{paragraph}</p>)}</div>
      </section>
      <dl className="qa-detail-meta">
        <div><dt>Project</dt><dd>{projectHref ? <Link href={projectHref}>{title}</Link> : title}{organization && <small>{organization}</small>}</dd></div>
        {report.task && <div><dt>Linked task</dt><dd>
          {projectHref || report.general_task_id ? <Link href={taskHref}>{report.task.external_id}</Link> : report.task.external_id}
          {report.task.assignee_name && <small>Assigned to {report.task.assignee_name}</small>}
        </dd></div>}
        {report.created_at && <div><dt>Reported</dt><dd><time dateTime={report.created_at}>{new Date(report.created_at).toLocaleDateString()}</time></dd></div>}
      </dl>
      {report.image_data_url && <button type="button" className="button button-quiet" onClick={onImage}><ImageIcon size={15} />View attachment</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <footer className="qa-detail-actions">
      {canManage && status === "OPEN" ? <label className="qa-report-status">Assigned to
        <select aria-label="Assigned to" value={report.assignee_id || ""} disabled={busy} onChange={event => onAssign(event.target.value || null)}>
          <option value="">Unassigned</option>
          {users.filter(person => person.id).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
      </label> : <span>Assigned to {assignee?.name || (report.assignee_id === user?.id ? "you" : report.assignee_id ? "team member" : "no one")}</span>}
      <div>
        {report.assignee_id === user?.id && report.assignee_id && status === "OPEN" && <button className="button button-primary" disabled={busy} onClick={() => onStatus("UNDER_REVIEW")}>Submit for review</button>}
        {role === "admin" && (status === "UNDER_REVIEW" || (status === "OPEN" && !report.assignee_id)) && <button className="button button-primary" disabled={busy} onClick={() => onStatus("RESOLVED")}>{status === "UNDER_REVIEW" ? "Approve completion" : "Resolve report"}</button>}
        {role === "admin" && status !== "OPEN" && <button className="button button-quiet" disabled={busy} onClick={() => onStatus("OPEN")}>{status === "UNDER_REVIEW" ? "Request changes" : "Reopen"}</button>}
        {canManage && <button type="button" className="button button-quiet" disabled={busy} onClick={onEdit}><Pencil size={14} />Edit report</button>}
        {canManage && status === "RESOLVED" && <button type="button" className="button button-quiet" disabled={busy} onClick={onDelete}><Trash2 size={14} />Delete</button>}
      </div>
    </footer>
  </dialog>;
}

export default function QaPage() {
  const { role, user } = useWorkspaceAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<QaReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [form, setForm] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QaReport | null>(null);
  const [preview, setPreview] = useState<QaReport | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const newReportButton = useRef<HTMLButtonElement>(null);
  const canManage = role === "admin" || role === "project_manager";
  const internal = canManage || role === "employee";
  const {users} = useAssignableUsers();
  const [query,setQuery] = useState("");
  const visibleReports = reports.filter(report => {
    const project = reportProject(report, projects);
    const assignee = users.find(person => person.id && person.id === report.assignee_id);
    return [report.title,report.details,qaKindLabels[report.kind],qaStatuses[report.status ?? "OPEN"].label,project.title,project.organization,assignee?.name].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });
  const selected = reports.find(report => report.id === reportId);

  async function refresh() {
    try {
      setError("");
      setReports(await readQaReports());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load QA reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!internal) return;
    void refresh();
    const update = () => setProjects(readProjects());
    update();
    window.addEventListener("evecture:projects-updated", update);
    return () => window.removeEventListener("evecture:projects-updated", update);
  }, [internal, user?.id]);

  async function changeStatus(report: QaReport, status: QaStatus) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setActionError("");
    try {
      await setQaStatus(report.id, status);
      setReports(items => items.map(item => item.id === report.id ? { ...item, status } : item));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not update the status.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function assign(report: QaReport, id:string|null) {
    if (!canManage || busy.current) return;
    busy.current = true;
    setSaving(true);
    setActionError("");
    try {
      await setQaAssignee(report.id,id);
      setReports(items => items.map(item => item.id === report.id ? {...item,assignee_id:id} : item));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not assign report.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function removeReport(report: QaReport) {
    if (!canManage || report.status !== "RESOLVED" || busy.current) return;
    if (!window.confirm(`Delete “${report.title}”? This permanently removes the resolved report and its image.`)) return;
    busy.current = true;
    setSaving(true);
    setActionError("");
    try {
      await deleteResolvedQaReport(report.id);
      setReportId(null);
      setReports(items => items.filter(item => item.id !== report.id));
      requestAnimationFrame(() => newReportButton.current?.focus());
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not delete the report.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  if (!internal) return null;

  return <div className="page-content qa-page">
    <section className="welcome-row qa-page-heading">
      <div><h1>QA</h1><p className="welcome-subtitle">Report bugs, changes, and improvements.</p></div>
      <button ref={newReportButton} type="button" className="button button-primary" onClick={() => setForm(true)}><Plus size={16} />New report</button>
    </section>
    <input type="search" className="qa-report-search" placeholder="Search reports, projects, or people" aria-label="Search QA reports" value={query} onChange={event => setQuery(event.target.value)} />
    <ul className="qa-status-legend" aria-label="QA status legend">
      {Object.keys(qaStatuses).map((status) => <li key={status} data-status={status}>
        <span className="qa-status-swatch" aria-hidden="true" />
        <ReportStatus status={status as QaStatus} />
      </li>)}
    </ul>
    {error && <p className="form-error" role="alert">{error} <button type="button" className="button button-quiet" onClick={() => void refresh()}>Retry</button></p>}
    {loading ? <p role="status">Loading reports…</p> : reports.length === 0 && !error
      ? <section className="panel qa-empty"><Bug size={28} strokeWidth={1.5} aria-hidden="true" /><h2>No reports yet</h2><p>Report a bug, request a change, or share an improvement.</p></section>
      : !visibleReports.length && !error ? <p>No matching reports.</p> : <div className="qa-report-grid">{visibleReports.map(report => {
        const project = reportProject(report, projects);
        return <button key={report.id} type="button" className="qa-report" aria-description={qaStatuses[report.status ?? "OPEN"].label} data-status={report.status ?? "OPEN"} aria-haspopup="dialog"
          onClick={() => { setActionError(""); setReportId(report.id); }}>
          <span className="qa-card-meta">{qaKindLabels[report.kind]}</span>
          <strong className="qa-card-title">{report.title}</strong>
          <span className="qa-card-project"><FolderOpen size={15} aria-hidden="true" /><span className="qa-card-identity"><span>{project.title}</span>{project.organization && <small>{project.organization}</small>}</span><ArrowUpRight size={15} aria-hidden="true" /></span>
        </button>;
      })}</div>}
    {selected && <ReportDetails key={selected.id} report={selected} projects={projects} canManage={canManage} users={users} onAssign={id => void assign(selected,id)} busy={saving} error={actionError}
      onClose={() => setReportId(null)} onStatus={status => void changeStatus(selected, status)}
      onEdit={() => setEditing(selected)} onDelete={() => void removeReport(selected)} onImage={() => setPreview(selected)} />}
    {preview && <ReportImageDialog report={preview} onClose={() => setPreview(null)} />}
    {form && <QaForm projects={projects} onClose={() => setForm(false)} onSaved={() => void refresh()} />}
    {canManage && editing && <QaForm projects={projects} report={editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}
  </div>;
}
