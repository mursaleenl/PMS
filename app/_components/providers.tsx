"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { applyRemoteCollection, localCollectionValue, parseStoredJson, publishLocalWorkspaceChange, type LocalWorkspaceChange, type WorkspaceCollection, workspaceStorage } from "@/lib/workspace-sync";
import { supabase } from "@/lib/supabase";
import { WorkspaceAuthProvider, useWorkspaceAuth } from "@/lib/workspace-auth";
import { persistRelationalCollection, readRelationalWorkspace } from "@/lib/relational-sync";

const collections: WorkspaceCollection[] = ["leads", "projects", "management", "invoices"];

function WorkspaceDataSync({ children }: { children: ReactNode }) {
  const { user, role } = useWorkspaceAuth();
  const loaded = useRef(false);
  const syncAvailable = useRef(false);
  const remoteSnapshots = useRef<Partial<Record<WorkspaceCollection, string>>>({});
  const writeQueues = useRef<Partial<Record<WorkspaceCollection, Promise<void>>>>({});

  useEffect(() => {
    const client = supabase;
    if (!client || !user || role === "client") return;
    let cancelled = false;
    const syncInitialData = async () => {
      let snapshot;
      try {
        snapshot = await readRelationalWorkspace(client);
      } catch (error) {
        console.warn("Supabase relational tables are not available; continuing with local workspace data.", error);
        loaded.current = true;
        syncAvailable.current = false;
        return;
      }
      syncAvailable.current = true;
      for (const collection of collections) {
        if (cancelled) return;
        const serverValue = snapshot.values[collection];
        const serverJson = JSON.stringify(serverValue);
        const local = localCollectionValue(collection);
        remoteSnapshots.current[collection] = serverJson;
        if (snapshot.remoteCollections.has(collection)) {
          if (snapshot.legacyCollections.has(collection)) {
            await persistRelationalCollection(client, collection, serverValue, user.id);
          }
          if (!local.exists || JSON.stringify(local.value) !== serverJson) applyRemoteCollection(collection, serverValue);
        } else if (local.exists) {
          await persistRelationalCollection(client, collection, local.value, user.id);
          remoteSnapshots.current[collection] = JSON.stringify(local.value);
        }
      }
      loaded.current = true;
    };
    void syncInitialData();
    return () => { cancelled = true; };
  }, [user?.id, role]);

  async function replaceCollection(collection: WorkspaceCollection, data: unknown) {
    const client = supabase;
    if (!client || !user || !syncAvailable.current) return;
    await persistRelationalCollection(client, collection, data, user.id);
  }

  function queueCollectionWrite(collection: WorkspaceCollection, data: unknown) {
    const previous = writeQueues.current[collection] ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => replaceCollection(collection, data));
    writeQueues.current[collection] = next;
    void next.finally(() => {
      if (writeQueues.current[collection] === next) delete writeQueues.current[collection];
    });
    return next;
  }

  useEffect(() => {
    const handleLocalChange = (event: Event) => {
      if (!loaded.current || !syncAvailable.current || !supabase || !user || role === "client") return;
      const detail = (event as CustomEvent<LocalWorkspaceChange>).detail;
      if (!detail || !collections.includes(detail.collection)) return;
      const nextJson = JSON.stringify(detail.data);
      if (remoteSnapshots.current[detail.collection] === nextJson) return;
      void queueCollectionWrite(detail.collection, detail.data)
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
