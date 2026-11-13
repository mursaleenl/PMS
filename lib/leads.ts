import { localCollectionValue, publishLocalWorkspaceChange } from "@/lib/workspace-sync";
import type { OperatingCompany } from "@/lib/companies";

export const LEADS_STORAGE_KEY = "evecture.leads.v1";

export const serviceTypes = ["Branding", "Website", "E-commerce", "UI/UX", "CRM", "Custom Request", "Multiple"] as const;
export const industries = [
  "Organization", "Nonprofit / NGO", "Government / Public Sector", "Hospitality",
  "E-commerce", "Retail", "Education", "Healthcare", "Technology", "Professional Services",
  "Finance / Insurance", "Real Estate", "Construction", "Manufacturing", "Food & Beverage",
  "Travel & Tourism", "Media & Entertainment", "Transportation / Logistics", "Other",
] as const;
export const enquirySources = ["Website form", "Direct email", "Phone / WhatsApp", "Referral", "Instagram DM", "LinkedIn DM"] as const;
export const acquisitionSources = ["Google", "Referral", "Instagram", "LinkedIn", "Repeat client", "Other / unknown"] as const;
export const budgetRanges = ["Under $2,500", "$2,500–$5,000", "$5,000–$10,000", "$10,000–$25,000", "$25,000+", "Not sure yet"] as const;

export type LeadStatus = "NEW" | "PROPOSAL_SENT" | "ACCEPTED" | "CONVERTED" | "LOST";

// Normalize retired stages only when reading old records or saving them again.
export function normalizeLeadStatus(value: unknown): LeadStatus {
  if (value === "DISQUALIFIED") return "LOST";
  return ["NEW", "PROPOSAL_SENT", "ACCEPTED", "CONVERTED", "LOST"].includes(String(value))
    ? value as LeadStatus : "NEW";
}

export type Qualification = {
  clientDeleted?: boolean;
  proposalAttachment?: { name: string; dataUrl: string };
  discoveryCallAt?: string;
  callNotes?: string;
  actualProblem?: string;
  desiredOutcome?: string;
  budgetFit?: "yes" | "no" | "unknown";
  decisionMaker?: string;
  decisionTimeline?: string;
  goodFit?: "yes" | "no" | "unknown";
};

export type ProposalVersion = {
  version: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED" | "CHANGES_REQUESTED" | "SUPERSEDED";
  createdAt: string;
  sentAt?: string;
  viewedAt?: string;
  respondedAt?: string;
  shareToken?: string;
  proposalTitle?: string;
  projectTitle?: string;
  preparedBy?: string;
  executiveSummary?: string;
  challenge?: string;
  approach?: string;
  background?: string;
  objectives?: string;
  timeline?: string;
  softwareProcessModel?: string;
  processActivities?: string;
  budgetBreakdown?: string;
  systemArchitecture?: string;
  riskAssessment?: string;
  resources?: string;
  technicalSpecifications?: string;
  timelineDeliverables?: string;
  conclusion?: string;
  aboutUs?: string;
  howWeWork?: string;
  recentWork?: string;
  testimonial?: string;
  paymentSchedule?: string;
  changeRequestPolicy?: string;
  intellectualProperty?: string;
  warrantySupport?: string;
  cancellationPolicy?: string;
  changeRequest?: string;
  responseName?: string;
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
  paymentTerms?: string;
  paymentInstructions?: string;
  externalPaymentLink?: string;
  status: "GENERATED" | "SENT" | "CONFIRMED_PAID";
  sentAt?: string;
  transactionReference?: string;
  confirmedPaidAt?: string;
};

