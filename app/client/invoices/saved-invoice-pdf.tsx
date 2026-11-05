"use client";
import {Download, ExternalLink, FileText} from "lucide-react";
import {useEffect,useState} from 'react';
import {useWorkspaceAuth} from '@/lib/workspace-auth';
export function SavedInvoicePdf({number}:{number:string}){
 const {session}=useWorkspaceAuth();
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  if(!session?.access_token)return;
  const controller=new AbortController();let objectUrl='';
  setUrl('');setError('');
  void fetch(`/api/invoices/${encodeURIComponent(number)}/pdf`,{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw new Error('The saved admin invoice PDF is not available yet. Please contact your project team.');return response.blob();})
   .then(blob=>{if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}})
   .catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[number,session?.access_token]);
 if(error)return <section className="client-invoice-pdf-placeholder"><FileText size={24}/><h2>Invoice preview unavailable</h2><p role="alert">{error}</p></section>;
 if(!url)return <section className="client-invoice-pdf-placeholder"><FileText size={24}/><p role="status">Loading your invoice...</p></section>;
 return <section className="client-invoice-pdf-panel"><div className="client-invoice-pdf-toolbar"><div className="client-invoice-pdf-title"><FileText size={19}/><div><h2>Invoice document</h2><p>{number}.pdf</p></div></div><div className="client-invoice-pdf-actions"><a className="button button-quiet" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open / Print saved PDF</a><a className="button button-primary" href={url} download={`${number}.pdf`}><Download size={14}/>Download saved invoice PDF</a></div></div><div className="client-invoice-pdf-canvas"><iframe src={`${url}#view=FitH`} title="Saved admin invoice PDF"/></div></section>;
}
