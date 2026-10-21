import type { Lead, LeadInvoice, ProposalVersion } from "@/lib/leads";
import { publishLocalWorkspaceChange } from "@/lib/workspace-sync";

export const PROJECTS_STORAGE_KEY = "evecture.projects.v1";

export type ProjectClassification = "New Client" | "Repeat Client" | "Referral";
export type BillingStructure = "Fixed" | "Hourly" | "Retainer";

export type ProjectTeamMember = {
  role: "Project Manager" | "Lead Designer" | "Lead Developer" | "QA Owner" | "Supporting team member";
  name: string;
  allocationPercent: number;
};

export type KickoffTask = {
  id: string;
  title: string;
  createdAt: string;
  status: "TO_DO" | "IN_PROGRESS" | "DONE";
  source: "KICKOFF";
};

export type ProjectWorkItem = {
  id: string;
  title: string;
  kind: "FEATURE_DEV" | "CLIENT_FEEDBACK_TODO" | "QA_BUG";
  assignee: string;
  priority: "P1" | "P2" | "P3" | "P4";
  estimatedHours: number;
  loggedHours: number;
  createdAt: string;
  status: "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "UNDER_REVIEW" | "DONE";
  timerStartedAt?: string;
  blockerReason?: string;
  proof?: { pullRequestUrl?: string; stagingUrl?: string; recordingUrl?: string; notes: string };
  reviewNotes?: string;
  revisionRequested?: boolean;
};

export type ProjectLinks = { staging?: string; repository?: string; design?: string; other?: string };

export type Project = {
  id: string;
  leadId: string;
  createdAt: string;
  title: string;
  clientCompany: string;
  clientName: string;
  clientEmail: string;
  services: string[];
  classification: ProjectClassification;
  startDate: string;
  billingStructure: BillingStructure;
  contractedValue: number;
  currency: string;
  depositAmount?: number;
  depositStatus?: "CONFIRMED_PAID";
  invoice?: LeadInvoice;
  proposalVersion: number;
  signedContractName?: string;
  signedContractDataUrl?: string;
  scopeIncluded: string;
  scopeExcluded: string;
  assumptions: string;
  revisionRounds: number;
  team: ProjectTeamMember[];
  kickoffScheduledAt: string;
  kickoffHeldAt?: string;
  kickoffNotes?: string;
  tasks: KickoffTask[];
  workItems?: ProjectWorkItem[];
  links?: ProjectLinks;
  status: "ACTIVE";
};

export function readProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY) ?? window.localStorage.getItem("everture.projects.v1");
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed as Project[] : [];
  } catch {
    return [];
  }
}

export function writeProjects(projects: Project[]) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    window.dispatchEvent(new Event("evecture:projects-updated"));
    publishLocalWorkspaceChange("projects", projects);
  }
}

export function addProject(project: Project) {
  writeProjects([project, ...readProjects()]);
}

export function updateProject(id: string, updates: Partial<Project>) {
  writeProjects(readProjects().map((project) => project.id === id ? { ...project, ...updates } : project));
}

export function nextProjectId(projects = readProjects()) {
  const year = new Date().getFullYear();
  const sequence = projects.map((project) => project.id.match(new RegExp(`^EVE-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `EVE-${year}-${String(Math.max(0, ...sequence) + 1).padStart(3, "0")}`;
}

export function projectFromLead(input: {
  lead: Lead;
  proposal: ProposalVersion;
  title: string;
  classification: ProjectClassification;
  startDate: string;
  kickoffScheduledAt: string;
  team: ProjectTeamMember[];
}): Project {
  const { lead, proposal } = input;
  const invoice = lead.invoice;
  return {
    id: nextProjectId(),
    leadId: lead.id,
    createdAt: new Date().toISOString(),
    title: input.title,
    clientCompany: lead.companyName,
    clientName: lead.fullName,
    clientEmail: lead.email,
    services: lead.services,
    classification: input.classification,
    startDate: input.startDate,
    billingStructure: proposal.billingStructure,
    contractedValue: proposal.quotedAmount,
    currency: proposal.currency,
    depositAmount: invoice?.depositAmount,
    depositStatus: invoice?.status === "CONFIRMED_PAID" ? "CONFIRMED_PAID" : undefined,
    invoice,
    proposalVersion: proposal.version,
    signedContractName: lead.acceptanceDocumentName,
    signedContractDataUrl: lead.acceptanceDocumentDataUrl,
    scopeIncluded: proposal.scopeIncluded,
    scopeExcluded: proposal.scopeExcluded,
    assumptions: proposal.assumptions,
    revisionRounds: proposal.revisionRounds,
    team: input.team,
    kickoffScheduledAt: input.kickoffScheduledAt,
    tasks: [],
    workItems: [],
    status: "ACTIVE",
  };
}
