import type { OperatingCompany } from "@/lib/companies";
import { localCollectionValue, publishLocalWorkspaceChange } from "@/lib/workspace-sync";
import { readLeads, updateLead } from "@/lib/leads";
import { readProjects, updateProject } from "@/lib/projects";
import { reserveWorkspaceNumber } from "@/lib/numbering";

export const INVOICES_STORAGE_KEY = "evecture.invoices.v1";

export type InvoiceStatus = "GENERATED" | "SENT" | "CONFIRMED_PAID";

export type StoredInvoice = {
  id: string;
  invoiceNumber: string;
  leadId?: string;
  projectId?: string;
  clientId?: string;
  isDeposit?: boolean;
  operatingCompany: OperatingCompany;
  billTo: string;
  clientName?: string;
  clientEmail?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  gstEnabled: boolean;
  gstRate: number;
  gstAmount: number;
  total: number;
  issueDate: string;
  dueDate: string;
  contractValue: number;
  depositPercent: number;
  depositAmount: number;
  currency: string;
  paymentTerms: string;
  paymentInstructions: string;
  externalPaymentLink?: string;
  status: InvoiceStatus;
  sentAt?: string;
  transactionReference?: string;
  confirmedPaidAt?: string;
  createdAt: string;
  updatedAt: string;
};

export function nextInvoiceNumber(operatingCompany: OperatingCompany): Promise<string> {
  return reserveWorkspaceNumber("invoice",operatingCompany);
}

export function readInvoices(): StoredInvoice[] {
  if (typeof window === "undefined") return [];
  const value = localCollectionValue("invoices").value;
  return (Array.isArray(value) ? value as StoredInvoice[] : []).sort((a,b) => (b.issueDate || b.createdAt).localeCompare(a.issueDate || a.createdAt));
}

function refreshInvoiceProjections() {
  const invoices = readInvoices();
  for (const lead of readLeads()) {
    const invoice = invoices.find(item => item.isDeposit && item.leadId === lead.id);
    if (JSON.stringify(lead.invoice) !== JSON.stringify(invoice)) updateLead(lead.id,{invoice});
  }
  for (const project of readProjects()) {
    const deposit = invoices.filter(item => item.isDeposit && (item.projectId === project.id || (!!project.leadId && item.leadId === project.leadId)));
    const invoice = deposit[0];
    const depositAmount = deposit.reduce((sum,item) => sum+item.total,0);
    const depositStatus = deposit.length && deposit.every(item => item.status === "CONFIRMED_PAID") ? "CONFIRMED_PAID" as const : undefined;
    if (JSON.stringify(project.invoice) !== JSON.stringify(invoice) || project.depositAmount !== depositAmount || project.depositStatus !== depositStatus) updateProject(project.id,{invoice,depositAmount,depositStatus});
  }
}

export function writeInvoices(invoices: StoredInvoice[]) {
  if (typeof window !== "undefined") {
    publishLocalWorkspaceChange("invoices", invoices);
    window.dispatchEvent(new Event("evecture:invoices-updated"));
  }
}

export function saveInvoice(invoice: StoredInvoice) {
  const current = readInvoices();
  const updated = { ...invoice, updatedAt:new Date().toISOString() };
  writeInvoices(current.some(item => item.invoiceNumber===invoice.invoiceNumber)
    ? current.map(item => item.invoiceNumber===invoice.invoiceNumber ? updated : item) : [updated,...current]);
  refreshInvoiceProjections();
}

export function updateInvoice(invoiceNumber: string, updates: Partial<StoredInvoice>) {
  const current = readInvoices();
  const target = current.find((item) => item.invoiceNumber === invoiceNumber);
  if (!target) return;
  const merged: StoredInvoice = { ...target, ...updates, updatedAt: new Date().toISOString() };
  saveInvoice(merged);
}

export function deleteInvoice(invoiceNumber: string) {
  writeInvoices(readInvoices().filter(item => item.invoiceNumber !== invoiceNumber));
  refreshInvoiceProjections();
}
