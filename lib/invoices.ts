import type { OperatingCompany } from "@/lib/companies";
import { parseStoredJson, publishLocalWorkspaceChange } from "@/lib/workspace-sync";
import { readLeads, updateLead, type Lead, type LeadInvoice } from "@/lib/leads";
import { readProjects, updateProject, type Project } from "@/lib/projects";
import { supabase } from "@/lib/supabase";

export const INVOICES_STORAGE_KEY = "evecture.invoices.v1";

export type InvoiceStatus = "GENERATED" | "SENT" | "CONFIRMED_PAID";

export type StoredInvoice = {
  id: string;
  invoiceNumber: string;
  leadId?: string;
  projectId?: string;
  clientId?: string;
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

export function nextInvoiceNumber(operatingCompany: OperatingCompany, existingInvoices = readInvoices()): string {
  const year = new Date().getFullYear();
  const prefix = operatingCompany === "Servn" ? "SER" : "EVE";
  const regex = new RegExp(`^${prefix}-INV-${year}-(\\d+)$`);
  const values = existingInvoices
    .map((inv) => inv.invoiceNumber.match(regex)?.[1])
    .filter(Boolean)
    .map(Number);
  const nextNum = Math.max(0, ...values) + 1;
  return `${prefix}-INV-${year}-${String(nextNum).padStart(3, "0")}`;
}

export function readInvoices(): StoredInvoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INVOICES_STORAGE_KEY);
    const parsed = parseStoredJson(raw);
    let list: StoredInvoice[] = Array.isArray(parsed) ? (parsed as StoredInvoice[]) : [];

    // Migrate/aggregate any invoices existing in leads or projects
    const leads = readLeads();
    const projects = readProjects();
    const seen = new Set(list.map((inv) => inv.invoiceNumber));
    let migrated = false;

    for (const lead of leads) {
      if (lead.invoice && !seen.has(lead.invoice.invoiceNumber)) {
        seen.add(lead.invoice.invoiceNumber);
        list.push({
          id: lead.invoice.invoiceNumber,
          invoiceNumber: lead.invoice.invoiceNumber,
          leadId: lead.id,
          projectId: lead.projectId,
          operatingCompany: lead.invoice.operatingCompany || lead.operatingCompany || "Evecture",
          billTo: lead.invoice.billTo || lead.companyName || lead.fullName || "Client",
          clientName: lead.fullName,
          clientEmail: lead.email,
          description: lead.invoice.description || (lead.services ?? []).join(" & ") || "Project services",
          quantity: lead.invoice.quantity ?? 1,
          unitPrice: lead.invoice.unitPrice ?? lead.invoice.contractValue ?? 0,
          subtotal: lead.invoice.subtotal ?? lead.invoice.contractValue ?? 0,
          gstEnabled: Boolean(lead.invoice.gstEnabled),
          gstRate: lead.invoice.gstRate ?? 0,
          gstAmount: lead.invoice.gstAmount ?? 0,
          total: lead.invoice.total ?? lead.invoice.depositAmount ?? 0,
          issueDate: lead.invoice.issueDate || new Date().toISOString().slice(0, 10),
          dueDate: lead.invoice.dueDate || new Date().toISOString().slice(0, 10),
          contractValue: lead.invoice.contractValue,
          depositPercent: lead.invoice.depositPercent,
          depositAmount: lead.invoice.depositAmount,
          currency: lead.invoice.currency || "USD",
          paymentTerms: lead.invoice.paymentTerms || "Payment due within 7 days of invoice date.",
          paymentInstructions: lead.invoice.paymentInstructions || "",
          externalPaymentLink: lead.invoice.externalPaymentLink,
          status: lead.invoice.status,
          sentAt: lead.invoice.sentAt,
          transactionReference: lead.invoice.transactionReference,
          confirmedPaidAt: lead.invoice.confirmedPaidAt,
          createdAt: lead.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        migrated = true;
      }
    }

    for (const project of projects) {
      if (project.invoice && !seen.has(project.invoice.invoiceNumber)) {
        seen.add(project.invoice.invoiceNumber);
        list.push({
          id: project.invoice.invoiceNumber,
          invoiceNumber: project.invoice.invoiceNumber,
          leadId: project.leadId,
          projectId: project.id,
          operatingCompany: project.invoice.operatingCompany || project.operatingCompany || "Evecture",
          billTo: project.invoice.billTo || project.clientCompany || project.clientName || "Client",
          clientName: project.clientName,
          clientEmail: project.clientEmail,
          description: project.invoice.description || project.title,
          quantity: project.invoice.quantity ?? 1,
          unitPrice: project.invoice.unitPrice ?? project.invoice.contractValue ?? 0,
          subtotal: project.invoice.subtotal ?? project.invoice.contractValue ?? 0,
          gstEnabled: Boolean(project.invoice.gstEnabled),
          gstRate: project.invoice.gstRate ?? 0,
          gstAmount: project.invoice.gstAmount ?? 0,
          total: project.invoice.total ?? project.invoice.depositAmount ?? 0,
          issueDate: project.invoice.issueDate || new Date().toISOString().slice(0, 10),
          dueDate: project.invoice.dueDate || new Date().toISOString().slice(0, 10),
          contractValue: project.invoice.contractValue,
          depositPercent: project.invoice.depositPercent,
          depositAmount: project.invoice.depositAmount,
          currency: project.invoice.currency || "USD",
          paymentTerms: project.invoice.paymentTerms || "Payment due within 7 days of invoice date.",
          paymentInstructions: project.invoice.paymentInstructions || "",
          externalPaymentLink: project.invoice.externalPaymentLink,
          status: project.invoice.status,
          sentAt: project.invoice.sentAt,
          transactionReference: project.invoice.transactionReference,
          confirmedPaidAt: project.invoice.confirmedPaidAt,
          createdAt: project.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        migrated = true;
      }
    }

    if (migrated && typeof window !== "undefined") {
      window.localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(list));
    }

    return list.sort((a, b) => new Date(b.issueDate || b.createdAt).getTime() - new Date(a.issueDate || a.createdAt).getTime());
  } catch {
    return [];
  }
}

export function writeInvoices(invoices: StoredInvoice[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(invoices));
    window.dispatchEvent(new Event("evecture:invoices-updated"));
    publishLocalWorkspaceChange("invoices", invoices);
  }
}

