import {retainerEndDate} from "@/lib/retainer-dates";
import { reserveWorkspaceNumber } from "@/lib/numbering";
import { localCollectionValue, publishLocalWorkspaceChange } from "@/lib/workspace-sync";
import type {ProjectClient} from "@/lib/projects";

export const POST_SALE_STORAGE_KEY = "evecture.post-sale.v1";

export type ManagementModel = "Annual maintenance" | "Continuous retainer" | "Direct-sold software" | "Ad-hoc support";
export type ManagementBillingCycle = "Monthly" | "Quarterly" | "Annual" | "One-time";
export type ManagementStatus = "ACTIVE" | "PAUSED" | "ENDED";

export type ManagedProject = {
  id: string;
  sourceProjectId?: string;
  projectTitle: string;
  clientCompany: string;
  clientDetails?: Omit<ProjectClient,"companyName"> & {deleted?:boolean};
  model: ManagementModel;
  managementAmount: number;
  currency: string;
  billingCycle: ManagementBillingCycle;
  periodStart: string;
  periodEnd?: string;
  status: ManagementStatus;
  createdAt: string;
};

export function readManagedProjects(): ManagedProject[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = localCollectionValue("management").value ?? [];
    return Array.isArray(parsed) ? parsed as ManagedProject[] : [];
  } catch {
    return [];
  }
}

export function writeManagedProjects(items: ManagedProject[]) {
  if (typeof window === "undefined") return;
  publishLocalWorkspaceChange("management", items);
  window.dispatchEvent(new Event("evecture:post-sale-updated"));
}

export function addManagedProject(item: ManagedProject) {
  writeManagedProjects([{...item,periodEnd:retainerEndDate(item)}, ...readManagedProjects()]);
}

export function updateManagedProject(id: string, updates: Partial<ManagedProject>) {
  writeManagedProjects(readManagedProjects().map((item) => item.id === id ? { ...item, ...updates } : item));
}

export function deleteManagedProject(id: string) {
  writeManagedProjects(readManagedProjects().filter((item) => item.id !== id));
}

export function nextManagedProjectId() { return reserveWorkspaceNumber("retainer","Evecture"); }
