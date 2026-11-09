import type {WorkspaceRole} from "@/lib/roles";
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

export function linkedCustomerLeadIds(customer: {email?:string;projects:{id:string}[]}, projects:{id:string;leadId:string}[], leads:{id:string;email:string;projectId?:string}[]): string[] {
 const projectIds=new Set(customer.projects.map(project=>project.id));
 const leadIds=new Set(projects.filter(project=>projectIds.has(project.id)).map(project=>project.leadId).filter(Boolean));
 const email=customer.email?.trim().toLowerCase();
 return leads.filter(lead=>leadIds.has(lead.id)||(!!lead.projectId&&projectIds.has(lead.projectId))||(!!email&&lead.email.trim().toLowerCase()===email)).map(lead=>lead.id);
}

export function validateProjectServiceDetails(title: string, services: string[]) {
  const names=new Set(['branding','website','e-commerce','ui/ux','crm','custom request']);
  const titleServices=title.split(/\s*(?:,|&|\+|\band\b)\s*/i).map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(titleServices.length&&titleServices.every(value=>names.has(value))){
    const selected=services.map(value=>value.toLowerCase()).sort().join('|');
    if([...new Set(titleServices)].sort().join('|')!==selected)throw new Error("The service-only project title and selected services must match. Update the title or services to describe the same work.");
  }
}
