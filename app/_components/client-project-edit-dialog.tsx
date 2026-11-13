"use client";
import {useState} from "react";
import {EditDetailsDialog} from "@/app/_components/edit-details-dialog";
import {ProjectLogoUpload} from "@/app/_components/project-logo";
import {canEditRecordDetails,parseServiceDetails,validateProjectServiceDetails} from "@/lib/record-editing";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {getProjectDisplayServices,readProjects,updateProject,type Project} from "@/lib/projects";
import {readLeads,updateLead} from "@/lib/leads";
import {readManagedProjects,updateManagedProject} from "@/lib/post-sale";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {operatingCompanies,type OperatingCompany} from "@/lib/companies";
import {SUPPORTED_CURRENCIES} from "@/lib/currency";
import {showToast} from "@/app/_components/toast-hub";

const statuses:Record<Project["status"],string>={ACTIVE:"Active",ON_TRACK:"On track",COMPLETED:"Completed",AMC:"In retainer"};
export function ClientProjectEditDialog({project,onClose}:{project:Project;onClose:()=>void}){
 const {role}=useWorkspaceAuth();
 const [logo,setLogo]=useState(project.logoDataUrl),[processing,setProcessing]=useState(false);
 return <EditDetailsDialog title="Edit associated project" onClose={onClose} processing={processing} fields={[
  {name:"title",label:"Project name",value:project.title,required:true},
  {name:"services",label:"Services (comma separated)",value:getProjectDisplayServices(project)},
  {name:"status",label:"Project status",value:statuses[project.status],options:project.status==="AMC"?[statuses.AMC]:[statuses.ACTIVE,statuses.ON_TRACK,statuses.COMPLETED]},
  {name:"operatingCompany",label:"Operating organization",value:project.operatingCompany||"",required:true,options:["",...operatingCompanies]},
  {name:"contractedValue",label:"Contract value",value:project.contractedValue,type:"number",min:0,required:true},
  {name:"currency",label:"Currency",value:project.currency,required:true,options:[...new Set([...SUPPORTED_CURRENCIES,project.currency].filter(Boolean))]},
 ]} onSave={async values=>{
  if(!canEditRecordDetails(role))throw new Error("You do not have permission to edit projects.");
  const current=readProjects().find(item=>item.id===project.id);
  if(!current)throw new Error("This project no longer exists. Close the form and refresh the client list.");
  const amount=Number(values.contractedValue);
  if(!values.title)throw new Error("Enter a project name.");
  if(!Number.isFinite(amount)||amount<0)throw new Error("Enter a valid contract value.");
  if(!/^[A-Z]{3}$/.test(values.currency))throw new Error("Choose a valid currency.");
  if(!operatingCompanies.includes(values.operatingCompany as OperatingCompany))throw new Error("Choose an operating organization.");
  const status=Object.entries(statuses).find(([,label])=>label===values.status)?.[0] as Project["status"]|undefined;
  if(!status||(status==="AMC"&&current.status!=="AMC")||(current.status==="AMC"&&status!=="AMC"))throw new Error("Change retainer project status from the Retainers page.");
  const services=parseServiceDetails(values.services);
  validateProjectServiceDetails(values.title,services);
  updateProject(current.id,{title:values.title,services,status,operatingCompany:values.operatingCompany as OperatingCompany,contractedValue:amount,currency:values.currency,logoDataUrl:logo,enquiryDetails:{...current.enquiryDetails,projectName:values.title,projectNameOverride:true}});
  if(values.title!==current.title){
   const lead=readLeads().find(item=>item.id===current.leadId);
   if(lead)updateLead(lead.id,{projectName:values.title});
   for(const plan of readManagedProjects().filter(item=>item.sourceProjectId===current.id))updateManagedProject(plan.id,{projectTitle:values.title});
  }
  await flushWorkspaceChanges();showToast({message:"Project details saved."});
 }}><div className="edit-field-wide client-project-logo-editor"><span>Project logo</span><div>{logo&&<img src={logo} alt="Project logo preview"/>}<ProjectLogoUpload compact value={logo} onChange={setLogo} onProcessingChange={setProcessing}/>{logo&&<button type="button" className="button button-quiet" disabled={processing} onClick={()=>setLogo(undefined)}>Remove logo</button>}</div></div></EditDetailsDialog>;
}
