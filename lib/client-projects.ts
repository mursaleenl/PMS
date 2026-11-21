import {clientContactName} from "@/lib/client-identity";
import {nextProjectId,type ProjectEnquiryDetails,type BillingStructure,type Project,type ProjectTeamMember} from "@/lib/projects";
import {supabase} from "@/lib/supabase";
import type {OperatingCompany} from "@/lib/companies";

export type ExistingProjectClient = {clientId?:string;portalLinked?:boolean;name:string;companyName?:string;email?:string;contactDetails?:ProjectEnquiryDetails};

export async function readProjectLeadClientDirectory(): Promise<(ExistingProjectClient & {clientId:string})[]> {
  if (!supabase) throw new Error("Database connection is unavailable.");
  const {data,error} = await supabase.rpc("project_lead_client_directory");
  if (error || !Array.isArray(data)) throw new Error("The client directory is unavailable. Check workspace setup and retry.");
  return data;
}

export async function createClientProject(input:{client:ExistingProjectClient;title:string;description:string;services:string[];startDate:string;operatingCompany:OperatingCompany;billingStructure:BillingStructure;contractedValue:number;currency:string;team:ProjectTeamMember[];clientSelection?:"new"|"existing"}):Promise<Project>{
  const title=input.title.trim();
  if(!title)throw new Error("Enter a project name.");
  if(!clientContactName(input.client.name))throw new Error("Enter a client name instead of a placeholder.");
  if(!input.client.name.trim()&&!input.client.companyName?.trim())throw new Error("Choose an existing client.");
  if(!Number.isFinite(input.contractedValue)||input.contractedValue<0)throw new Error("Enter a valid project budget.");
  return {
    id:await nextProjectId(input.operatingCompany),projectType:"client",leadId:"",clientId:input.client.clientId,clientSelection:input.clientSelection,createdAt:new Date().toISOString(),
    title,clientName:input.client.name.trim(),clientCompany:input.client.companyName?.trim()||"",clientEmail:input.client.email?.trim()||"",
    enquiryDetails:{projectName:title,projectNameOverride:true,description:input.description.trim(),phone:input.client.contactDetails?.phone,designation:input.client.contactDetails?.designation,companyWebsite:input.client.contactDetails?.companyWebsite,country:input.client.contactDetails?.country,timezone:input.client.contactDetails?.timezone,industry:input.client.contactDetails?.industry},
    operatingCompany:input.operatingCompany,services:input.services,classification:input.clientSelection==="new"?"New Client":"Repeat Client",startDate:input.startDate,
    billingStructure:input.billingStructure,contractedValue:input.contractedValue,currency:input.currency,proposalVersion:0,
    scopeIncluded:input.description.trim(),scopeExcluded:"",assumptions:"",revisionRounds:0,team:input.team,workItems:[],status:"ACTIVE",
  };
}
