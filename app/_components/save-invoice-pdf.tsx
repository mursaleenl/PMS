"use client";
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {InvoiceDocument} from './invoice-document';
import type {StoredInvoice} from '@/lib/invoices';
export async function saveInvoicePdf(invoice:StoredInvoice,token:string){
 const path=`/api/invoices/${encodeURIComponent(invoice.invoiceNumber)}/pdf`;
 const headers={Authorization:`Bearer ${token}`};
 const existing=await fetch(path,{headers,cache:'no-store'});
 if(existing.ok)return;
 if(existing.status!==404)throw new Error('Could not check saved invoice PDF. Please retry.');
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 const host=document.createElement('div');
 host.style.cssText='position:absolute;left:-10000px;top:0;width:794px;background:white;';
 document.body.appendChild(host);const root=createRoot(host);
 try{
  flushSync(()=>root.render(<InvoiceDocument invoice={invoice}/>));
  await document.fonts.ready;
  await Promise.all(Array.from(host.querySelectorAll('img')).map(img=>img.decode()));
  const sheet=host.querySelector<HTMLElement>('.invoice-print-area')!;
  sheet.style.cssText='width:210mm;min-height:297mm;height:297mm;box-sizing:border-box;';
  const canvas=await html2canvas(sheet,{scale:2,backgroundColor:'#ffffff',useCORS:true});
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,297);
  const response=await fetch(path,{method:'POST',headers:{...headers,'Content-Type':'application/pdf'},body:pdf.output('blob')});
  if(!response.ok)throw new Error('Invoice saved, but its PDF could not be stored. Please retry.');
 }finally{root.unmount();host.remove();}
}
