"use client";
export function TaskDeadline({deadline}:{deadline?:string}){
 if(!deadline)return null;
 const date=new Date(deadline);
 if(Number.isNaN(date.getTime()))return null;
 return <small className="task-deadline">Due <time dateTime={deadline}>{date.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</time></small>;
}
