"use client";
import type {PaymentReport} from '@/lib/payment-references';
import {useState, type FormEvent} from 'react';
import {useWorkspaceAuth} from '@/lib/workspace-auth';
export function PaymentReference({invoiceId,onSubmitted}:{invoiceId:string;onSubmitted:(report:PaymentReport)=>void}){
 const {session}=useWorkspaceAuth();
 const [includeReference,setIncludeReference]=useState(false);
 const [reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/client/payment-reference',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({invoiceId,reference:includeReference?reference:''})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);
   setReference('');onSubmitted(result.report);
  }catch(cause){setError(cause instanceof Error?cause.message:'Unable to submit payment reference.');}finally{setBusy(false);}
 }
 return <details className="invoice-payment-reference payment-report-disclosure"><summary>Already made the payment?</summary><form onSubmit={submit}><p>Report your payment and optionally add your bank transaction reference or UTR. An administrator will verify the payment before marking this invoice paid.</p><label className="payment-reference-toggle"><input type="checkbox" checked={includeReference} disabled={busy} onChange={event=>setIncludeReference(event.target.checked)}/>Add a payment reference (optional)</label><div className="invoice-reference-controls">{includeReference&&<input id={`reference-${invoiceId}`} value={reference} onChange={event=>setReference(event.target.value)} maxLength={200} placeholder="Enter transaction reference / UTR"/>}<button className="button button-primary" disabled={busy}>{busy?'Submitting…':'Report payment'}</button></div>{error&&<p role="alert">{error}</p>}</form></details>;
}
