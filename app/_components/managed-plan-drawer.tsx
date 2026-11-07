"use client";

import {useState,useRef,type FormEvent} from "react";
import {Plus,Save,X} from "lucide-react";
import {addManagedProject,updateManagedProject,readManagedProjects,nextManagedProjectId,type ManagedProject,type ManagementBillingCycle,type ManagementModel} from "@/lib/post-sale";
import {calculateRetainerEndDate,retainerEndDate} from "@/lib/retainer-dates";
import {isValidDateValue} from "@/lib/dates";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import { getProjectDisplayTitle, getProjectDisplayServices,updateProject,type Project} from "@/lib/projects";

const managementModels:ManagementModel[]=["Annual maintenance","Continuous retainer","Direct-sold software","Ad-hoc support"];
const billingCycles:ManagementBillingCycle[]=["Monthly","Quarterly","Annual"];
function localToday(){const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function displayDate(value?:string){return value?new Date(`${value}T12:00:00`).toLocaleDateString():"Not applicable (one-time)";}

export function ManagedPlanDrawer({projects,onClose,onCreated,initialProjectId,plan}:{
  projects:Project[];onClose:()=>void;onCreated:(item:ManagedProject)=>void;initialProjectId?:string;plan?:ManagedProject;
}) {
  const [sourceId,setSourceId]=useState(plan?.sourceProjectId??initialProjectId??"");
  const [model,setModel]=useState<ManagementModel>(plan?.model??"Annual maintenance");
  const [billingCycle,setBillingCycle]=useState<ManagementBillingCycle>(plan?.billingCycle&&billingCycles.includes(plan.billingCycle)?plan.billingCycle:"Monthly");
  const [periodStart,setPeriodStart]=useState(plan?.periodStart||localToday());
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const pendingPlan=useRef<ManagedProject|null>(plan??null);
  const selectedProject=projects.find(project=>project.id===sourceId);
  const termUnchanged=plan&&plan.periodStart===periodStart&&plan.billingCycle===billingCycle;
  const periodEnd=termUnchanged?retainerEndDate(plan):calculateRetainerEndDate(periodStart,billingCycle);
  const title=plan?"Edit retainer plan":"Add retainer plan";

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    const data=new FormData(event.currentTarget),amount=Number(data.get("amount"));
    if(!Number.isFinite(amount)||amount<=0){setError("Enter an amount greater than zero.");return;}
    if(!isValidDateValue(periodStart)){setError("Choose a valid start date.");return;}
    setBusy(true);setError("");
    try{
      const currentPlan=plan?readManagedProjects().find(item=>item.id===plan.id):undefined;
      if(plan&&(!currentPlan||(JSON.stringify(currentPlan)!==JSON.stringify(plan)&&JSON.stringify(currentPlan)!==JSON.stringify(pendingPlan.current))))throw new Error("This plan changed in another session. Close and reopen it to review the latest details.");
      const existing=readManagedProjects().find(item=>item.sourceProjectId&&item.sourceProjectId===selectedProject?.id);
      if(existing&&existing.id!==pendingPlan.current?.id)throw new Error("This project already has a retainer plan.");
      const item:ManagedProject={
        id:pendingPlan.current?.id??await nextManagedProjectId(),
        sourceProjectId:plan?.sourceProjectId??selectedProject?.id,
        projectTitle:plan?.projectTitle||selectedProject?.title||String(data.get("projectTitle")||"").trim(),
        clientCompany:plan?.clientCompany||selectedProject?.clientCompany||selectedProject?.clientName||String(data.get("clientCompany")||"").trim(),
        model,managementAmount:amount,currency:String(data.get("currency")),billingCycle,periodStart,periodEnd,
        status:plan?.status??"ACTIVE",createdAt:pendingPlan.current?.createdAt??new Date().toISOString(),
      };
      pendingPlan.current=item;
      if(readManagedProjects().some(saved=>saved.id===item.id))updateManagedProject(item.id,item);
      else addManagedProject(item);
      if(!plan&&selectedProject)updateProject(selectedProject.id,{status:"AMC"});
      await flushWorkspaceChanges();onCreated(item);onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:"The plan could not be saved.");}
    finally{setBusy(false);}
  }
  return <div className="task-drawer-backdrop" role="presentation" onMouseDown={event=>{if(!busy&&event.target===event.currentTarget)onClose();}}>
    <aside className="task-dispatch-drawer post-sale-drawer" role="dialog" aria-modal="true" aria-labelledby="managed-plan-title">
      <header><h2 id="managed-plan-title">{title}</h2><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Close form"><X size={18}/></button></header>
      <form onSubmit={submit}>
        {initialProjectId||plan?<div className="post-sale-source-preview"><strong>{selectedProject ? getProjectDisplayTitle(selectedProject) : plan?.clientCompany || plan?.projectTitle}</strong><span>{selectedProject ? getProjectDisplayServices(selectedProject) : plan?.projectTitle}</span></div>:<label className="field">Project<select value={sourceId} onChange={event=>setSourceId(event.target.value)}><option value="">Add a project manually</option>{projects.map(project=><option key={project.id} value={project.id}>{getProjectDisplayTitle(project)} - {getProjectDisplayServices(project) || project.id}</option>)}</select></label>}
        {!selectedProject&&!plan&&<div className="post-sale-project-fields"><label className="field required">Project name<input name="projectTitle" required placeholder="Project name"/></label><label className="field required">Client / company<input name="clientCompany" required placeholder="Client or company"/></label></div>}
        <label className="field required">Plan type<select name="model" value={model} onChange={event=>setModel(event.target.value as ManagementModel)}>{managementModels.map(value=><option key={value}>{value}</option>)}</select></label>
        <div className="post-sale-project-fields">
          <label className="field required">Amount<input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" defaultValue={plan?.managementAmount}/></label>
          <label className="field required">Currency<select name="currency" defaultValue={plan?.currency||selectedProject?.currency||"USD"}>{["USD","INR","EUR","GBP","AED","AUD","CAD"].map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="field required">Billing cycle<select name="billingCycle" value={billingCycle} onChange={event=>setBillingCycle(event.target.value as ManagementBillingCycle)}>{billingCycles.map(value=><option key={value}>{value}</option>)}</select></label>
          <label className="field required">Start date<input name="periodStart" type="date" required value={periodStart} onChange={event=>setPeriodStart(event.target.value)}/></label>
        </div>
        <div className="retainer-period-preview" aria-live="polite"><span>Calculated end date</span><strong>{displayDate(periodEnd)}</strong><small>{"Calculated from the start date: monthly adds 1 month, quarterly adds 3 months, and annual adds 12 months."}</small></div>
        {error&&<p className="form-error" role="alert">{error}</p>}
        <footer><button className="button button-quiet" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{plan?<Save size={14}/>:<Plus size={14}/>} {busy?"Saving…":plan?"Save changes":"Add retainer plan"}</button></footer>
      </form>
    </aside>
  </div>;
}
