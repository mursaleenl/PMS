"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, Printer, Receipt } from "lucide-react";
import { formatLeadId, nextInvoiceNumber, readLeads, updateLead, type Lead, type LeadInvoice, type ProposalVersion } from "@/lib/leads";
import type { OperatingCompany } from "@/lib/companies";
import { updateProject } from "@/lib/projects";

const SAMPLE_PAYMENT_TERMS = "Payment due within 7 days of invoice date.";
const SAMPLE_CONTACT = "billing@vrkspace.example · +91 00000 00000";

function money(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

function today() { return new Date().toISOString().slice(0, 10); }
function inSevenDays() { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10); }

function acceptedProposal(lead: Lead): ProposalVersion | undefined {
  return [...(lead.proposals ?? [])].sort((a, b) => b.version - a.version).find((proposal) => proposal.status === "ACCEPTED");
}

export default function InvoiceGeneratorPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setLeads(readLeads());
    sync();
    const queryLead = new URLSearchParams(window.location.search).get("lead");
    if (queryLead) setSelectedId(queryLead);
    window.addEventListener("evecture:leads-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("evecture:leads-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const eligibleLeads = useMemo(() => leads.filter((lead) => acceptedProposal(lead)), [leads]);
  const lead = eligibleLeads.find((item) => item.id === selectedId) ?? null;
  const proposal = lead ? acceptedProposal(lead) : undefined;

  function generateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lead || !proposal) return;
    if (!lead.operatingCompany) {
      setError("Assign Evecture or Servn in First contact before generating this invoice.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const gstEnabled = data.get("gstEnabled") === "on";
    const gstRate = gstEnabled ? Number(data.get("gstRate")) : 0;
    const issueDate = String(data.get("issueDate") || "");
    const dueDate = String(data.get("dueDate") || "");
    const description = String(data.get("description") || "").trim();
    if (!Number.isFinite(amount) || amount <= 0 || !issueDate || !dueDate || !description || (gstEnabled && (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100))) {
      setError("Enter a valid amount, description, issue date, due date, and GST rate if GST is enabled.");
      return;
    }
    const gstAmount = amount * gstRate / 100;
    const total = amount + gstAmount;
    const invoice: LeadInvoice = {
      invoiceNumber: nextInvoiceNumber(leads, lead.operatingCompany as OperatingCompany),
      operatingCompany: lead.operatingCompany,
      billTo: lead.companyName || lead.fullName,
      description,
      quantity: 1,
      unitPrice: amount,
      subtotal: amount,
      gstEnabled,
      gstRate,
      gstAmount,
      total,
      issueDate,
      dueDate,
      contractValue: amount,
      depositPercent: 100,
      depositAmount: total,
      currency: proposal.currency,
      paymentTerms: SAMPLE_PAYMENT_TERMS,
      paymentInstructions: `Sample account: ${lead.operatingCompany} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`,
      externalPaymentLink: "",
      status: "GENERATED",
    };
    updateLead(lead.id, { invoice });
    if (lead.projectId) updateProject(lead.projectId, { invoice, depositAmount: total });
    setLeads(readLeads());
    setError("");
  }

  function logInvoiceSent() {
    if (!lead?.invoice) return;
    const updatedInvoice = { ...lead.invoice, status: "SENT" as const, sentAt: new Date().toISOString() };
    updateLead(lead.id, { invoice: updatedInvoice });
    if (lead.projectId) updateProject(lead.projectId, { invoice: updatedInvoice });
    setLeads(readLeads());
  }

  const invoice = lead?.invoice;
  const invoiceCompany = invoice?.operatingCompany ?? lead?.operatingCompany ?? "Evecture";
  const isServnInvoice = invoiceCompany === "Servn";
  const invoiceLegalName = isServnInvoice ? "Servn Pvt Limited" : "Evecture Pvt Limited";
  const invoiceAmount = invoice?.subtotal ?? invoice?.contractValue ?? 0;
  const invoiceGst = invoice?.gstEnabled ? invoice.gstAmount ?? 0 : 0;
  const invoiceTotal = invoice ? invoice.total ?? invoice.depositAmount : 0;

  return <div className="page-content invoice-module-page">
    <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot" />COMMERCIAL · INVOICE MODULE</div><h1>Invoice generator</h1><p className="welcome-subtitle">Generate an invoice from an accepted proposal and the client details already on its lead record.</p></div></section>

    <section className="panel invoice-workspace">
      <div className="invoice-workspace-heading"><div><span className="section-icon"><Receipt size={17} /></span><div><h2>Create invoice</h2><p>Company assignment follows First contact. The bank and contact details on the invoice are sample data.</p></div></div></div>
      {eligibleLeads.length === 0 ? <div className="invoice-empty-state"><FileText size={20} /><strong>No accepted proposals yet</strong><p>Invoices become available after a client accepts a proposal.</p><Link className="button button-quiet" href="/requests">Open request pipeline <ArrowRight size={14} /></Link></div> : <>
        <label className="field invoice-client-select">Client / accepted proposal<select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setError(""); setGstEnabled(false); }}><option value="">Select an accepted proposal</option>{eligibleLeads.map((item) => <option key={item.id} value={item.id}>{item.companyName || item.fullName} · {item.services.join(", ")}</option>)}</select></label>
        {lead && proposal && (invoice ? <div className="invoice-existing-note"><Check size={15} /><span>Invoice {invoice.invoiceNumber} has been generated for this client.</span><Link href={`/requests/${lead.id}`}>Open lead record <ArrowRight size={13} /></Link></div> : <form className="invoice-create-form" onSubmit={generateInvoice}>
          <div className="invoice-client-summary"><div><small>INVOICE TO</small><strong>{lead.companyName || lead.fullName}</strong><span>{lead.fullName} · {lead.email}</span></div><div><small>ISSUED BY</small><strong>{lead.operatingCompany || "Company not assigned"}</strong><span>{lead.operatingCompany ? "Inherited from First contact" : <Link href="/requests">Assign in First contact <ArrowRight size={12} /></Link>}</span></div></div>
          <div className="invoice-form-grid"><label className="field required">Description<input name="description" required defaultValue={lead.services.join(" & ") || proposal.deliverables.split("\n")[0]} /></label><label className="field required">Amount ({proposal.currency})<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={proposal.quotedAmount} /></label><label className="field required">Invoice date<input name="issueDate" type="date" required defaultValue={today()} /></label><label className="field required">Due date<input name="dueDate" type="date" required defaultValue={inSevenDays()} /></label></div>
          <label className="invoice-gst-toggle"><input type="checkbox" name="gstEnabled" checked={gstEnabled} onChange={(event) => setGstEnabled(event.target.checked)} /> <span><strong>Add GST</strong><small>Optional. GST is added to the invoice total.</small></span></label>
          {gstEnabled && <label className="field invoice-gst-rate">GST rate (%)<input name="gstRate" type="number" min="0" max="100" step="0.01" defaultValue="18" required /></label>}
          {!lead.operatingCompany && <p className="invoice-inline-help">Choose Evecture or Servn in the First contact section before generating the invoice.</p>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary" type="submit" disabled={!lead.operatingCompany}>Generate invoice <ArrowRight size={14} /></button>
        </form>)}
      </>}
    </section>

    {lead && invoice && <section className="panel invoice-generated-panel"><div className="invoice-generated-heading"><div><span className="section-icon"><FileText size={17} /></span><div><h2>{invoice.invoiceNumber}</h2><p>{invoice.status.replaceAll("_", " ")} · {invoiceCompany}</p></div></div><div className="invoice-actions"><button className="button button-quiet" onClick={() => window.print()}><Printer size={14} />Print / save PDF</button>{invoice.status === "GENERATED" && <button className="button button-primary" onClick={logInvoiceSent}>Log invoice sent</button>}</div></div>
      <div className={`invoice-print-area invoice-reference-layout${isServnInvoice ? " invoice-company-servn" : ""}`}><div className="invoice-paper-head"><div><span className={`invoice-logo-crop${isServnInvoice ? " invoice-logo-servn" : ""}`}><img className={`invoice-company-logo${isServnInvoice ? " invoice-company-logo-servn" : ""}`} src={isServnInvoice ? "/servn-logo.png" : "/invoice-logo.png"} alt={`${invoiceCompany} invoice logo`} /></span></div><div className="invoice-title"><span>INVOICE</span><h2>{invoice.invoiceNumber}</h2></div></div>
        <div className="invoice-paper-meta"><div><small>INVOICE TO</small><strong>{invoice.billTo || lead.companyName || lead.fullName}</strong><span>{lead.fullName}</span><span>{lead.email}</span>{lead.phone && <span>{lead.phone}</span>}</div><div className="invoice-meta-right"><small>INVOICE DATE</small><strong>{invoice.issueDate}</strong><small>COMPANY</small><strong>{invoiceLegalName}</strong></div></div>
        <table className="invoice-lines"><thead><tr><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>PRICE</th></tr></thead><tbody><tr><td>{invoice.description || `Project services · ${lead.services.join(", ")}`}</td><td>{invoice.quantity ?? 1}</td><td>{money(invoice.unitPrice ?? invoiceAmount, invoice.currency)}</td><td>{money(invoice.subtotal ?? invoice.contractValue, invoice.currency)}</td></tr></tbody></table>
        <div className="invoice-summary-row"><div className="invoice-payment-details"><strong>PAYMENT DETAILS</strong><p>{invoice.paymentInstructions || `Sample account: ${invoiceCompany} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`}</p></div><div className="invoice-totals"><div><span>Sub total</span><strong>{money(invoiceAmount, invoice.currency)}</strong></div>{invoice.gstEnabled && <div><span>GST ({invoice.gstRate ?? 0}%)</span><strong>{money(invoiceGst, invoice.currency)}</strong></div>}<div className="invoice-grand-total"><span>Total</span><strong>{money(invoiceTotal, invoice.currency)}</strong></div></div></div>
        <div className="invoice-sample-details"><div className="invoice-sample-signature"><span>Hanan Lateef</span><strong>AUTHORIZED SIGNATORY</strong></div><div><strong>CONTACT US</strong><p>{SAMPLE_CONTACT}</p></div></div>
      </div>
      <div className="invoice-generated-footer"><Link href={`/requests/${lead.id}`}>Open lead record <ArrowRight size={13} /></Link></div>
    </section>}
  </div>;
}
