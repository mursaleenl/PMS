"use client";
import { useEffect,useState } from "react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
export type ClientProject = {id:string;external_id:string;title:string;status:string;total_tasks:number;completed_tasks:number;team:{name:string;role:string}[]};
export function useClientWorkspace() {
  const {session}=useWorkspaceAuth();
  const [data,setData]=useState<{projects:ClientProject[]}>({projects:[]});
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    if(!session?.access_token) return;
    const controller=new AbortController();setLoading(true);setError("");
    void fetch("/api/client/workspace",{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:"no-store"})
      .then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error);setData(value);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Unable to load workspace.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[session?.access_token,attempt]);
  return {...data,loading,error,retry:()=>setAttempt(value=>value+1)};
}
