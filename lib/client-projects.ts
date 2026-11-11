import type {Lead} from "@/lib/leads";
import {getProjectClients,getProjectEnquiryDetails,nextProjectId,type ProjectEnquiryDetails,type BillingStructure,type Project,type ProjectTeamMember} from "@/lib/projects";
import type {OperatingCompany} from "@/lib/companies";

export type ExistingProjectClient = {name:string;companyName?:string;email?:string;contactDetails?:ProjectEnquiryDetails};

export function existingProjectClients(projects:Project[],leads:Lead[],includeEnquiries=false):ExistingProjectClient[]{
  const clients:ExistingProjectClient[]=[];
  const add=(client:ExistingProjectClient)=>{
    if(!client.name.trim()&&!client.companyName?.trim())return;
    const key=(item:ExistingProjectClient)=>item.email?.trim().toLowerCase()||`${item.companyName?.trim().toLowerCase()||""}:${item.name.trim().toLowerCase()}`;
    const existing=clients.find(item=>key(item)===key(client));
    if(existing)return;
    const details=client.contactDetails;
    clients.push({...client,contactDetails:details?{phone:details.phone,designation:details.designation,companyWebsite:details.companyWebsite,country:details.country,timezone:details.timezone,industry:details.industry}:undefined});
  };
  for(const project of projects.filter(item=>item.projectType!=="internal")){
    const lead=leads.find(item=>item.id===project.leadId||(!!project.clientEmail&&item.email?.trim().toLowerCase()===project.clientEmail.trim().toLowerCase()));
    add({name:project.clientName,companyName:project.clientCompany,email:project.clientEmail,contactDetails:getProjectEnquiryDetails(project,lead)});
  }
  for(const project of projects.filter(item=>item.projectType!=="internal"))for(const client of getProjectClients(project).slice(1))add(client);
  for(const lead of leads.filter(item=>item.status==="CONVERTED"||item.status==="ACCEPTED"||(includeEnquiries&&item.status!=="LOST")))add({name:lead.fullName,companyName:lead.companyName,email:lead.email,contactDetails:getProjectEnquiryDetails({},lead)});
  return clients.sort((a,b)=>(a.companyName||a.name).localeCompare(b.companyName||b.name));
}

export async function createClientProject(input:{client:ExistingProjectClient;title:string;description:string;services:string[];startDate:string;operatingCompany:OperatingCompany;billingStructure:BillingStructure;contractedValue:number;currency:string;team:ProjectTeamMember[]}):Promise<Project>{
  const title=input.title.trim();
  if(!title)throw new Error("Enter a project name.");
  if(!input.client.name.trim()&&!input.client.companyName?.trim())throw new Error("Choose an existing client.");
  if(!Number.isFinite(input.contractedValue)||input.contractedValue<0)throw new Error("Enter a valid project budget.");
  return {
    id:await nextProjectId(input.operatingCompany),projectType:"client",leadId:"",createdAt:new Date().toISOString(),
    title,clientName:input.client.name.trim(),clientCompany:input.client.companyName?.trim()||"",clientEmail:input.client.email?.trim()||"",
    enquiryDetails:{description:input.description.trim(),phone:input.client.contactDetails?.phone,designation:input.client.contactDetails?.designation,companyWebsite:input.client.contactDetails?.companyWebsite,country:input.client.contactDetails?.country,timezone:input.client.contactDetails?.timezone,industry:input.client.contactDetails?.industry},
    operatingCompany:input.operatingCompany,services:input.services,classification:"Repeat Client",startDate:input.startDate,
    billingStructure:input.billingStructure,contractedValue:input.contractedValue,currency:input.currency,proposalVersion:0,
    scopeIncluded:input.description.trim(),scopeExcluded:"",assumptions:"",revisionRounds:0,team:input.team,workItems:[],status:"ACTIVE",
  };
}
