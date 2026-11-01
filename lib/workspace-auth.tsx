"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getWorkspaceRole, type WorkspaceRole } from "@/lib/roles";
import { flushPendingWorkspaceChanges } from "@/lib/workspace-sync";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type WorkspaceMember = { id: string; email: string; role: WorkspaceRole; display_name?: string | null; user_id?: string | null; created_at: string; must_change_password?: boolean };
type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  role: WorkspaceRole;
  databaseRole: WorkspaceRole | null;
  mustChangePassword: boolean;
  members: WorkspaceMember[];
  accessLoading: boolean;
  signOut: () => Promise<boolean>;
  provisionUser: (name: string, email: string, password: string, role: WorkspaceRole) => Promise<void>;
  updateMemberRole: (id: string, role: WorkspaceRole) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  accessError: string;
  refreshAccess: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function userManagementRequest(session: Session | null, method: "POST" | "PATCH" | "DELETE", body: Record<string, string>) {
  if (!session?.access_token) throw new Error("Your session is unavailable. Sign in again and retry.");
  const response = await fetch("/api/admin/users", {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error || "Unable to complete user management request.");
}

export function WorkspaceAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [databaseRole, setDatabaseRole] = useState<WorkspaceRole | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const currentUserId = useRef<string | null>(null);
  const accessRequest = useRef(0);
  const autoClaimAttempted = useRef<string | null>(null);
  const user = session?.user ?? null;
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? null;
  const accessToken = session?.access_token;
  currentUserId.current = userId;

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    void supabase.auth.getSession().then(({data,error}) => {
      if (!mounted) return;
      if (error) setAccessError("Your session could not be loaded. Please sign in again.");
      setSession(data.session);
      setLoading(false);
    }).catch(() => { if (mounted) { setLoading(false); setAccessError("Your session could not be loaded."); } });
    const {data:listener} = supabase.auth.onAuthStateChange((_event,nextSession) => {
      if (mounted) { setSession(nextSession); setLoading(false); }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const refreshAccess = useCallback(async () => {
    const requestId = ++accessRequest.current;
    if (!supabase || !userId) {
      setMembers([]); setDatabaseRole(null); setMustChangePassword(false);
      setResolvedUserId(null); setAccessLoading(false); setAccessError("");
      return;
    }
    setAccessLoading(true);
    setAccessError("");
    const current = () => requestId === accessRequest.current && currentUserId.current === userId;
    try {
      const columns = "id,email,role,display_name,user_id,must_change_password,created_at";
      let own = await supabase.from("workspace_members").select(columns).eq("user_id",userId).maybeSingle();
      if (!own.error && !own.data && userEmail) {
        own = await supabase.from("workspace_members").select(columns).eq("email",userEmail.toLowerCase()).is("user_id",null).maybeSingle();
      }
      if (own.error) throw new Error("Workspace access could not be verified. Please retry.");
      if (!own.data && getWorkspaceRole({email:userEmail}) === "admin" && autoClaimAttempted.current !== userId && accessToken) {
        autoClaimAttempted.current = userId;
        const response = await fetch("/api/admin/users",{headers:{Authorization:`Bearer ${accessToken}`}});
        if (response.ok) own = await supabase.from("workspace_members").select(columns).eq("user_id",userId).maybeSingle();
      }
      let nextMembers: WorkspaceMember[] = [];
      if (own.data?.role === "admin") {
        const list = await supabase.from("workspace_members").select("id,email,role,display_name,user_id,created_at,must_change_password").order("created_at",{ascending:true});
        if (list.error) throw new Error("Workspace members could not be loaded. Please retry.");
        nextMembers = (list.data ?? []) as WorkspaceMember[];
      } else if (own.data) nextMembers = [own.data as WorkspaceMember];
      if (!current()) return;
      setDatabaseRole((own.data?.role as WorkspaceRole) ?? null);
      setMustChangePassword(Boolean(own.data?.must_change_password));
      setMembers(nextMembers);
    } catch(error) {
      if (current()) {
        setAccessError(error instanceof Error ? error.message : "Unable to verify workspace access.");
        // Fail closed for a new identity. A transient roster refresh must not
        // unmount an already-loaded workspace and discard pending edits.
        if (resolvedUserId !== userId) { setDatabaseRole(null); setMembers([]); }
      }
    } finally {
      if (current()) { setResolvedUserId(userId); setAccessLoading(false); }
    }
  }, [userId,userEmail,accessToken,resolvedUserId]);

  useEffect(() => { void refreshAccess(); }, [refreshAccess]);

  useEffect(() => {
    if (!supabase || !userId || !session) return;
    const client = supabase;
    // Capture the actual sign-in time, not the access-token refresh time.
    const signedInAt = Date.parse(session.user.last_sign_in_at || session.user.created_at);
    let stopped = false;
    let checking = false;
    async function checkAccessChange() {
      if (checking || stopped) return;
      checking = true;
      try {
        const { data, error } = await client.auth.getUser();
        if (stopped || error || !data.user) return;
        const changedAt = Date.parse(data.user.app_metadata.access_changed_at || "");
        if (Number.isFinite(changedAt) && changedAt > signedInAt) {
          stopped = true;
          await client.auth.signOut({ scope: "local" });
          window.location.replace("/sign-in?reason=access-changed");
        }
      } catch {
        // Retry temporary connectivity failures on the next poll or focus.
      } finally { checking = false; }
    }
    void checkAccessChange();
    const timer = window.setInterval(() => { void checkAccessChange(); }, 10000);
    const onFocus = () => { void checkAccessChange(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [userId, session?.user.last_sign_in_at]);

  const identityResolved = !userId || resolvedUserId === userId;
  const effectiveRole = identityResolved ? databaseRole : null;
  const value: AuthContextValue = {
    session, user, loading: loading || !identityResolved, configured:isSupabaseConfigured,
    role:effectiveRole ?? "client", databaseRole:effectiveRole, mustChangePassword,
    members:identityResolved ? members : [], accessLoading, accessError,
    signOut:async () => {
      try { await flushPendingWorkspaceChanges(); }
      catch { if (!window.confirm("Some changes have not been saved. Sign out and discard those changes?")) return false; }
      if (supabase) { const result = await supabase.auth.signOut(); if (result.error) throw result.error; }
      return true;
    },
    provisionUser:async (name,email,password,role) => { await userManagementRequest(session,"POST",{name,email,password,role}); await refreshAccess(); },
    updateMemberRole:async (id,role) => { await userManagementRequest(session,"PATCH",{id,role}); await refreshAccess(); },
    removeMember:async id => { await userManagementRequest(session,"DELETE",{id}); await refreshAccess(); },
    updatePassword:async password => {
      if (databaseRole !== "admin") throw new Error("Password changes are managed by an administrator.");
      if (!supabase || !user) throw new Error("Sign in before changing your password.");
      const result = await supabase.auth.updateUser({password});
      if (result.error) throw result.error;
      const cleared = await supabase.rpc("clear_password_change_requirement");
      if (cleared.error) throw cleared.error;
      setMustChangePassword(false);
      await refreshAccess();
    },
    refreshAccess,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useWorkspaceAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useWorkspaceAuth must be used inside WorkspaceAuthProvider");
  return context;
}
