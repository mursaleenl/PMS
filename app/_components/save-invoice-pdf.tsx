"use client";
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {InvoiceDocument} from './invoice-document';
import type {StoredInvoice} from '@/lib/invoices';
export async function saveInvoicePdf(invoice:StoredInvoice,token:string){
 const path=`/api/invoices/${encodeURIComponent(invoice.invoiceNumber)}/pdf`;
 const headers={Authorization:`Bearer ${token}`};
 const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
 const host=document.createElement('div');
 host.style.cssText='position:absolute;left:-10000px;top:0;width:794px;background:white;';
 document.body.appendChild(host);const root=createRoot(host);
 try{
  flushSync(()=>root.render(<InvoiceDocument invoice={invoice}/>));
  await document.fonts.ready;
  await Promise.all(Array.from(host.querySelectorAll('img')).map(img=>img.decode()));
  const sheet=host.querySelector<HTMLElement>('.invoice-print-area')!;
  sheet.style.cssText='width:210mm;min-height:297mm;height:297mm;box-sizing:border-box;transform:none;filter:none;opacity:1;';
  // The export host lives outside the app shell: normalize it explicitly rather
  // than inheriting preview/theme colors or small-screen layout overrides.
  sheet.querySelectorAll<HTMLElement>('*').forEach(element=>{
   element.style.setProperty('color',element.closest('thead')?'#ffffff':'#000000','important');
   element.style.setProperty('-webkit-text-fill-color','currentColor','important');
   element.style.setProperty('text-shadow','none','important');
   element.style.setProperty('filter','none','important');
   element.style.setProperty('opacity','1','important');
  });
  sheet.querySelectorAll<HTMLElement>('thead th').forEach(element=>element.style.setProperty('background','#0f172a','important'));
  const canvas=await html2canvas(sheet,{scale:4,windowWidth:1280,windowHeight:1400,backgroundColor:'#ffffff',useCORS:true});
  const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,210,297,undefined,'FAST');
  const blob=pdf.output('blob');
  if(blob.size>8_000_000)throw new Error('The invoice PDF is too large to upload safely. Please retry.');
  const response=await fetch(path,{method:'POST',headers:{...headers,'Content-Type':'application/pdf'},body:blob});
  if(!response.ok)throw new Error('Invoice saved, but its PDF could not be stored. Please retry.');
 }finally{root.unmount();host.remove();}
}
