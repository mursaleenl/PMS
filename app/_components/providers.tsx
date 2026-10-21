"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { applyRemoteCollection, dataForRecords, localCollectionValue, publishLocalWorkspaceChange, recordsForCollection, type LocalWorkspaceChange, type WorkspaceCollection, type WorkspaceRecord, workspaceStorage } from "@/lib/workspace-sync";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL. Add your Convex deployment URL to .env.local.");

const convex = new ConvexReactClient(convexUrl);
const collections: WorkspaceCollection[] = ["leads", "projects", "management"];

function WorkspaceDataSync({ children }: { children: ReactNode }) {
  const records = useQuery(api.workspace.getAll, {});
  const replaceCollection = useMutation(api.workspace.replaceCollection);
  const loaded = useRef(false);
  const remoteSnapshots = useRef<Partial<Record<WorkspaceCollection, string>>>({});

  useEffect(() => {
    if (records === undefined) return;
    let cancelled = false;
    const syncInitialData = async () => {
      const grouped = new Map<WorkspaceCollection, WorkspaceRecord[]>(collections.map((collection) => [collection, []]));
      for (const record of records) grouped.get(record.collection)?.push({ recordId: record.recordId, order: record.order, data: record.data });
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
          await replaceCollection({ collection, records: localRecords });
          remoteSnapshots.current[collection] = JSON.stringify(dataForRecords(collection, localRecords));
        }
      }
      loaded.current = true;
    };
    void syncInitialData();
    return () => { cancelled = true; };
  }, [records, replaceCollection]);

  useEffect(() => {
    const handleLocalChange = (event: Event) => {
      if (!loaded.current) return;
      const detail = (event as CustomEvent<LocalWorkspaceChange>).detail;
      if (!detail || !collections.includes(detail.collection)) return;
      const nextJson = JSON.stringify(detail.data);
      if (remoteSnapshots.current[detail.collection] === nextJson) return;
      const nextRecords = recordsForCollection(detail.collection, detail.data);
      void replaceCollection({ collection: detail.collection, records: nextRecords }).then(() => {
        remoteSnapshots.current[detail.collection] = nextJson;
      }).catch((error: unknown) => console.error("Convex workspace sync failed", error));
    };
    window.addEventListener("evecture:workspace-local-updated", handleLocalChange);
    return () => window.removeEventListener("evecture:workspace-local-updated", handleLocalChange);
  }, [replaceCollection]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      const match = collections.find((collection) => workspaceStorage[collection].key === event.key || workspaceStorage[collection].legacyKeys.includes(event.key || ""));
      if (!match || !event.newValue) return;
      try {
        const value: unknown = JSON.parse(event.newValue);
        publishLocalWorkspaceChange(match, value);
      } catch {
        // Ignore invalid browser storage values.
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return children;
}

function AuthenticatedConvexProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  return <ConvexProviderWithClerk client={convex} useAuth={useAuth}>{isLoaded && isSignedIn ? <WorkspaceDataSync>{children}</WorkspaceDataSync> : children}</ConvexProviderWithClerk>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <ClerkProvider signInUrl="/sign-in"><AuthenticatedConvexProvider>{children}</AuthenticatedConvexProvider></ClerkProvider>;
}
