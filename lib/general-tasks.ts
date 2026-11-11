import type {Project,ProjectWorkItem} from "@/lib/projects";
import {localCollectionValue,publishLocalWorkspaceChange} from "@/lib/workspace-sync";
export const GENERAL_TASKS_ID="__general_tasks__";
// Display context for the shared Tasks board; never stored as a project.
export const generalTaskContext:Project={id:GENERAL_TASKS_ID,title:"General task",leadId:"",createdAt:"",clientCompany:"",clientName:"",clientEmail:"",services:[],classification:"New Client",startDate:"",billingStructure:"Fixed",contractedValue:0,currency:"USD",proposalVersion:0,scopeIncluded:"",scopeExcluded:"",assumptions:"",revisionRounds:0,team:[],status:"ACTIVE"};
export function readGeneralTasks():ProjectWorkItem[]{return (localCollectionValue("generalTasks").value as ProjectWorkItem[]|undefined)??[];}
export function writeGeneralTasks(tasks:ProjectWorkItem[]){publishLocalWorkspaceChange("generalTasks",tasks);if(typeof window!=="undefined")window.dispatchEvent(new Event("evecture:general-tasks-updated"));}
export function updateGeneralTask(id:string,updates:Partial<ProjectWorkItem>){if(!readGeneralTasks().some(task=>task.id===id))throw new Error("This task is no longer available.");writeGeneralTasks(readGeneralTasks().map(task=>task.id===id?{...task,...updates}:task));}
