"use client";
import {useState, type FormEvent} from 'react';
import {useWorkspaceAuth} from '@/lib/workspace-auth';
export function PaymentReference({invoiceId,onSubmitted}:{invoiceId:string;onSubmitted:()=>void}){
 const {session}=useWorkspaceAuth();
 const [reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();setBusy(true);setError('');
  try{
   const response=await fetch('/api/client/payment-reference',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({invoiceId,reference})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);
   setReference('');onSubmitted();
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to submit payment reference.');}finally{setBusy(false);}
 }
 return <form className="invoice-payment-reference" onSubmit={submit}><h3>Already made the payment?</h3><p>Report your payment and optionally add your bank transaction reference or UTR. An administrator will verify the payment before marking this invoice paid.</p><label htmlFor={`reference-${invoiceId}`}>Payment reference number (optional)</label><div className="invoice-reference-controls"><input id={`reference-${invoiceId}`} value={reference} onChange={event=>setReference(event.target.value)} maxLength={200} placeholder="Enter transaction reference / UTR"/><button className="button button-primary" disabled={busy}>{busy?'Submitting…':'Report payment'}</button></div>{error&&<p role="alert">{error}</p>}</form>;
}
