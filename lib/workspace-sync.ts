export type WorkspaceCollection = "leads" | "projects" | "management" | "postSaleOperations";

type WorkspaceStorageEntry = { key: string; legacyKeys: string[]; changedEvent: string };

export const workspaceStorage: Record<WorkspaceCollection, WorkspaceStorageEntry> = {
  leads: { key: "evecture.leads.v1", legacyKeys: ["everture.leads.v1"], changedEvent: "evecture:leads-updated" },
  projects: { key: "evecture.projects.v1", legacyKeys: ["everture.projects.v1"], changedEvent: "evecture:projects-updated" },
  management: { key: "evecture.post-sale.v1", legacyKeys: [], changedEvent: "evecture:post-sale-updated" },
  postSaleOperations: { key: "evecture.post-sale-operations.v1", legacyKeys: [], changedEvent: "evecture:post-sale-operations-updated" },
};

export type WorkspaceRecord = { recordId: string; order: number; data: unknown };
export type LocalWorkspaceChange = { collection: WorkspaceCollection; data: unknown };

/** Parse browser storage without allowing one damaged value to break the workspace. */
export function parseStoredJson(raw: string | null): unknown | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function publishLocalWorkspaceChange(collection: WorkspaceCollection, data: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LocalWorkspaceChange>("evecture:workspace-local-updated", { detail: { collection, data } }));
}

export function recordsForCollection(collection: WorkspaceCollection, data: unknown): WorkspaceRecord[] {
  if (collection === "postSaleOperations") return [{ recordId: "snapshot", order: 0, data }];
  if (!Array.isArray(data)) return [];
  return data.flatMap((item, order) => {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string") return [];
    return [{ recordId: (item as { id: string }).id, order, data: item }];
  });
}

export function dataForRecords(collection: WorkspaceCollection, records: WorkspaceRecord[]) {
  if (collection === "postSaleOperations") {
    return records.find((record) => record.recordId === "snapshot")?.data ?? { tenants: [], patrols: [], growthItems: [], tickets: [] };
  }
  return [...records].sort((left, right) => left.order - right.order).map((record) => record.data);
}

export function localCollectionValue(collection: WorkspaceCollection): { exists: boolean; value?: unknown } {
  if (typeof window === "undefined") return { exists: false };
  const config = workspaceStorage[collection];
  for (const key of [config.key, ...config.legacyKeys]) {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const value = parseStoredJson(raw);
      return value === undefined ? { exists: false } : { exists: true, value };
    }
  }
  return { exists: false };
}

export function applyRemoteCollection(collection: WorkspaceCollection, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(workspaceStorage[collection].key, JSON.stringify(value));
  window.dispatchEvent(new Event(workspaceStorage[collection].changedEvent));
}
