export type WorkspaceCollection = "leads" | "projects" | "management" | "postSaleOperations" | "invoices" | "generalTasks";
export const workspaceStorage: Record<WorkspaceCollection, {changedEvent:string}> = {
  generalTasks: {changedEvent:"evecture:general-tasks-updated"},
  leads: { changedEvent: "evecture:leads-updated" }, projects: { changedEvent: "evecture:projects-updated" },
  management: { changedEvent: "evecture:post-sale-updated" }, postSaleOperations: { changedEvent: "evecture:post-sale-operations-updated" }, invoices: { changedEvent: "evecture:invoices-updated" },
};
export type LocalWorkspaceChange = { collection: WorkspaceCollection; data: unknown };
const memoryCollections: Partial<Record<WorkspaceCollection, unknown>> = {};
let saveHandler: (() => Promise<void>) | undefined;
export function registerWorkspaceSaver(handler?: () => Promise<void>) { saveHandler = handler; }
export async function flushPendingWorkspaceChanges() { if (saveHandler) await saveHandler(); }
export async function flushWorkspaceChanges() {
  if (!saveHandler) throw new Error("Workspace data is not ready. Wait for it to load and retry.");
  await saveHandler();
}
export function clearWorkspaceMemory() {
  for (const collection of Object.keys(workspaceStorage) as WorkspaceCollection[]) {
    delete memoryCollections[collection];
    if (typeof window !== "undefined") window.dispatchEvent(new Event(workspaceStorage[collection].changedEvent));
  }
}
export function clearLegacyBrowserWorkspaceData() {
  if (typeof window === "undefined") return;
  for (const key of ["evecture.leads.v1", "everture.leads.v1", "evecture.projects.v1", "everture.projects.v1", "evecture.post-sale.v1", "evecture.post-sale-operations.v1", "evecture.invoices.v1", "evecture:notifications"]) window.localStorage.removeItem(key);
}
export function publishLocalWorkspaceChange(collection: WorkspaceCollection, data: unknown) {
  if (typeof window === "undefined") return;
  memoryCollections[collection] = structuredClone(data);
  window.dispatchEvent(new CustomEvent<LocalWorkspaceChange>("evecture:workspace-local-updated", { detail: { collection, data } }));
}
export function localCollectionValue(collection: WorkspaceCollection): {exists:boolean;value?:unknown} {
  return Object.prototype.hasOwnProperty.call(memoryCollections,collection) ? {exists:true,value:structuredClone(memoryCollections[collection])} : {exists:false};
}
export function workspaceValues() { return structuredClone(memoryCollections); }
export function applyRemoteCollection(collection: WorkspaceCollection, value: unknown) {
  memoryCollections[collection] = structuredClone(value);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(workspaceStorage[collection].changedEvent));
}
