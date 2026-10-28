"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckSquare, ChevronDown, ChevronRight, Command, FileText, FolderKanban, Handshake, Inbox, LayoutDashboard, LogOut, Menu, MoreHorizontal, Receipt, Search, Settings, User, Users } from "lucide-react";
import { CommandPalette } from "@/app/_components/command-palette";
import { ToastHub } from "@/app/_components/toast-hub";
import { NotificationCenter } from "@/app/_components/notification-center";
import { readLeads, type Lead } from "@/lib/leads";
import { readProjects, type Project } from "@/lib/projects";
import { canAccessPath, roleLabels, type WorkspaceRole } from "@/lib/roles";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

const employeeGroups = [
  {
    title: "MAIN", items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ]
  },
  {
    title: "SALES", items: [
      { label: "Leads", href: "/requests", icon: Inbox },
      { label: "Proposals", href: "/proposals", icon: FileText },
      { label: "Invoices", href: "/invoices", icon: Receipt },
    ]
  },
  {
    title: "DELIVERY", items: [
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Tasks", href: "/work", icon: CheckSquare },
    ]
  },
  {
    title: "RELATIONSHIPS", items: [
      { label: "Clients", href: "/clients", icon: Users },
      { label: "Retainers", href: "/post-sale", icon: Handshake },
    ]
  },
  {
    title: "SYSTEM", items: [
      { label: "Users", href: "/users", icon: Users },
    ]
  },
];

const adminGroups = [
  {
    title: "MAIN", items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
    ]
  },
  {
    title: "SALES", items: [
      { label: "Leads", href: "/requests", icon: Inbox },
      { label: "Proposals", href: "/proposals", icon: FileText },
      { label: "Invoices", href: "/invoices", icon: Receipt },
    ]
  },
  {
    title: "DELIVERY", items: [
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Tasks", href: "/work", icon: CheckSquare },
    ]
  },
  {
    title: "RELATIONSHIPS", items: [
      { label: "Clients", href: "/clients", icon: Users },
      { label: "Retainers", href: "/post-sale", icon: Handshake },
    ]
  },
  {
    title: "SYSTEM", items: [
      { label: "Users", href: "/users", icon: Users },
    ]
  },
];

const clientGroups = [
  { title: "CLIENT PORTAL", items: [{ label: "Overview", href: "/client", icon: LayoutDashboard }, { label: "Proposals", href: "/client/proposals", icon: FileText }, { label: "Projects", href: "/client/projects", icon: FolderKanban }] },
  { title: "SYSTEM", items: [{ label: "Settings", href: "/settings", icon: Settings }] },
];

function groupsForRole(role: WorkspaceRole) {
  if (role === "admin") return adminGroups;
  if (role === "client") return clientGroups;
  return employeeGroups;
}

const routeLabels: Record<string, string> = { admin: "Admin", client: "Client portal", requests: "Leads", proposals: "Proposals", projects: "Projects", invoices: "Invoices", work: "Tasks", clients: "Clients", "post-sale": "Retainers", settings: "Account settings", users: "Users" };

