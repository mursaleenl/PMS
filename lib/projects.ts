import type { Lead, LeadInvoice, ProposalVersion } from "@/lib/leads";
import { reserveWorkspaceNumber } from "@/lib/numbering";
import type { OperatingCompany } from "@/lib/companies";
import { localCollectionValue, publishLocalWorkspaceChange } from "@/lib/workspace-sync";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignee-names";

export const PROJECTS_STORAGE_KEY = "evecture.projects.v1";

export type ProjectClassification = "New Client" | "Repeat Client" | "Referral";
export type BillingStructure = "Fixed" | "Hourly" | "Retainer";

export type ProjectTeamMember = {
  role: "Project Manager" | "Lead Designer" | "Lead Developer" | "QA Owner" | "Supporting team member";
  name: string;
  userId?: string;
  allocationPercent: number;
};

export type ProjectWorkItem = {
  id: string;
  title: string;
  kind: "FEATURE_DEV" | "CLIENT_FEEDBACK_TODO" | "QA_BUG";
  assignee: string;
  assigneeId?: string;
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
  operatingCompany?: OperatingCompany;
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
  workItems?: ProjectWorkItem[];
  links?: ProjectLinks;
  status: "ACTIVE" | "ON_TRACK" | "COMPLETED" | "AMC";
};

export function isProjectAssignedToUser(project: Project, userId?: string | null, userName?: string) {
  const normalizedName = userName?.trim().toLocaleLowerCase();
  const matches = (assignedId?: string, assignedName?: string) => assignedId
    ? Boolean(userId && assignedId === userId)
    : Boolean(normalizedName && assignedName?.trim().toLocaleLowerCase() === normalizedName);
  return project.team.some((member) => matches(member.userId, member.name))
    || (project.workItems ?? []).some((task) => matches(task.assigneeId, task.assignee));
}

export function isTaskAssignedToUser(task: ProjectWorkItem, userId?: string | null, userName?: string) {
  if (task.assigneeId) return Boolean(userId && task.assigneeId === userId);
  const normalizedName = userName?.trim().toLocaleLowerCase();
  return Boolean(normalizedName && task.assignee.trim().toLocaleLowerCase() === normalizedName);
}

export function readProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = localCollectionValue("projects").value ?? [];
    return Array.isArray(parsed) ? parsed.map((item) => {
      const project = { ...(item as Project) } as Project & Record<string, unknown>;
      for (const legacyField of ["kickoffScheduledAt", "kickoffHeldAt", "kickoffNotes", "tasks"]) Reflect.deleteProperty(project, legacyField);
      const team = Array.isArray(project.team)
        ? project.team.map((member) => {
            if (member?.name && DUMMY_ASSIGNABLE_NAMES.has(member.name.toLowerCase().trim())) {
              return { ...member, name: "", allocationPercent: 0 };
            }
            return member;
          })
        : [];
      return {
        ...project,
        team,
        operatingCompany: (project.operatingCompany as string | undefined) === "Servyn" ? "Servn" : project.operatingCompany,
        invoice: project.invoice ? {
          ...project.invoice,
          operatingCompany: (project.invoice.operatingCompany as string | undefined) === "Servyn" ? "Servn" : project.invoice.operatingCompany,
        } : undefined,
      };
    }) : [];
  } catch {
    return [];
  }
}

export function writeProjects(projects: Project[]) {
  if (typeof window !== "undefined") {
    publishLocalWorkspaceChange("projects", projects);
    window.dispatchEvent(new Event("evecture:projects-updated"));
  }
}

export function addProject(project: Project) {
  writeProjects([project, ...readProjects()]);
}

export function updateProject(id: string, updates: Partial<Project>) {
  writeProjects(readProjects().map((project) => {
    if (project.id !== id) return project;
    const assignedTaskChanged = updates.workItems?.some(task => {
      if (!task.assigneeId && !task.assignee?.trim()) return false;
      const previous = project.workItems?.find(item => item.id === task.id);
      return !previous || (previous.assigneeId || "") !== (task.assigneeId || "") || previous.assignee.trim() !== task.assignee.trim();
    });
    return { ...project, ...updates, ...(updates.status === undefined && project.status === "ACTIVE" && assignedTaskChanged ? {status: "ON_TRACK" as const} : {}) };
  }));
}

export function deleteProject(id: string) {
  writeProjects(readProjects().filter((project) => project.id !== id));
}

export function nextProjectId(): Promise<string> { return reserveWorkspaceNumber("project","Evecture"); }

export async function projectFromLead(input: {
  lead: Lead;
  proposal?: ProposalVersion;
  contractedValue?: number;
  currency?: string;
  billingStructure?: BillingStructure;
  title: string;
  classification: ProjectClassification;
  operatingCompany: OperatingCompany;
  startDate: string;
  team: ProjectTeamMember[];
}): Promise<Project> {
  const { lead, proposal } = input;
  const invoice = lead.invoice;
  return {
    id: await nextProjectId(),
    leadId: lead.id,
    createdAt: new Date().toISOString(),
    title: input.title,
    clientCompany: lead.companyName,
    clientName: lead.fullName,
    clientEmail: lead.email,
    operatingCompany: input.operatingCompany,
    services: lead.services,
    classification: input.classification,
    startDate: input.startDate,
    billingStructure: proposal?.billingStructure ?? input.billingStructure ?? "Fixed",
    contractedValue: proposal?.quotedAmount ?? input.contractedValue ?? 0,
    currency: proposal?.currency ?? input.currency ?? "USD",
    depositAmount: invoice?.depositAmount,
    depositStatus: invoice?.status === "CONFIRMED_PAID" ? "CONFIRMED_PAID" : undefined,
    invoice,
    proposalVersion: proposal?.version ?? 0,
    signedContractName: lead.acceptanceDocumentName,
    signedContractDataUrl: lead.acceptanceDocumentDataUrl,
    scopeIncluded: proposal?.scopeIncluded ?? "",
    scopeExcluded: proposal?.scopeExcluded ?? "",
    assumptions: proposal?.assumptions ?? "",
    revisionRounds: proposal?.revisionRounds ?? 0,
    team: input.team,
    workItems: [],
    status: "ACTIVE",
  };
}

export function getProjectDisplayTitle(project: { title: string; clientCompany?: string; clientName?: string }): string {
  const title = (project.title || "").trim();
  const client = (project.clientCompany || project.clientName || "").trim();
  if (client) {
    const patterns = [`${client} — `, `${client} - `, `${client} – `];
    for (const pattern of patterns) {
      if (title.toLowerCase().startsWith(pattern.toLowerCase())) {
        const stripped = title.slice(pattern.length).trim();
        if (stripped) return stripped;
      }
    }
  }
  return title || "Untitled Project";
}
