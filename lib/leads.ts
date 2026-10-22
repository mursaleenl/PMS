import { publishLocalWorkspaceChange } from "@/lib/workspace-sync";
import type { OperatingCompany } from "@/lib/companies";

export const LEADS_STORAGE_KEY = "evecture.leads.v1";

export const serviceTypes = ["Branding", "Website", "E-commerce", "UI/UX", "CRM", "Custom Request", "Multiple"] as const;
export const industries = ["Hospitality", "E-commerce", "Education", "Professional Services", "Other"] as const;
export const enquirySources = ["Website form", "Direct email", "Phone / WhatsApp", "Referral", "Instagram DM", "LinkedIn DM"] as const;
export const acquisitionSources = ["Google", "Referral", "Instagram", "LinkedIn", "Repeat client", "Other / unknown"] as const;
export const budgetRanges = ["Under $2,500", "$2,500–$5,000", "$5,000–$10,000", "$10,000–$25,000", "$25,000+", "Not sure yet"] as const;

export type LeadStatus = "NEW" | "QUALIFIED" | "PROPOSAL_SENT" | "ACCEPTED" | "CONVERTED" | "LOST" | "DISQUALIFIED";

export type Qualification = {
  discoveryCallAt?: string;
  callNotes: string;
  actualProblem: string;
  desiredOutcome: string;
  budgetFit: "yes" | "no" | "unknown";
  decisionMaker: string;
  decisionTimeline: string;
  goodFit: "yes" | "no" | "unknown";
};

export type ProposalVersion = {
  version: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "SUPERSEDED";
  createdAt: string;
  sentAt?: string;
  expiryDate: string;
  finalFollowUpDate: string;
  quotedAmount: number;
  currency: string;
  scopeIncluded: string;
  scopeExcluded: string;
  deliverables: string;
  revisionRounds: number;
  depositPercent: number;
  billingStructure: "Fixed" | "Hourly" | "Retainer";
  paymentTerms: string;
  approvalProcess: string;
  clientRequirements: string;
  assumptions: string;
  documentName: string;
  documentDataUrl?: string;
  followUps: { label: string; dueAt: string; loggedAt?: string }[];
};

export type LeadInvoice = {
  invoiceNumber: string;
  operatingCompany?: OperatingCompany;
  billTo?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  subtotal?: number;
  gstEnabled?: boolean;
  gstRate?: number;
  gstAmount?: number;
  total?: number;
  issueDate: string;
  dueDate: string;
  contractValue: number;
  depositPercent: number;
  depositAmount: number;
  currency: string;
  paymentTerms: string;
  paymentInstructions: string;
  externalPaymentLink: string;
  status: "GENERATED" | "SENT" | "CONFIRMED_PAID";
  sentAt?: string;
  transactionReference?: string;
  confirmedPaidAt?: string;
};

export function nextInvoiceNumber(leads: Lead[], operatingCompany: OperatingCompany) {
  const year = new Date().getFullYear();
  const prefix = operatingCompany === "Servn" ? "SER" : "EVE";
  const values = leads.map((lead) => lead.invoice?.invoiceNumber.match(new RegExp(`^${prefix}-INV-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `${prefix}-INV-${year}-${String(Math.max(0, ...values) + 1).padStart(3, "0")}`;
}

export type Lead = {
  id: string;
  createdAt: string;
  fullName: string;
  designation: string;
  companyName: string;
  companyWebsite: string;
  email: string;
  phone: string;
  country: string;
  timezone: string;
  services: string[];
  industry: string;
  description: string;
  referenceLinks: string;
  budgetRange: string;
  budgetShared: boolean;
  budgetNote: string;
  urgency: "Standard" | "Rush";
  source: string;
  acquisitionSource: string;
  operatingCompany?: OperatingCompany;
  status: LeadStatus;
  firstContactAt?: string;
  disqualificationReason?: string;
  qualificationNote?: string;
  qualification?: Qualification;
  proposals?: ProposalVersion[];
  acceptedAt?: string;
  acceptanceName?: string;
  acceptanceDocumentName?: string;
  acceptanceDocumentDataUrl?: string;
  invoice?: LeadInvoice;
  projectId?: string;
};

export function readLeads(): Lead[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(LEADS_STORAGE_KEY) ?? window.localStorage.getItem("everture.leads.v1");
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.map((item) => {
      const lead = item as Lead;
      return {
        ...lead,
        operatingCompany: (lead.operatingCompany as string | undefined) === "Servyn" ? "Servn" : lead.operatingCompany,
        invoice: lead.invoice ? {
          ...lead.invoice,
          operatingCompany: (lead.invoice.operatingCompany as string | undefined) === "Servyn" ? "Servn" : lead.invoice.operatingCompany,
        } : undefined,
      };
    }) : [];
  } catch {
    return [];
  }
}

export function writeLeads(leads: Lead[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads));
    window.dispatchEvent(new Event("evecture:leads-updated"));
    publishLocalWorkspaceChange("leads", leads);
  }
}

export function addLead(lead: Lead) {
  writeLeads([lead, ...readLeads()]);
}

export function updateLead(id: string, updates: Partial<Lead>) {
  writeLeads(readLeads().map((lead) => lead.id === id ? { ...lead, ...updates } : lead));
}

export function formatLeadId(id: string) {
  return `LEAD-${id.slice(-6).toUpperCase()}`;
}