type Crumb = { label: string; href?: string };

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const { user, loading, role, signOut, configured, mustChangePassword } = useWorkspaceAuth();

  useEffect(() => {
    if (!loading && !user && !pathname.startsWith("/sign-in") && !pathname.startsWith("/proposal/")) {
      const target = pathname && pathname !== "/" ? `/sign-in?from=${encodeURIComponent(pathname)}` : "/sign-in";
      router.replace(target);
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    if (profileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileMenuOpen]);

  useEffect(() => {
    const refresh = () => { setLeads(readLeads()); setProjects(readProjects()); };
    refresh();
    window.addEventListener("evecture:leads-updated", refresh);
    window.addEventListener("evecture:projects-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("evecture:leads-updated", refresh);
      window.removeEventListener("evecture:projects-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/proposal/")) return <>{children}</>;

  if (!configured) return <div className="access-denied"><div className="panel"><span className="section-kicker">SETUP REQUIRED</span><h1>Connect Supabase to continue.</h1><p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment, then restart the app.</p></div></div>;
  if (loading || !user) return <div className="access-denied"><div className="panel"><p>Loading workspace…</p></div></div>;
  if (mustChangePassword && pathname !== "/settings") return <div className="access-denied"><div className="panel"><span className="section-kicker">PASSWORD UPDATE REQUIRED</span><h1>Set your own password.</h1><p>For account security, update the temporary password before continuing to the workspace.</p><Link className="button button-primary" href="/settings">Change password <ChevronRight size={15} /></Link></div></div>;

  const allowed = canAccessPath(role, pathname);
  if (!allowed) return <div className="access-denied"><div className="panel"><span className="section-kicker">{roleLabels[role]}</span><h1>This area is not part of your workspace.</h1><p>Your account is signed in with {roleLabels[role].toLowerCase()} access. Open the area assigned to your role.</p><Link className="button button-primary" href={role === "client" ? "/client" : "/"}>Continue to workspace <ChevronRight size={15} /></Link></div></div>;

  const parts = pathname.split("/").filter(Boolean);
  const trail: Crumb[] = [];
  if (parts.length) {
    const section = parts[0];
    trail.push({ label: routeLabels[section] ?? "Workspace", href: `/${section}` });
    if (section === "projects" && parts[1] === "assignments") {
      trail.push({ label: "Project assignments" });
    } else if (section === "projects" && parts[1]) {
      const project = projects.find((item) => item.id === parts[1]);
      trail.push({ label: project?.title ?? "Project workspace" });
      if (parts[2]) trail.push({ label: parts[2].replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) });
    } else if (section === "requests" && parts[1] === "new") {
      trail.push({ label: "Log enquiry" });
    } else if (section === "requests" && parts[1]) {
      const lead = leads.find((item) => item.id === parts[1]);
      trail.push({ label: lead?.companyName || lead?.fullName || "Request" });
    }
  }

  return <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <button
        type="button"
        className="brand"
        onClick={() => {
          if (window.matchMedia("(max-width: 700px)").matches) {
            setMenuOpen(false);
          } else {
            setSidebarCollapsed((prev) => !prev);
          }
        }}
        title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
      >
        <span className="brand-mark">
          <img src="/evecture-logo.png" alt="EVECTURE" width={32} height={32} className="brand-logo-img" />
        </span>
        <span className="brand-copy">
          <strong>EVECTURE</strong>
          <small>PROJECT WORKSPACE</small>
        </span>
      </button>
      <div className="sidebar-nav-scroll">
        {groupsForRole(role).map((group) => <div className="nav-group" key={group.title}>
          <div className="workspace-label">{group.title}</div>
          <nav className="primary-nav" aria-label={`${group.title} navigation`}>
            {group.items.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
              return <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`nav-link ${active ? "active" : ""}`} title={label}>
                <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span><span className="nav-link-label">{label}</span>
              </Link>;
            })}
          </nav>
        </div>)}
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <nav className="breadcrumb" aria-label="Breadcrumb">{trail.map((crumb, index) => <span className="breadcrumb-segment" key={`${crumb.label}-${index}`}>{index > 0 && <ChevronRight size={13} className="crumb-slash" />}{index === trail.length - 1 ? <strong aria-current="page">{crumb.label}</strong> : <Link href={crumb.href ?? "/"}>{crumb.label}</Link>}</span>)}</nav>
        <div className="top-actions">
          <button className="global-search-trigger" type="button" onClick={() => window.dispatchEvent(new Event("evecture:command-open"))}><Search size={15} /><span>Search workspace</span><kbd><Command size={10} /> K</kbd></button>
          <NotificationCenter />
          
          <div className="topbar-user-menu-container" ref={profileMenuRef}>
            <button
              className="topbar-user-btn"
              type="button"
              aria-label="User account menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <span className="topbar-user-icon">
                <User size={15} />
              </span>
              <span className="topbar-user-name">
                {user.user_metadata?.full_name || user.email?.split("@")[0] || "Workspace user"}
              </span>
              <span className={`topbar-user-role-badge role-${role}`}>
                {roleLabels[role]}
              </span>
              <ChevronDown size={14} className={`topbar-chevron ${profileMenuOpen ? "rotated" : ""}`} />
            </button>

            {profileMenuOpen && (
              <div className="topbar-profile-dropdown" role="menu">
                <div className="topbar-dropdown-user-header">
                  <div className="topbar-dropdown-user-icon">
                    <User size={18} />
                  </div>
                  <div className="topbar-dropdown-user-info">
                    <strong>{user.user_metadata?.full_name || user.email?.split("@")[0] || "Workspace user"}</strong>
                    <small>{user.email || "evecture@workspace"}</small>
                    <span className={`role-pill role-${role}`}>{roleLabels[role]}</span>
                  </div>
                </div>
                <div className="topbar-dropdown-divider" />
                <Link
                  href="/settings"
                  className="topbar-dropdown-link"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  <Settings size={15} />
                  <span>Account settings</span>
                </Link>
                <div className="topbar-dropdown-divider" />
                <button
                  type="button"
                  className="topbar-dropdown-link signout-action"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {children}
    </main>
    <CommandPalette />
    <ToastHub />
  </div>;
}
