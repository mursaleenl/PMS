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
    return pathname === "/client" || ["/client/proposals", "/client/invoices"].includes(pathname) || pathname.startsWith("/client/invoices/") || pathname === "/client/projects" || pathname.startsWith("/client/projects/") || pathname === "/settings";
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/client") || pathname === "/clients" || pathname.startsWith("/clients/") || pathname === "/users" || pathname.startsWith("/users/") || pathname === "/post-sale" || pathname.startsWith("/post-sale/") || pathname === "/proposals" || pathname.startsWith("/proposals/") || pathname === "/proposal" || pathname.startsWith("/proposal/") || pathname === "/invoices" || pathname.startsWith("/invoices/") || pathname === "/requests" || pathname.startsWith("/requests/") || pathname === "/projects/assignments" || pathname.startsWith("/projects/assignments/")) return false;
  return true;
}
