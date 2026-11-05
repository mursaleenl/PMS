"use client";
import {useLiveRefresh} from "@/lib/live-refresh";
import {useEffect,useRef,useState} from "react";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
export type ClientProposal={client_name?:string|null;project_title?:string|null;accepted_by?:string|null;accepted_at?:string|null;id:string;title:string;version:number;status:string;review_path:string|null;expiry_date:string|null;amount:number;currency:string;scope:string|null;deliverables:string|null;timeline:string|null;payment_terms:string|null};
export type ClientInvoice={gst_enabled?:boolean;contract_value?:number;deposit_amount?:number;client_name?:string|null;client_email?:string|null;transaction_reference?:string|null;bill_to?:string|null;operating_company?:string|null;quantity?:number;unit_price?:number;subtotal?:number;gst_amount?:number;gst_rate?:number;confirmed_paid_at?:string|null;id:string;number:string;description:string|null;status:string;total:number;currency:string;issue_date:string;due_date:string|null;payment_terms:string|null;payment_instructions:string|null};
export type ClientDocument={id:string;name:string;url:string;kind:string};
type Records={proposals:ClientProposal[];invoices:ClientInvoice[];documents:ClientDocument[]};
export function useClientRecords(){
 const {session}=useWorkspaceAuth();
 const userId=session?.user.id;
 const loadedUser=useRef<string|undefined>(undefined);
 const dataUser=useRef<string|undefined>(undefined);
 const [data,setData]=useState<Records>({proposals:[],invoices:[],documents:[]});
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 useLiveRefresh(()=>setAttempt(value=>value+1),!!session?.access_token);
 useEffect(()=>{
  if(dataUser.current!==userId){
   dataUser.current=userId;loadedUser.current=undefined;
   setData({proposals:[],invoices:[],documents:[]});
  }
  if(!session?.access_token){setLoading(false);return;}
  const controller=new AbortController();
  // Focus and token refreshes must not unmount documents or reset forms.
  setLoading(loadedUser.current!==userId);setError("");
  void fetch('/api/client/records',{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:'no-store'})
   .then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error);if(!controller.signal.aborted){loadedUser.current=userId;setData(value);}})
   .catch(cause=>{if(!controller.signal.aborted&&loadedUser.current!==userId)setError(cause instanceof Error?cause.message:'Unable to load records.');})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[session?.access_token,userId,attempt]);
 return {...data,loading,error,retry:()=>setAttempt(value=>value+1)};
}
