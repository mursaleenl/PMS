"use client";
import {SavedInvoicePdf} from "../saved-invoice-pdf";
import {ArrowLeft, Check} from "lucide-react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {useClientRecords} from "@/lib/client-records";
import {InvoiceDocument} from "@/app/_components/invoice-document";
export default function ClientInvoicePage(){
 const {invoiceId}=useParams<{invoiceId:string}>();
 const {invoices,loading,error,retry}=useClientRecords();
 const invoice=invoices.find(item=>item.id===invoiceId);
 return <div className="page-content client-invoice-page"><div className="client-invoice-navigation"><Link href="/client/invoices" className="text-link"><ArrowLeft size={15}/>Back to invoices</Link>{invoice&&invoice.status!=="CONFIRMED_PAID"&&!loading&&!error&&<button className="button button-primary" onClick={()=>window.print()}>Print / Save PDF</button>}</div>
 {loading?<p role="status">Loading invoice...</p>:error?<section className="panel portal-record"><p role="alert">{error}</p><button className="button button-quiet" onClick={retry}>Retry</button></section>:!invoice?<p>This invoice is not available for your account.</p> :invoice.status==="CONFIRMED_PAID"?<>
 <header className="client-invoice-page-header"><div><span className="client-invoice-eyebrow">Billing / Invoice</span><h1>{invoice.number}</h1><p>{invoice.bill_to || invoice.description || "Your invoice and payment record."}</p></div><span className="client-invoice-payment-state"><Check size={16}/>Payment confirmed</span></header>
 <dl className="client-invoice-summary"><div><dt>Total paid</dt><dd>{new Intl.NumberFormat('en',{style:'currency',currency:invoice.currency}).format(invoice.total)}</dd></div><div><dt>Issued on</dt><dd>{invoice.issue_date?new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${invoice.issue_date}T00:00:00Z`)):"—"}</dd></div><div><dt>Operating company</dt><dd>{invoice.operating_company || "—"}</dd></div><div><dt>Payment status</dt><dd>Confirmed paid</dd></div></dl>
 <SavedInvoicePdf number={invoice.number}/></>:<article className="client-invoice-sheet">
 <InvoiceDocument invoice={{invoiceNumber:invoice.number,operatingCompany:invoice.operating_company as "Servn"|"Evecture",billTo:invoice.bill_to??"",clientName:invoice.client_name||undefined,clientEmail:invoice.client_email||undefined,issueDate:invoice.issue_date,dueDate:invoice.due_date||"",description:invoice.description||"",quantity:invoice.quantity??1,unitPrice:invoice.unit_price??0,subtotal:invoice.subtotal??0,contractValue:invoice.contract_value??0,gstEnabled:invoice.gst_enabled??false,gstAmount:invoice.gst_amount??0,gstRate:invoice.gst_rate??0,total:invoice.total,depositAmount:invoice.deposit_amount??0,currency:invoice.currency,paymentInstructions:invoice.payment_instructions||"",transactionReference:invoice.transaction_reference||undefined,status:invoice.status as "SENT"|"CONFIRMED_PAID"}}/>
 </article>}</div>;
}
