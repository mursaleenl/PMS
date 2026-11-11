import { getProjectServices } from "@/lib/project-services";
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

export type ProjectEnquiryDetails = Partial<Pick<Lead, "phone" | "designation" | "companyWebsite" | "country" | "timezone" | "industry" | "description" | "referenceLinks" | "budgetRange" | "budgetShared" | "budgetNote" | "urgency" | "source" | "acquisitionSource">>;

export function getProjectEnquiryDetails(project: {enquiryDetails?:ProjectEnquiryDetails}, lead?:Lead|null):ProjectEnquiryDetails {
  const original:ProjectEnquiryDetails=lead?{phone:lead.phone,designation:lead.designation,companyWebsite:lead.companyWebsite,country:lead.country,timezone:lead.timezone,industry:lead.industry,description:lead.description,referenceLinks:lead.referenceLinks,budgetRange:lead.budgetRange,budgetShared:lead.budgetShared,budgetNote:lead.budgetNote,urgency:lead.urgency,source:lead.source,acquisitionSource:lead.acquisitionSource}:{};
  return {...original,...Object.fromEntries(Object.entries(project.enquiryDetails??{}).filter(([,value])=>value!==undefined))};
}

export type Project = {
  id: string;
  leadId: string;
  logoDataUrl?: string;
  projectType?: "client" | "internal";
  objectives?: string;
  deliverables?: string;
  targetDate?: string;
  priority?: "Low" | "Normal" | "High" | "Urgent";
  createdAt: string;
  title: string;
  clientCompany: string;
  clientName: string;
  clientEmail: string;
  enquiryDetails?: ProjectEnquiryDetails;
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

/** Managers oversee every task in projects they manage; other members see their own work. */
export function canViewProjectTask(project: Project, task: ProjectWorkItem, role: string, userId?: string | null, userName?: string) {
  if (role === "admin" || role === "project_manager") return true;
  if (role === "project_manager" && project.team.some(member => member.role === "Project Manager" && (member.userId
    ? Boolean(userId && member.userId === userId)
    : Boolean(userName?.trim() && member.name.trim().toLowerCase() === userName.trim().toLowerCase())))) return true;
  return role !== "client" && isTaskAssignedToUser(task, userId, userName);
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

function sameTeamMember(left: Pick<ProjectTeamMember, "userId" | "name">, right: Pick<ProjectTeamMember, "userId" | "name">) {
  if (left.userId && right.userId) return left.userId === right.userId;
  return left.name.trim().toLowerCase() === right.name.trim().toLowerCase();
}

function addTaskAssignees(team: ProjectTeamMember[], tasks: ProjectWorkItem[]): ProjectTeamMember[] {
  const members = [...team];
  for (const task of tasks) {
    const name = task.assignee?.trim();
    if (!name || name.toLowerCase() === "unassigned" || DUMMY_ASSIGNABLE_NAMES.has(name.toLowerCase())) continue;
    const candidate: ProjectTeamMember = { role: "Supporting team member", name, userId: task.assigneeId, allocationPercent: 0 };
    const existing = members.findIndex(member => sameTeamMember(member, candidate));
    if (existing < 0) members.push(candidate);
    else if (!members[existing].userId && candidate.userId) members[existing] = { ...members[existing], userId: candidate.userId };
  }
  return members;
}

export function getProjectTeamMembers(project: Project): ProjectTeamMember[] {
  const managers = project.team.filter(member => member.role === "Project Manager");
  const members: ProjectTeamMember[] = [];
  for (const member of addTaskAssignees(project.team, project.workItems ?? [])) {
    if (!member.name.trim() || DUMMY_ASSIGNABLE_NAMES.has(member.name.trim().toLowerCase())) continue;
    if (member.role === "Project Manager" || managers.some(manager => sameTeamMember(manager, member))) continue;
    if (!members.some(existing => sameTeamMember(existing, member))) members.push(member);
  }
  return members;
}

export function updateProject(id: string, updates: Partial<Project>) {
  writeProjects(readProjects().map((project) => {
    if (project.id !== id) return project;
    const assignedTasks = updates.workItems?.filter(task => {
      if (!task.assigneeId && !task.assignee?.trim()) return false;
      const previous = project.workItems?.find(item => item.id === task.id);
      return !previous || (previous.assigneeId || "") !== (task.assigneeId || "") || previous.assignee.trim() !== task.assignee.trim();
    }) ?? [];
    const team = assignedTasks.length ? addTaskAssignees(updates.team ?? project.team, assignedTasks) : updates.team ?? project.team;
    return { ...project, ...updates, team, ...(updates.status === undefined && project.status === "ACTIVE" && assignedTasks.length > 0 ? {status: "ON_TRACK" as const} : {}) };
  }));
}

export function deleteProject(id: string) {
  writeProjects(readProjects().filter((project) => project.id !== id));
}

export function nextProjectId(company: OperatingCompany = "Evecture"): Promise<string> { return reserveWorkspaceNumber("project",company); }

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
    enquiryDetails: getProjectEnquiryDetails({},lead),
    operatingCompany: input.operatingCompany,
    services: getProjectServices({title: input.title, clientCompany: lead.companyName, clientName: lead.fullName, services: lead.services}),
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

export async function createInternalProject(input: { title: string; description: string; startDate: string; team: ProjectTeamMember[]; objectives?: string; deliverables?: string; targetDate?: string; priority?: Project["priority"]; links?: ProjectLinks }): Promise<Project> {
  const title = input.title.trim();
  if (!title) throw new Error("Enter a project name.");
  if (input.startDate && input.targetDate && input.targetDate < input.startDate) throw new Error("Target date must be on or after the start date.");
  for (const url of Object.values(input.links ?? {})) if (url && !/^https?:\/\//i.test(url)) throw new Error("Project links must start with http:// or https://.");
  return {
    id: await nextProjectId(), projectType: "internal", leadId: "", createdAt: new Date().toISOString(),
    objectives: input.objectives?.trim(), deliverables: input.deliverables?.trim(), targetDate: input.targetDate || undefined, priority: input.priority || "Normal", links: input.links,
    title, clientCompany: "", clientName: "", clientEmail: "", services: [],
    classification: "New Client", startDate: input.startDate, billingStructure: "Fixed",
    contractedValue: 0, currency: "USD", proposalVersion: 0,
    scopeIncluded: input.description.trim(), scopeExcluded: "", assumptions: "", revisionRounds: 0,
    team: input.team, workItems: [], status: "ACTIVE",
  };
}

export function getProjectDisplayTitle(project: { title: string; clientCompany?: string; clientName?: string }): string {
  return [project.clientCompany, project.clientName, project.title]
    .map(value => value?.trim())
    .find(value => value && !/^(none|n\/a|null|undefined|-)$/i.test(value)) || "Untitled Project";
}

export function getProjectDisplayServices(project: Pick<Project, "title" | "clientCompany" | "clientName" | "services">): string {
  return getProjectServices(project).join(", ");
}
