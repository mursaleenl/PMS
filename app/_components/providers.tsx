"use client";

import { createUuid } from "@/lib/uuid";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { applyRemoteCollection, clearLegacyBrowserWorkspaceData, clearWorkspaceMemory, registerWorkspaceSaver, workspaceValues, type WorkspaceCollection } from "@/lib/workspace-sync";
import { resetNotifications } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { WorkspaceAuthProvider, useWorkspaceAuth } from "@/lib/workspace-auth";
import { persistWorkspaceChanges, readRelationalWorkspace, workspaceChanges } from "@/lib/relational-sync";

const collections: WorkspaceCollection[] = ["leads", "projects", "management", "invoices"];

type SyncFeedback = { state: "loading"|"ready"|"saving"|"error"; canSave:boolean; message:string; retry:(() => Promise<void>)|null; reload:() => void };
const SyncContext = createContext<SyncFeedback | null>(null);
export function WorkspaceSyncFeedback() {
  const sync = useContext(SyncContext);
  if (!sync) return null;
  return <>{sync.state === "error" && <div className="workspace-sync-notice" role="alert"><span>Your changes have not been saved. {sync.message}</span><button className="button button-quiet" onClick={() => { void sync.retry?.().catch(() => {}); }}>Retry saving</button><button className="button button-quiet" onClick={() => { if (window.confirm("Discard unsaved changes and load the latest database records?")) sync.reload(); }}>Reload latest data</button></div>}</>;
}

