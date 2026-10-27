import { parseStoredJson, publishLocalWorkspaceChange } from "@/lib/workspace-sync";

export const POST_SALE_STORAGE_KEY = "evecture.post-sale.v1";

export type ManagementModel = "Annual maintenance" | "Continuous retainer" | "Direct-sold software" | "Ad-hoc support";
export type ManagementBillingCycle = "Monthly" | "Quarterly" | "Annual" | "One-time";
export type ManagementStatus = "ACTIVE" | "PAUSED" | "ENDED";

export type ManagedProject = {
  id: string;
  sourceProjectId?: string;
  projectTitle: string;
  clientCompany: string;
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
    const stored = window.localStorage.getItem(POST_SALE_STORAGE_KEY);
    const parsed: unknown = parseStoredJson(stored) ?? [];
    return Array.isArray(parsed) ? parsed as ManagedProject[] : [];
  } catch {
    return [];
  }
}

export function writeManagedProjects(items: ManagedProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POST_SALE_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("evecture:post-sale-updated"));
  publishLocalWorkspaceChange("management", items);
}

export function addManagedProject(item: ManagedProject) {
  writeManagedProjects([item, ...readManagedProjects()]);
}

export function updateManagedProject(id: string, updates: Partial<ManagedProject>) {
  writeManagedProjects(readManagedProjects().map((item) => item.id === id ? { ...item, ...updates } : item));
}

export function nextManagedProjectId(items = readManagedProjects()) {
  const year = new Date().getFullYear();
  const sequence = items.map((item) => item.id.match(new RegExp(`^PS-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `PS-${year}-${String(Math.max(0, ...sequence) + 1).padStart(3, "0")}`;
}
