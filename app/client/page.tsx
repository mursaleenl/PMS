"use client";
import Link from "next/link";
import {useClientWorkspace} from "@/lib/client-workspace";
import {useClientRecords} from "@/lib/client-records";
export default function ClientOverview(){
 const projects=useClientWorkspace(),records=useClientRecords();
 const loading=projects.loading||records.loading,error=projects.error||records.error;
 return <div className="page-content"><section className="welcome-row"><div><h1>Overview</h1><p className="welcome-subtitle">Your projects, proposals, and invoices in one place.</p></div></section>
 {loading?<p role="status">Loading your overview...</p>:error?<section className="panel portal-record"><p role="alert">{error}</p><button className="button button-quiet" onClick={()=>{projects.retry();records.retry();}}>Retry</button></section>:<section className="overview-summary-grid" aria-label="Your account summary">{[
 {label:'Projects',value:projects.projects.length,href:'/client/projects'},
 {label:'Proposals',value:records.proposals.length,href:'/client/proposals'},
 {label:'Invoices',value:records.invoices.length,href:'/client/invoices'}
 ].map(item=><Link className="overview-summary-card" href={item.href} key={item.href}><div className="overview-summary-top"><small>{item.label}</small></div><strong>{item.value}</strong><span className="overview-summary-subtext">View {item.label.toLowerCase()}</span></Link>)}</section>}</div>;
}