export async function syncInvoiceToDatabase(invoice: StoredInvoice) {
  if (!supabase) return;
  try {
    let leadDbUuid: string | null = null;
    let projectDbUuid: string | null = null;

    if (invoice.leadId) {
      const { data: leadRow } = await supabase.from("leads").select("id").eq("external_id", invoice.leadId).maybeSingle();
      if (leadRow?.id) leadDbUuid = leadRow.id;
    }
    if (invoice.projectId) {
      const { data: projectRow } = await supabase.from("projects").select("id").eq("external_id", invoice.projectId).maybeSingle();
      if (projectRow?.id) projectDbUuid = projectRow.id;
    }

    const payload = {
      invoice_number: invoice.invoiceNumber,
      lead_id: leadDbUuid,
      project_id: projectDbUuid,
      operating_company: invoice.operatingCompany,
      bill_to: invoice.billTo,
      description: invoice.description,
      quantity: invoice.quantity ?? 1,
      unit_price: invoice.unitPrice,
      subtotal: invoice.subtotal,
      gst_enabled: invoice.gstEnabled,
      gst_rate: invoice.gstRate,
      gst_amount: invoice.gstAmount,
      total: invoice.total,
      issue_date: invoice.issueDate || new Date().toISOString().slice(0, 10),
      due_date: invoice.dueDate || null,
      contract_value: invoice.contractValue,
      deposit_percent: invoice.depositPercent,
      deposit_amount: invoice.depositAmount,
      currency: invoice.currency || "USD",
      payment_terms: invoice.paymentTerms || null,
      payment_instructions: invoice.paymentInstructions || null,
      external_payment_link: invoice.externalPaymentLink || null,
      status: invoice.status,
      sent_at: invoice.sentAt || null,
      transaction_reference: invoice.transactionReference || null,
      confirmed_paid_at: invoice.confirmedPaidAt || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("invoices").upsert(payload, { onConflict: "invoice_number" });
    if (error) {
      console.warn("Error syncing invoice to Supabase:", error.message || error);
    }
  } catch (err) {
    console.warn("Failed to sync invoice to Supabase:", err);
  }
}

export function saveInvoice(invoice: StoredInvoice) {
  const current = readInvoices();
  const existingIndex = current.findIndex((item) => item.invoiceNumber === invoice.invoiceNumber);
  const updatedList = existingIndex >= 0
    ? current.map((item, idx) => idx === existingIndex ? { ...item, ...invoice, updatedAt: new Date().toISOString() } : item)
    : [invoice, ...current];

  writeInvoices(updatedList);

  // Sync to associated lead
  if (invoice.leadId) {
    const leadInvoice: LeadInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      operatingCompany: invoice.operatingCompany,
      billTo: invoice.billTo,
      description: invoice.description,
      quantity: invoice.quantity,
      unitPrice: invoice.unitPrice,
      subtotal: invoice.subtotal,
      gstEnabled: invoice.gstEnabled,
      gstRate: invoice.gstRate,
      gstAmount: invoice.gstAmount,
      total: invoice.total,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      contractValue: invoice.contractValue,
      depositPercent: invoice.depositPercent,
      depositAmount: invoice.depositAmount,
      currency: invoice.currency,
      paymentTerms: invoice.paymentTerms,
      paymentInstructions: invoice.paymentInstructions,
      externalPaymentLink: invoice.externalPaymentLink || "",
      status: invoice.status,
      sentAt: invoice.sentAt,
      transactionReference: invoice.transactionReference,
      confirmedPaidAt: invoice.confirmedPaidAt,
    };
    updateLead(invoice.leadId, { invoice: leadInvoice });
  }

  // Sync to associated project
  if (invoice.projectId) {
    const leadInvoice: LeadInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      operatingCompany: invoice.operatingCompany,
      billTo: invoice.billTo,
      description: invoice.description,
      quantity: invoice.quantity,
      unitPrice: invoice.unitPrice,
      subtotal: invoice.subtotal,
      gstEnabled: invoice.gstEnabled,
      gstRate: invoice.gstRate,
      gstAmount: invoice.gstAmount,
      total: invoice.total,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      contractValue: invoice.contractValue,
      depositPercent: invoice.depositPercent,
      depositAmount: invoice.depositAmount,
      currency: invoice.currency,
      paymentTerms: invoice.paymentTerms,
      paymentInstructions: invoice.paymentInstructions,
      externalPaymentLink: invoice.externalPaymentLink || "",
      status: invoice.status,
      sentAt: invoice.sentAt,
      transactionReference: invoice.transactionReference,
      confirmedPaidAt: invoice.confirmedPaidAt,
    };
    updateProject(invoice.projectId, {
      invoice: leadInvoice,
      depositAmount: invoice.total,
      depositStatus: invoice.status === "CONFIRMED_PAID" ? "CONFIRMED_PAID" : undefined,
    });
  }

  // Persist directly to Supabase database
  void syncInvoiceToDatabase(invoice);
}

export function updateInvoice(invoiceNumber: string, updates: Partial<StoredInvoice>) {
  const current = readInvoices();
  const target = current.find((item) => item.invoiceNumber === invoiceNumber);
  if (!target) return;
  const merged: StoredInvoice = { ...target, ...updates, updatedAt: new Date().toISOString() };
  saveInvoice(merged);
}

export async function deleteInvoice(invoiceNumber: string) {
  const current = readInvoices();
  const target = current.find((item) => item.invoiceNumber === invoiceNumber);
  writeInvoices(current.filter((item) => item.invoiceNumber !== invoiceNumber));

  if (target?.leadId) {
    updateLead(target.leadId, { invoice: undefined });
  }
  if (target?.projectId) {
    updateProject(target.projectId, { invoice: undefined });
  }

  if (supabase) {
    try {
      await supabase.from("invoices").delete().eq("invoice_number", invoiceNumber);
    } catch (err) {
      console.warn("Failed to delete invoice from Supabase:", err);
    }
  }
}
