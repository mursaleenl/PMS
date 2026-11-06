"use client";

import { useEffect, useState } from "react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

export type AssignableUser = {
  id?: string;
  name: string;
  email?: string;
  role?: string;
};

export { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignee-names";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignee-names";

export function useAssignableUsers(): { users: AssignableUser[]; loading: boolean } {
  const { members, user, role: userRole, session } = useWorkspaceAuth();
  const [apiUsers, setApiUsers] = useState<AssignableUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (userRole !== "admin") {
      setApiUsers([]);
      return () => { mounted = false; };
    }
    async function fetchAssignees() {
      try {
        setLoading(true);
        const res = await fetch("/api/assignees", {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (res.ok) {
          const json = (await res.json()) as { assignees?: AssignableUser[] };
          if (mounted && json.assignees && json.assignees.length > 0) {
            setApiUsers(json.assignees);
          }
        }
      } catch {
        // Silently fall back to auth context members
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchAssignees();
    return () => {
      mounted = false;
    };
  }, [session?.access_token, userRole]);

  const rosterMap = new Map<string, AssignableUser>();

  // 1. Add members from auth context (users added via /users or stored in workspace_members)
  members?.forEach((m) => {
    if (m.role === "client") return;
    const raw = m.display_name?.trim() || m.email?.split("@")[0] || "";
    if (raw && !DUMMY_ASSIGNABLE_NAMES.has(raw.toLowerCase())) {
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      rosterMap.set(name.toLowerCase(), {
        id: m.user_id || undefined,
        name,
        email: m.email,
        role: m.role,
      });
    }
  });

  // 2. Add users from /api/assignees
  apiUsers.forEach((u) => {
    if (u.name && u.role !== "client" && !DUMMY_ASSIGNABLE_NAMES.has(u.name.toLowerCase())) {
      const existing = rosterMap.get(u.name.toLowerCase());
      rosterMap.set(u.name.toLowerCase(), {
        ...existing,
        ...u,
        name: u.name,
        role: u.role || existing?.role,
      });
    }
  });

  // 3. Add current authenticated user if admin or employee
  if (user && userRole !== "client") {
    const raw =
      user.user_metadata?.full_name?.trim() || user.email?.split("@")[0] || "";
    if (raw && !DUMMY_ASSIGNABLE_NAMES.has(raw.toLowerCase())) {
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      if (!rosterMap.has(name.toLowerCase())) {
        rosterMap.set(name.toLowerCase(), {
          id: user.id,
          name,
          email: user.email,
          role: userRole,
        });
      }
    }
  }

  const sorted = Array.from(rosterMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return { users: sorted, loading };
}

