import type {Lead} from "@/lib/leads";
import type {ManagedProject} from "@/lib/post-sale";
import type {Project,ProjectClient,ProjectEnquiryDetails} from "@/lib/projects";
import {linkedCustomerLeadIds} from "@/lib/record-editing";
import {clientContactMatches,clientContactName,clientIdentityExists,normalizedClientName} from "@/lib/client-identity";

type Customer={name:string;contactName?:string;companyName?:string;organizations?:string[];email?:string;projects:{id:string}[];managedPlans:{id:string}[]};
const normalize=(value?:string)=>normalizedClientName(value);
export function knownClientIdentities(projects:Project[],leads:Lead[],plans:ManagedProject[]):ProjectClient[]{
 return [
  ...projects.filter(project=>project.projectType!=="internal").flatMap(project=>[...(project.enquiryDetails?.clientDeleted?[]:[{name:project.clientName,companyName:project.clientCompany,email:project.clientEmail}]),...(project.additionalClients||[])]),
  ...leads.filter(lead=>lead.status!=="LOST"&&!lead.qualification?.clientDeleted).map(lead=>({name:lead.fullName,companyName:lead.companyName,email:lead.email})),
  ...plans.filter(plan=>!plan.clientDetails?.deleted).map(plan=>({name:plan.clientDetails?.name||"",companyName:plan.clientCompany,email:plan.clientDetails?.email})),
 ];
}
export function customerOrganizations(customer:Pick<Customer,"companyName"|"organizations">):string[]{
 const values=customer.organizations?.length?customer.organizations:[customer.companyName||""];
 return [...new Map(values.map(value=>[normalize(value),value.trim()])).values()];
}

export function customerEdits(customer:Customer,values:Record<string,string>,projects:Project[],leads:Lead[],plans:ManagedProject[]){
 values={...values,name:clientContactName(values.name)};
 if(!values.name)throw new Error("Client name is required. Enter a name instead of a placeholder.");
 const organizations=customerOrganizations(customer);
 const replacements=organizations.map((name,index)=>({old:name,value:clientContactName(values[index?`organization_${index}`:"companyName"])}));
 const names=replacements.map(item=>normalize(item.value)).filter(Boolean);
 if(new Set(names).size!==names.length)throw new Error("Client exists. Use a different name for each organization.");
 const rename=(company?:string)=>replacements.find(item=>normalize(item.old)===normalize(company))?.value??company??"";
 const details=(original?:ProjectEnquiryDetails):ProjectEnquiryDetails=>({...original,phone:values.phone,designation:values.designation,country:values.country,companyWebsite:values.website,industry:values.industry});
 const matches=(person:ProjectClient)=>clientContactMatches(customer,person);
 const otherClients=knownClientIdentities(projects,leads,plans).filter(person=>!matches(person));
 if(normalizedClientName(values.name)!==normalizedClientName(customer.contactName??customer.name)&&clientIdentityExists({name:values.name},otherClients))throw new Error("Client exists. Use a different client name or select the existing client.");
 for(const replacement of replacements)if(normalizedClientName(replacement.value)!==normalizedClientName(replacement.old)&&clientIdentityExists({companyName:replacement.value},otherClients))throw new Error("Client exists. An organization with this name is already recorded.");
 const leadIds=new Set(linkedCustomerLeadIds(customer,projects,leads));
 const projectIds=new Set(customer.projects.map(project=>project.id));
 const leadUpdates=leads.filter(lead=>leadIds.has(lead.id)).map(lead=>({id:lead.id,updates:{fullName:values.name,email:values.email,companyName:rename(lead.companyName),phone:values.phone,designation:values.designation,country:values.country,companyWebsite:values.website,industry:values.industry} satisfies Partial<Lead>}));
 const projectUpdates=projects.filter(project=>projectIds.has(project.id)||leadIds.has(project.leadId)).map(project=>{
  const extra=project.additionalClients?.some(matches);
  const updates:Partial<Project>={};
  if(matches({name:project.clientName,email:project.clientEmail,companyName:project.clientCompany})||!extra){
   Object.assign(updates,{clientName:values.name,clientEmail:values.email,clientCompany:rename(project.clientCompany),enquiryDetails:details(project.enquiryDetails)});
  }
  if(extra)updates.additionalClients=project.additionalClients?.map(person=>matches(person)?{...person,name:values.name,email:values.email,companyName:rename(person.companyName),contactDetails:details(person.contactDetails)}:person);
  return {id:project.id,updates};
 });
 const planIds=new Set(customer.managedPlans.map(plan=>plan.id));
 const planUpdates=plans.filter(plan=>planIds.has(plan.id)).map(plan=>({id:plan.id,updates:{clientCompany:rename(plan.clientCompany),clientDetails:{name:values.name,email:values.email,contactDetails:details(plan.clientDetails?.contactDetails)}} satisfies Partial<ManagedProject>}));
 return {leadUpdates,projectUpdates,planUpdates};
}
