"use client";
import {PaymentReference} from "./invoices/payment-reference";
import {usePaymentReferences} from "@/lib/payment-references";
import Link from "next/link";
import {useClientRecords} from "@/lib/client-records";
import {StatusBadge} from "@/app/_components/status-badge";
function money(amount:number,currency:string){return new Intl.NumberFormat('en',{style:'currency',currency}).format(amount);}
export function ClientRecordsView({section}:{section:'proposals'|'invoices'}){
 const records=useClientRecords();
 const payments=usePaymentReferences();
 const title=section.charAt(0).toUpperCase()+section.slice(1);
 return <div className={`page-content client-${section}-records`}><section className="welcome-row"><div><h1>{title}</h1><p className="welcome-subtitle">{section==='proposals'?'Proposals shared with your account.':'Issued invoices and payment status for your account.'}</p></div></section>
 {records.loading?<p role="status">Loading {section}...</p>:records.error?<section className="panel portal-record"><p role="alert">{records.error}</p><button className="button button-quiet" onClick={records.retry}>Retry</button></section>:!records[section].length?<section className="panel portal-record"><h2>No {section} yet</h2><p>Your {section} will appear here when shared.</p></section>:<div className="portal-records">
 {section==='proposals'&&records.proposals.map(p=><section className="panel portal-record portal-proposal-summary" key={p.id}>
  <header className="client-project-heading"><div><h2>{p.client_name ? `Proposal for ${p.client_name}` : p.title}</h2><p className="portal-proposal-subtitle">{p.project_title || (p.client_name ? p.title : "Project proposal")}</p></div><StatusBadge status={p.status}/></header>
  <dl className="portal-proposal-facts"><div><dt>Investment</dt><dd>{money(p.amount,p.currency)}</dd></div><div><dt>Version</dt><dd>{p.version}</dd></div>{p.expiry_date&&<div><dt>Valid until</dt><dd>{new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(`${p.expiry_date}T00:00:00Z`))}</dd></div>}</dl>
  {p.review_path&&/^\/proposal\/[A-Za-z0-9_-]{16,200}$/.test(p.review_path)&&<Link className="button button-primary" href={p.review_path}>View proposal</Link>}
 </section>)}
 {section==='invoices'&&<>{payments.error&&<p role="alert">{payments.error}</p>}{records.invoices.map(i=>{const report=payments.references.find(item=>item.invoice_id===i.id);return <section className="panel portal-record" key={i.id}>
 <header className="client-project-heading"><div><h2>{i.number}</h2><p>{i.description}</p></div><StatusBadge status={i.status}>{i.status==="CONFIRMED_PAID"?"Confirmed paid":report?"Awaiting verification":"Awaiting payment"}</StatusBadge></header>
 <dl className="portal-proposal-facts"><div><dt>{i.status==='CONFIRMED_PAID'?'Total paid':'Amount due'}</dt><dd>{money(i.total,i.currency)}</dd></div><div><dt>Issued</dt><dd>{i.issue_date}</dd></div>{i.due_date&&<div><dt>Due date</dt><dd>{i.due_date}</dd></div>}</dl>
 <Link className="button button-quiet" href={`/client/invoices/${i.id}`}>View invoice / Save PDF</Link>
 {i.status==='SENT'&&(report?<div className="invoice-payment-reference"><h3>Payment submitted</h3><p>Reference: <strong>{report.reference || "Not provided"}</strong></p><p>Awaiting administrator verification. You will see confirmation here once approved.</p></div>:<PaymentReference invoiceId={i.id} onSubmitted={()=>void payments.refresh()}/>)}
 </section>;})}</>}

 </div>}</div>;
}
