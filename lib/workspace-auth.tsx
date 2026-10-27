"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getWorkspaceRole, type WorkspaceRole } from "@/lib/roles";
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
  signOut: () => Promise<void>;
  provisionUser: (name: string, email: string, password: string, role: WorkspaceRole) => Promise<void>;
  updateMemberRole: (id: string, role: WorkspaceRole) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
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
  const autoClaimAttempted = useRef<string | null>(null);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => { if (mounted) { setSession(data.session); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (mounted) setSession(nextSession); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const refreshAccess = async () => {
    if (!supabase || !user) { setMembers([]); setDatabaseRole(null); setMustChangePassword(false); return; }
    setAccessLoading(true);
    let own = await supabase.from("workspace_members").select("id,email,role,display_name,user_id,must_change_password").eq("user_id", user.id).maybeSingle();
    if (!own.error && !own.data && user.email) {
      own = await supabase.from("workspace_members").select("id,email,role,display_name,user_id,must_change_password").eq("email", user.email.toLowerCase()).maybeSingle();
    }
    if (!own.error && !own.data && getWorkspaceRole(user) === "admin" && autoClaimAttempted.current !== user.id) {
      autoClaimAttempted.current = user.id;
      const claim = await supabase.rpc("claim_initial_admin");
      if (!claim.error) {
        own = await supabase.from("workspace_members").select("id,email,role,display_name,user_id,must_change_password").eq("user_id", user.id).maybeSingle();
      }
    }
    if (!own.error && own.data) setDatabaseRole(own.data.role as WorkspaceRole);
    else setDatabaseRole(null);
    setMustChangePassword(Boolean(own.data?.must_change_password));
    const fallbackRole = getWorkspaceRole(user);
    if (own.error && fallbackRole === "employee") console.warn("Supabase workspace_members is not available yet; using employee access.");
    if (own.data?.role === "admin" || fallbackRole === "admin") {
      const list = await supabase.from("workspace_members").select("id,email,role,display_name,user_id,created_at,must_change_password").order("created_at", { ascending: true });
      if (!list.error) setMembers((list.data ?? []) as WorkspaceMember[]);
    } else setMembers([]);
    setAccessLoading(false);
  };

  useEffect(() => { void refreshAccess(); }, [user?.id]);

  const role = databaseRole ?? getWorkspaceRole(user);
  const value = useMemo<AuthContextValue>(() => ({
    session, user, loading, configured: isSupabaseConfigured, role, databaseRole, mustChangePassword, members, accessLoading,
    signOut: async () => { if (supabase) await supabase.auth.signOut(); },
    provisionUser: async (name, email, password, nextRole) => {
      await userManagementRequest(session, "POST", { name, email, password, role: nextRole });
      await refreshAccess();
    },
    updateMemberRole: async (id, nextRole) => {
      await userManagementRequest(session, "PATCH", { id, role: nextRole });
      await refreshAccess();
    },
    removeMember: async (id) => {
      await userManagementRequest(session, "DELETE", { id });
      await refreshAccess();
    },
    updatePassword: async (password) => {
      if (!supabase || !user) throw new Error("Sign in before changing your password.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const cleared = await supabase.rpc("clear_password_change_requirement");
      if (cleared.error) throw cleared.error;
      setMustChangePassword(false);
      await refreshAccess();
    },
    refreshAccess,
  }), [session, user, loading, role, databaseRole, mustChangePassword, members, accessLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useWorkspaceAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useWorkspaceAuth must be used inside WorkspaceAuthProvider");
  return context;
}
