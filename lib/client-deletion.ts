import {supabase} from "@/lib/supabase";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {readProjects} from "@/lib/projects";
import {readLeads} from "@/lib/leads";
import {linkedCustomerLeadIds} from "@/lib/record-editing";
type Client={name:string;contactName?:string;companyName?:string;organizations?:string[];email?:string;projects:{id:string}[];managedPlans:{id:string}[]};
export async function deleteClientProfile(client:Client){
 if(!supabase)throw new Error("Database is not configured.");
 await flushWorkspaceChanges();
 const leads=linkedCustomerLeadIds(client,readProjects(),readLeads());
 const {error}=await supabase.rpc("delete_client_profile",{p_project_ids:client.projects.map(project=>project.id),p_lead_ids:leads,p_managed_ids:client.managedPlans.map(plan=>plan.id),p_name:client.contactName??client.name,p_companies:client.organizations||[client.companyName||""],p_email:client.email||""});
 if(error)throw new Error(error.code==="PGRST202"?"Client deletion is not set up in this database. Apply the client profile deletion migration.":error.message);
 window.dispatchEvent(new Event("focus"));
}
