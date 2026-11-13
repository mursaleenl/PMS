import type {WorkspaceRole} from "@/lib/roles";
import {clientContactMatches} from "@/lib/client-identity";
export function canEditRecordDetails(role: WorkspaceRole | undefined | null) {
  return role === "admin" || role === "project_manager";
}
export function parseServiceDetails(value: string): string[] {
  const seen=new Set<string>();
  return value.split(/[,\n]/).map(item=>item.trim()).filter(item=>{
    const key=item.toLowerCase();
    if(!key || key==='multiple' || seen.has(key))return false;
    seen.add(key);return true;
  });
}

export function linkedCustomerLeadIds(customer: {name?:string;contactName?:string;companyName?:string;organizations?:string[];email?:string;projects:{id:string}[]}, projects:{id:string;leadId:string;clientName?:string;clientEmail?:string;clientCompany?:string;additionalClients?:{name:string;companyName?:string;email?:string}[]}[], leads:{id:string;email:string;projectId?:string;fullName?:string;companyName?:string}[]): string[] {
 const matches=(client:{name?:string;companyName?:string;email?:string})=>clientContactMatches(customer,client);
 const projectIds=new Set(customer.projects.map(project=>project.id).filter(id=>{
  const project=projects.find(project=>project.id===id);
  return !project?.additionalClients?.some(matches)||matches({name:project.clientName,email:project.clientEmail,companyName:project.clientCompany});
 }));
 const leadIds=new Set(projects.filter(project=>projectIds.has(project.id)).map(project=>project.leadId).filter(Boolean));
 const email=customer.email?.trim().toLowerCase();
 const exactContact=(lead:typeof leads[number])=>!email&&matches({name:lead.fullName,companyName:lead.companyName});
 return leads.filter(lead=>leadIds.has(lead.id)||(!!lead.projectId&&projectIds.has(lead.projectId))||(!!email&&lead.email.trim().toLowerCase()===email)||exactContact(lead)).map(lead=>lead.id);
}

export function validateProjectServiceDetails(title: string, services: string[]) {
  const names=new Set(['branding','website','e-commerce','ui/ux','crm','custom request']);
  const titleServices=title.split(/\s*(?:,|&|\+|\band\b)\s*/i).map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(titleServices.length&&titleServices.every(value=>names.has(value))){
    const selected=services.map(value=>value.toLowerCase()).sort().join('|');
    if([...new Set(titleServices)].sort().join('|')!==selected)throw new Error("The service-only project title and selected services must match. Update the title or services to describe the same work.");
  }
}
