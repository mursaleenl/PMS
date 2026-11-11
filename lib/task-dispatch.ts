import {taskDeadlineFromInput} from "@/lib/dates";
import {createUuid} from "@/lib/uuid";
import {readProjects,updateProject,type ProjectWorkItem,type TaskAssignee} from "@/lib/projects";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
export type TaskDispatch={projectId:string;task:ProjectWorkItem};
export function prepareTaskDispatch(input:{projectIds:string[];assignees:TaskAssignee[];title:string;description?:string;deadline?:string;kind:ProjectWorkItem["kind"];priority:ProjectWorkItem["priority"];estimatedHours?:number}):TaskDispatch[]{
 if(!input.projectIds.length)throw new Error("Select at least one project.");
 if(input.assignees.some(person=>!person.userId))throw new Error("Select assignees from the workspace directory.");
 if(!input.assignees.length)throw new Error("Select at least one assignee.");
 if(!Number.isFinite(input.estimatedHours??0)||(input.estimatedHours??0)<0)throw new Error("Enter valid estimated hours.");
 if(!input.title.trim())throw new Error("Enter a task title.");
 const deadline=taskDeadlineFromInput(input.deadline??"");
 const available=readProjects();
 if(input.projectIds.some(id=>!available.some(project=>project.id===id)))throw new Error("A selected project is no longer available. Reload and try again.");
 const assignees=input.assignees.filter((person,index,array)=>array.findIndex(other=>other.userId===person.userId)===index);
 return [...new Set(input.projectIds)].map(projectId=>({projectId,task:{id:createUuid(),title:input.title.trim(),deadline,description:input.description?.trim()||undefined,assignee:assignees[0].name,assigneeId:assignees[0].userId,assignees:assignees.map(person=>({...person})),kind:input.kind,priority:input.priority,estimatedHours:input.estimatedHours??0,loggedHours:0,createdAt:new Date().toISOString(),status:"TO_DO"}}));
}
export async function persistTaskDispatch(batch:TaskDispatch[],options:{selfService?:boolean}={}):Promise<void>{
 const projects=readProjects();
 if(batch.some(item=>!projects.some(project=>project.id===item.projectId)))throw new Error("A selected project is no longer available. Reload and try again.");
 for(const item of batch){const project=readProjects().find(project=>project.id===item.projectId)!;if(!project.workItems?.some(task=>task.id===item.task.id))updateProject(project.id,{workItems:[item.task,...(project.workItems??[])]},{syncTaskTeam:!options.selfService});}
 await flushWorkspaceChanges();
}
