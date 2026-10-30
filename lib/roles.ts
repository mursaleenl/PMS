export type WorkspaceRole = "admin" | "employee" | "client";

export const roleLabels: Record<WorkspaceRole, string> = {
  admin: "Admin",
  employee: "Employee",
  client: "Client",
};

export function normalizeRole(value: unknown): WorkspaceRole | undefined {
  if (value === "admin" || value === "employee" || value === "client") return value;
  return undefined;
}

type AuthUserLike = {
  email?: string | null;
  user_metadata?: unknown;
};

/** Supabase Auth owns passwords; this only resolves the application access tier. */
export function getWorkspaceRole(user: AuthUserLike | null | undefined): WorkspaceRole {
  const email = user?.email?.trim().toLowerCase();
  const configuredAdminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase();
  if (email && configuredAdminEmail && email === configuredAdminEmail) return "admin";

  return "client";
}

export function canAccessPath(role: WorkspaceRole, pathname: string) {
  if (role === "admin") return true;
  if (role === "client") {
    return pathname === "/client" || pathname.startsWith("/client/") || pathname.startsWith("/proposal/") || pathname.startsWith("/settings");
  }
  return !pathname.startsWith("/admin") && !pathname.startsWith("/client");
}