export type Lead = {
  id: string;
  projectName?: string;
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
    const parsed: unknown = localCollectionValue("leads").value ?? [];
    return Array.isArray(parsed) ? parsed.map((item) => {
      const lead = item as Lead;
      return {
        ...lead,
        status: normalizeLeadStatus(lead.status),
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
    publishLocalWorkspaceChange("leads", leads);
    window.dispatchEvent(new Event("evecture:leads-updated"));
  }
}

export function addLead(lead: Lead) {
  writeLeads([lead, ...readLeads()]);
}

export const SEEDED_PROPOSAL_LEAD_ID = "LEAD-IRONWOOD-2026";
export const SEEDED_PROPOSAL_TOKEN = "proposal-ironwood-field-inspection-2026";

export function seedProposalExample() {
  if (typeof window === "undefined") return false;
  const leads = readLeads();
  if (leads.some((lead) => lead.id === SEEDED_PROPOSAL_LEAD_ID)) return false;

  const now = new Date().toISOString();
  const proposal: ProposalVersion = {
    version: 1,
    status: "SENT",
    createdAt: now,
    sentAt: now,
    viewedAt: undefined,
    shareToken: SEEDED_PROPOSAL_TOKEN,
    proposalTitle: "Field Inspection App for Ironwood Construction",
    projectTitle: "Field Inspection App",
    preparedBy: "Mursaleen — Matrix 2026001\nHanan — Matrix 2026002\nAisha — Matrix 2026003\nDaniel — Matrix 2026004",
    executiveSummary: "Ironwood Construction needs a reliable way to replace paper forms, scattered iPhone photos, and project-manager-specific Dropbox folders. We propose a purpose-built field inspection app for superintendents and foremen, paired with a web dashboard for project managers and office staff. The 14-week delivery will be piloted on two active job sites before company-wide rollout.",
    challenge: "Ironwood runs 22 concurrent projects and produces 15–30 inspection records per superintendent each day. Records are difficult to search, slow to validate during billing disputes, and expensive to update when safety or insurance requirements change. The current workflow works, but it costs roughly a day per superintendent each week and makes important project evidence difficult to retrieve.",
    approach: "We will build the product in four controlled phases: discovery, MVP build, pilot, and launch and handoff. Scope will be locked after discovery, the most-used inspection workflows will be prioritised, and real superintendents will use the product on two active sites before wider rollout.",
    background: "Ironwood’s inspection records contain valuable safety, quality, subcontractor, and equipment information, but that information is fragmented across paper, group messages, email, and shared folders. A central, timestamped system will make records easier to trust, search, share, and use when making operational or billing decisions.",
    objectives: "• Replace paper inspection records with a mobile-first digital workflow.\n• Capture timestamped, geotagged inspections with inline photos.\n• Make records searchable by project, subcontractor, date, and inspection type.\n• Support offline field work and automatic synchronisation when connectivity returns.\n• Pilot the system on two job sites within 14 weeks and prepare it for company-wide rollout.",
    scopeIncluded: "• iOS app in React Native with one Android build for the committed foremen.\n• React and TypeScript web dashboard for project managers and office staff.\n• Postgres, Fastify, AWS ECS Fargate, RDS, and S3 photo storage.\n• Five inspection form types defined during discovery.\n• Offline mode with automatic sync and conflict resolution.\n• Inline photo capture with compression and metadata preservation.\n• Google Workspace SSO, project and subcontractor management, search, filtering, CSV export, and admin tools.\n• Source code, documentation, and infrastructure handoff.\n• Thirty-day post-launch bug-fix warranty.",
    scopeExcluded: "• QuickBooks or Sage billing integration.\n• Self-service inspection form builder.\n• Advanced analytics beyond search, filtering, and CSV export.\n• Subcontractor-facing portal.\n• Full Android parity beyond the committed build.\n• Insurance-carrier PDF generation and compliance certifications.",
    deliverables: "• Requirements document, data model, and locked scope.\n• Mobile inspection application.\n• Web project-management dashboard.\n• Production backend and AWS infrastructure.\n• Pilot deployment on two job sites.\n• Training sessions, runbook, source code, and technical handoff.",
    revisionRounds: 2,
    depositPercent: 20,
    billingStructure: "Fixed",
    quotedAmount: 85000,
    currency: "USD",
    paymentTerms: "Invoices are payable within 14 days. Late payment beyond 30 days may pause work after written notice.",
    approvalProcess: "Weekly Monday check-in, Friday demo video, written scope decisions during discovery, and written approval for change requests.",
    clientRequirements: "Ironwood will provide access to two active job sites, representative superintendents and PMs, current inspection forms, Google Workspace access, timely feedback, and approvals.",
    assumptions: "The pilot sites are within driving distance of Ironwood headquarters. Third-party hosting and monitoring costs are paid directly by Ironwood and are not included in the project total.",
    timeline: "Weeks 1–2: Discovery\nWeeks 3–9: MVP build\nWeeks 10–12: Pilot\nWeeks 13–14: Launch and handoff\nWeeks 15–18: Warranty period",
    softwareProcessModel: "An iterative phased delivery model is the best fit. Discovery locks the workflow and scope, the MVP phase builds the highest-value product, the pilot validates real field behaviour, and launch follows only after the agreed workflows are proven. This reduces the risk of building against assumptions while keeping decision-makers involved at each milestone.",
    processActivities: "Discovery — two on-site observation days, interviews, form review, requirements, data model, and decision log.\nMVP build — parallel mobile, dashboard, backend, authentication, offline sync, photo, and admin development with weekly demos.\nPilot — two active job sites use the product daily; the team observes, fixes bugs within 48 hours, and refines confusing workflows.\nLaunch and handoff — production rollout, two training sessions, runbook, source-code transfer, and a 30-day warranty.\nQuality assurance — acceptance criteria per feature, code review, device testing, offline/online sync testing, security review, pilot feedback, and regression testing before launch.",
    budgetBreakdown: "Discovery — $9,500\nMobile MVP build — $32,000\nWeb dashboard and backend — $28,000\nPilot and iteration — $9,500\nLaunch, training, and handoff — $6,000\n30-day warranty — $0\nEstimated project total — $85,000 USD\nAWS and third-party services are estimated at $280/month and paid directly by Ironwood.",
    systemArchitecture: "The mobile application will use React Native for iOS and the committed Android build. The web dashboard will use React and TypeScript. Fastify will expose the backend API, Postgres will store structured project and inspection data, and AWS ECS Fargate, RDS, and S3 will support deployment and photo storage. Google Workspace SSO will provide authentication. The mobile client will maintain a local queue for offline records and reconcile changes when connectivity returns.",
    riskAssessment: "Connectivity risk — design and test offline capture and conflict resolution on rural sites.\nScope risk — lock the MVP at the end of discovery and route later changes through written change orders.\nAdoption risk — involve superintendents in discovery and pilot with real daily workflows.\nData risk — use role-based access, encrypted transport, controlled S3 access, and regular backups.\nSchedule risk — prioritise the five highest-value form types and make pilot readiness a formal milestone.",
    resources: "Product lead, engineering lead, mobile engineer, web/backend engineer, QA support, Ironwood project sponsor, two superintendent pilot users, PM representatives, two pilot job sites, iPhones, one supported Android device, AWS account, Google Workspace, and current inspection-form samples.",
    technicalSpecifications: "Data sources include project records, subcontractors, inspection forms, photos, timestamps, geolocation, and user identity. Core entities are projects, users, subcontractors, inspection types, inspection records, responses, photos, and audit events. The system will use TypeScript, React Native, React, Fastify, Postgres, AWS, Google Workspace SSO, and object storage. Security includes authenticated access, role-based permissions, encrypted transport, controlled file access, audit-friendly timestamps, backups, and environment separation.",
    timelineDeliverables: "Week 2 — requirements document, data model, decision list, and locked scope.\nWeek 9 — mobile MVP, dashboard, backend, authentication, and staging environment.\nWeek 12 — pilot report, resolved pilot defects, and refined workflows.\nWeek 14 — production launch, training, runbook, source code, and infrastructure handoff.\nWeek 18 — warranty period complete and transition to support agreement or in-house ownership.",
    conclusion: "This proposal replaces a fragmented inspection workflow with a field-ready system designed around Ironwood’s real projects. It will reduce time spent searching for records, strengthen billing evidence, and give the company a dependable foundation for future reporting and integrations. Approval of this proposal allows discovery to begin and reserves the delivery team for the 14-week build.",
    aboutUs: "EVECTURE is a custom software studio focused on internal tools and B2B products for operational teams. We work closely with the people who use the software every day and keep one engineering lead involved from discovery through handoff.",
    howWeWork: "We work in short, visible delivery cycles with weekly decisions, Friday demos, written scope control, and direct access to the people building the product. Pilot users are involved before launch so usability and reliability are tested in the real environment.",
    recentWork: "Cascade Freight Solutions — dispatcher tool replacing a legacy operations screen.\nMeridian Anesthesia — checklist application for clinical teams.\nKestrel Metals — QA/QC platform integrated with an existing ERP.",
    testimonial: "EVECTURE hit every milestone, launched on schedule, and gave our team a system we could confidently recommend to others in our industry. — Mike Delaney, COO, Cascade Freight Solutions",
    paymentSchedule: "20% ($17,000) due on signing.\n30% ($25,500) due at the start of the MVP build in Week 3.\n30% ($25,500) due at the start of the pilot in Week 10.\n20% ($17,000) due on successful launch at the end of Week 14.",
    changeRequestPolicy: "Scope is locked at the end of Discovery. Changes after that point require a written estimate covering the impact on scope, cost, and timeline, followed by client approval before work starts.",
    intellectualProperty: "On final payment, source code, designs, documentation, and project infrastructure ownership transfer to Ironwood Construction. There are no ongoing licensing fees or hidden dependencies on EVECTURE infrastructure.",
    warrantySupport: "The 30-day warranty covers defects in functionality included in the agreed scope. New features, post-launch changes, and infrastructure changes are handled through a support agreement or separate engagement.",
    cancellationPolicy: "Either party may cancel with 14 days written notice. Ironwood is responsible for completed work and committed third-party costs. Any credit for a cancellation by EVECTURE is calculated pro rata against the most recent milestone payment.",
    expiryDate: "2026-11-26",
    finalFollowUpDate: "2026-11-29",
    documentName: "Online proposal",
    followUps: [
      { label: "Initial follow-up", dueAt: "2026-11-26T09:00:00.000Z" },
      { label: "Second follow-up", dueAt: "2026-11-29T09:00:00.000Z" },
    ],
  };

  const lead: Lead = {
    id: SEEDED_PROPOSAL_LEAD_ID,
    createdAt: now,
    fullName: "Jordan Ellis",
    designation: "Operations Director",
    companyName: "Ironwood Construction",
    companyWebsite: "https://ironwood.example.com",
    email: "jordan@ironwood.example.com",
    phone: "+1 555 014 2026",
    country: "United States",
    timezone: "America/Los_Angeles",
    services: ["Custom Request"],
    industry: "Professional Services",
    description: proposal.executiveSummary || "",
    referenceLinks: "",
    budgetRange: "$25,000+",
    budgetShared: true,
    budgetNote: "Approved budget range for the initial system build.",
    urgency: "Standard",
    source: "Direct email",
    acquisitionSource: "Referral",
    status: "PROPOSAL_SENT",
    proposals: [proposal],
  };

  writeLeads([lead, ...leads]);
  return true;
}

export function updateLead(id: string, updates: Partial<Lead>) {
  writeLeads(readLeads().map((lead) => lead.id === id ? { ...lead, ...updates } : lead));
}

export function formatLeadId(id: string) {
  return `LEAD-${id.slice(-6).toUpperCase()}`;
}
