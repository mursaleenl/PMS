"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { applyRemoteCollection, dataForRecords, localCollectionValue, parseStoredJson, publishLocalWorkspaceChange, recordsForCollection, type LocalWorkspaceChange, type WorkspaceCollection, type WorkspaceRecord, workspaceStorage } from "@/lib/workspace-sync";
import { supabase } from "@/lib/supabase";
import { WorkspaceAuthProvider, useWorkspaceAuth } from "@/lib/workspace-auth";

const collections: WorkspaceCollection[] = ["leads", "projects", "management"];

function WorkspaceDataSync({ children }: { children: ReactNode }) {
  const { user, role } = useWorkspaceAuth();
  const loaded = useRef(false);
  const syncAvailable = useRef(false);
  const remoteSnapshots = useRef<Partial<Record<WorkspaceCollection, string>>>({});

  useEffect(() => {
    const client = supabase;
    if (!client || !user || role === "client") return;
    let cancelled = false;
    const syncInitialData = async () => {
      const result = await client.from("workspace_records").select("record_id,collection,sort_order,data").order("sort_order", { ascending: true });
      if (result.error) {
        console.warn("Supabase workspace_records table is not available; continuing with local workspace data.", result.error.message || result.error);
        loaded.current = true;
        syncAvailable.current = false;
        return;
      }
      syncAvailable.current = true;
      const grouped = new Map<WorkspaceCollection, WorkspaceRecord[]>(collections.map((collection) => [collection, []]));
      for (const record of result.data ?? []) {
        if (collections.includes(record.collection as WorkspaceCollection)) grouped.get(record.collection as WorkspaceCollection)?.push({ recordId: record.record_id, order: record.sort_order, data: record.data });
      }
      for (const collection of collections) {
        if (cancelled) return;
        const serverRecords = grouped.get(collection) ?? [];
        const serverValue = dataForRecords(collection, serverRecords);
        const serverJson = JSON.stringify(serverValue);
        const local = localCollectionValue(collection);
        remoteSnapshots.current[collection] = serverJson;
        if (serverRecords.length > 0) {
          if (!local.exists || JSON.stringify(local.value) !== serverJson) applyRemoteCollection(collection, serverValue);
        } else if (local.exists) {
          const localRecords = recordsForCollection(collection, local.value);
          await replaceCollection(collection, localRecords);
          remoteSnapshots.current[collection] = JSON.stringify(dataForRecords(collection, localRecords));
        }
      }
      loaded.current = true;
    };
    void syncInitialData();
    return () => { cancelled = true; };
  }, [user?.id, role]);

  async function replaceCollection(collection: WorkspaceCollection, records: WorkspaceRecord[]) {
    const client = supabase;
    if (!client || !user || !syncAvailable.current) return;
    const deleted = await client.from("workspace_records").delete().eq("collection", collection);
    if (deleted.error) throw new Error(deleted.error.message || deleted.error.details || "Failed to remove previous workspace records");
    if (records.length === 0) return;
    const inserted = await client.from("workspace_records").insert(records.map((record) => ({ collection, record_id: record.recordId, sort_order: record.order, data: record.data })));
    if (inserted.error) throw new Error(inserted.error.message || inserted.error.details || "Failed to persist workspace records");
  }

  useEffect(() => {
    const handleLocalChange = (event: Event) => {
      if (!loaded.current || !syncAvailable.current || !supabase || !user || role === "client") return;
      const detail = (event as CustomEvent<LocalWorkspaceChange>).detail;
      if (!detail || !collections.includes(detail.collection)) return;
      const nextJson = JSON.stringify(detail.data);
      if (remoteSnapshots.current[detail.collection] === nextJson) return;
      void replaceCollection(detail.collection, recordsForCollection(detail.collection, detail.data))
        .then(() => { remoteSnapshots.current[detail.collection] = nextJson; })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : (error as { message?: string; details?: string })?.message || (error as { details?: string })?.details || "Unknown sync error";
          console.warn("Supabase workspace sync skipped:", message);
          syncAvailable.current = false;
        });
    };
    window.addEventListener("evecture:workspace-local-updated", handleLocalChange);
    return () => window.removeEventListener("evecture:workspace-local-updated", handleLocalChange);
  }, [user?.id, role]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      const match = collections.find((collection) => workspaceStorage[collection].key === event.key || workspaceStorage[collection].legacyKeys.includes(event.key || ""));
      if (!match || !event.newValue) return;
      const value = parseStoredJson(event.newValue);
      if (value !== undefined) publishLocalWorkspaceChange(match, value);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return children;
}

function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const { user, loading, role } = useWorkspaceAuth();
  return !loading && user && role !== "client" ? <WorkspaceDataSync>{children}</WorkspaceDataSync> : children;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <WorkspaceAuthProvider><AuthenticatedWorkspace>{children}</AuthenticatedWorkspace></WorkspaceAuthProvider>;
}
