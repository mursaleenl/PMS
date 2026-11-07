"use client";
import {useLiveRefresh} from "@/lib/live-refresh";
import { useEffect,useRef,useState } from "react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
export type ClientProject = {logo_data_url?:string|null;id:string;external_id:string;title:string;client_company?:string|null;status:string;details?:{services:string[];start_date:string|null;scope_included:string|null;scope_excluded:string|null;assumptions:string|null};total_tasks:number;completed_tasks:number;tasks:{id:string;title:string;status:string}[]};
export function useClientWorkspace() {
  const {session}=useWorkspaceAuth();
  const userId=session?.user.id;
  const dataUser=useRef<string|undefined>(undefined);
  const loadedUser=useRef<string|undefined>(undefined);
  const [data,setData]=useState<{projects:ClientProject[]}>({projects:[]});
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [attempt,setAttempt]=useState(0);
  useLiveRefresh(()=>setAttempt(value=>value+1),!!session?.access_token);
  useEffect(()=>{
    if(dataUser.current!==userId){dataUser.current=userId;loadedUser.current=undefined;setData({projects:[]});}
    if(!session?.access_token){setLoading(false);return;}
    const controller=new AbortController();setLoading(loadedUser.current!==userId);setError("");
    void fetch("/api/client/workspace",{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:"no-store"})
      .then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error);if(!controller.signal.aborted){loadedUser.current=userId;setData(value);}})
      .catch(cause=>{if(!controller.signal.aborted&&loadedUser.current!==userId)setError(cause instanceof Error?cause.message:"Unable to load workspace.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[session?.access_token,userId,attempt]);
  return {...data,loading,error,retry:()=>setAttempt(value=>value+1)};
}