function WorkspaceDataSync({ children }: { children: ReactNode }) {
  const { user, databaseRole } = useWorkspaceAuth();
  const pathname = usePathname();
  const [state, setState] = useState<"loading"|"ready"|"saving"|"error">("loading");
  const [message,setMessage] = useState("");
  const [canSave,setCanSave] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [retry,setRetry] = useState<(() => Promise<void>) | null>(null);
  const publicPage = pathname.startsWith("/proposal/") || pathname.startsWith("/sign-in");
  const userId = user?.id;
  const internal = databaseRole === "admin" || (databaseRole === "employee" || databaseRole === "project_manager");

  useEffect(() => {
    const client = supabase;
    if (!client || !userId || !internal) {
      clearWorkspaceMemory();
      resetNotifications();
      registerWorkspaceSaver();
      return;
    }
    let cancelled = false;
    let ready = false;
    let migrationPending = false;
    let failed = false;
    let conflict = false;
    let acknowledged: ReturnType<typeof workspaceValues> = {};
    let revisions: Record<string,number> = {};
    const requestIds = new Map<string,string>();
    let running: Promise<void> | null = null;
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    setState("loading");
    clearWorkspaceMemory();
    resetNotifications();

    async function save(): Promise<void> {
      if (cancelled || !ready) throw new Error("Workspace is loading. Retry when it is ready.");
      if (conflict) throw new Error("Another session changed this record. Reload the latest data before continuing.");
      if (running) { await running; return save(); }
      const captured = workspaceValues();
      const changes = workspaceChanges(acknowledged,captured,revisions);
      if (!changes.length) { failed = false; setState("ready"); return; }
      if (migrationPending) {
        failed = true; setState("error"); setMessage("Workspace setup is incomplete. Contact an administrator before saving changes.");
        throw new Error("Workspace setup is incomplete. Contact an administrator before saving changes.");
      }
      failed = false;
      setState("saving");
      running = (async () => {
        try {
          const signature = JSON.stringify(changes);
          const requestId = requestIds.get(signature) ?? createUuid();
          requestIds.set(signature,requestId);
          const saved = await persistWorkspaceChanges(client!,changes,requestId);
          requestIds.delete(signature);
          if (cancelled) return;
          for (const [key,revision] of Object.entries(saved)) { if (revision < 0) delete revisions[key]; else revisions[key]=revision; }
          acknowledged = captured;
          setState("ready");
        } catch(error) {
          failed = true;
          const reason = error instanceof Error ? error.message : "Unable to save your changes.";
          conflict = reason.includes("CONFLICT");
          if (!cancelled) { setMessage(reason); setState("error"); }
          throw error;
        } finally { running = null; }
      })();
      await running;
      if (!cancelled) await save();
    }
    function scheduleSave() {
      if (!ready || failed || cancelled) return;
      clearTimeout(scheduled);
      scheduled = setTimeout(() => { void save().catch(() => {}); },0);
    }
    async function load() {
      try {
        clearLegacyBrowserWorkspaceData();
        const snapshot = await readRelationalWorkspace(client!);
        if (cancelled) return;
        for (const collection of collections) applyRemoteCollection(collection,snapshot.values[collection]);
        acknowledged = workspaceValues();
        revisions = snapshot.revisions;
        migrationPending = snapshot.requiresMigration;
        setCanSave(!migrationPending);
        ready = true;
        setState("ready");
        setRetry(() => save);
        registerWorkspaceSaver(save);
      } catch(error) {
        if (!cancelled) { setMessage(error instanceof Error ? error.message : "Unable to load workspace data."); setState("error"); setRetry(null); }
      }
    }
    let refreshing = false;
    async function refreshRemote() {
      if (cancelled || !ready || refreshing || running || failed || conflict || document.hidden) return;
      if (workspaceChanges(acknowledged, workspaceValues(), revisions).length) return;
      refreshing = true;
      const previous = acknowledged;
      try {
        const snapshot = await readRelationalWorkspace(client!);
        // Never replace edits or an acknowledgement made while the request was in flight.
        if (cancelled || running || failed || conflict || acknowledged !== previous || workspaceChanges(acknowledged, workspaceValues(), revisions).length) return;
        if (snapshot.requiresMigration || JSON.stringify(snapshot.revisions) === JSON.stringify(revisions)) return;
        for (const collection of collections) applyRemoteCollection(collection, snapshot.values[collection]);
        acknowledged = workspaceValues();
        revisions = snapshot.revisions;
      } catch {
        // Keep the last loaded data during a temporary outage; the next refresh retries.
      } finally { refreshing = false; }
    }
    const refreshTimer = setInterval(() => { void refreshRemote(); }, 5000);
    const refreshOnFocus = () => { void refreshRemote(); };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    function beforeUnload(event: BeforeUnloadEvent) {
      if (ready && (running || workspaceChanges(acknowledged,workspaceValues(),revisions).length)) { event.preventDefault(); event.returnValue = ""; }
    }
    function online() { if (ready && !conflict) void save().catch(() => {}); }
    window.addEventListener("evecture:workspace-local-updated",scheduleSave);
    window.addEventListener("beforeunload",beforeUnload);
    window.addEventListener("online",online);
    void load();
    return () => {
      cancelled = true;
      clearTimeout(scheduled);
      clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      registerWorkspaceSaver();
      clearWorkspaceMemory();
      window.removeEventListener("evecture:workspace-local-updated",scheduleSave);
      window.removeEventListener("beforeunload",beforeUnload);
      window.removeEventListener("online",online);
    };
  },[userId,internal,attempt]);

  if (publicPage || !user || !internal) return children;
  if (state === "loading") return <div className="access-denied" role="status"><p>Loading workspace…</p></div>;
  if (state === "error" && !retry) return <div className="access-denied"><section className="panel"><h1>Workspace could not load</h1><p role="alert">{message}</p><button className="button button-primary" onClick={() => setAttempt(value=>value+1)}>Retry loading</button></section></div>;
  return <SyncContext.Provider value={{state,canSave,message,retry,reload:()=>setAttempt(value=>value+1)}}>{children}</SyncContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <WorkspaceAuthProvider><WorkspaceDataSync>{children}</WorkspaceDataSync></WorkspaceAuthProvider>;
}
