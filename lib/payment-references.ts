"use client";
import {useEffect,useState,useCallback} from 'react';
import {useWorkspaceAuth} from '@/lib/workspace-auth';
export type PaymentReport={invoice_id:string;reference:string;submitted_at:string;invoices:{invoice_number:string}|null};
export function usePaymentReferences(){
 const {session}=useWorkspaceAuth();
 const [references,setReferences]=useState<PaymentReport[]>([]),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!session?.access_token)return;
  try{const response=await fetch('/api/client/payment-reference',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error);setReferences(result.references);setError('');}
  catch(cause){setError(cause instanceof Error?cause.message:'Unable to load payment references.');}
 },[session?.access_token]);
 useEffect(()=>{void refresh();const update=()=>void refresh();window.addEventListener('focus',update);return()=>window.removeEventListener('focus',update);},[refresh]);
 return {references,error,refresh};
}
