export type WorkspaceCollection = "leads" | "projects" | "management" | "postSaleOperations" | "invoices";

type WorkspaceStorageEntry = { changedEvent: string };

export const workspaceStorage: Record<WorkspaceCollection, WorkspaceStorageEntry> = {
  leads: { changedEvent: "evecture:leads-updated" },
  projects: { changedEvent: "evecture:projects-updated" },
  management: { changedEvent: "evecture:post-sale-updated" },
  postSaleOperations: { changedEvent: "evecture:post-sale-operations-updated" },
  invoices: { changedEvent: "evecture:invoices-updated" },
};

export type WorkspaceRecord = { recordId: string; order: number; data: unknown };
export type LocalWorkspaceChange = { collection: WorkspaceCollection; data: unknown };

// Workspace data is kept only in memory while the app is open. Supabase is the
// sole persistent source of truth; this store is just a synchronous bridge for
// the existing client screens while their async query is in flight.
const memoryCollections: Partial<Record<WorkspaceCollection, unknown>> = {};
const legacyBrowserWorkspaceKeys = [
  "evecture.leads.v1",
  "everture.leads.v1",
  "evecture.projects.v1",
  "everture.projects.v1",
  "evecture.post-sale.v1",
  "evecture.post-sale-operations.v1",
  "evecture.invoices.v1",
  "evecture:notifications",
];

/** Remove data written by versions of the app that used browser persistence. */
export function clearLegacyBrowserWorkspaceData() {
  if (typeof window === "undefined") return;
  for (const key of legacyBrowserWorkspaceKeys) window.localStorage.removeItem(key);
}

export function publishLocalWorkspaceChange(collection: WorkspaceCollection, data: unknown) {
  if (typeof window === "undefined") return;
  memoryCollections[collection] = data;
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
  return Object.prototype.hasOwnProperty.call(memoryCollections, collection)
    ? { exists: true, value: memoryCollections[collection] }
    : { exists: false };
}

export function applyRemoteCollection(collection: WorkspaceCollection, value: unknown) {
  if (typeof window === "undefined") return;
  memoryCollections[collection] = value;
  window.dispatchEvent(new Event(workspaceStorage[collection].changedEvent));
}
