"use client";
import { useEffect,useState } from "react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
export type ClientProject={id:string;external_id:string;title:string;status:string;start_date:string;tasks:{title:string;status:string}[]};
export type ClientProposal={id:string;proposal_title:string;project_title:string;share_token:string|null;status:string;quoted_amount:number;currency:string;expiry_date:string;version:number};
export function useClientWorkspace() {
  const {session}=useWorkspaceAuth();
  const [data,setData]=useState<{projects:ClientProject[];proposals:ClientProposal[]}>({projects:[],proposals:[]});
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
