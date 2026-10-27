"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CheckSquare, ChevronRight, Command, FileText, FolderKanban, Handshake, Inbox, LayoutDashboard, Menu, MoreHorizontal, Receipt, Search, Settings, Users } from "lucide-react";
import { CommandPalette } from "@/app/_components/command-palette";
import { ToastHub } from "@/app/_components/toast-hub";
import { readLeads, type Lead } from "@/lib/leads";
import { readProjects, type Project } from "@/lib/projects";
import { canAccessPath, roleLabels, type WorkspaceRole } from "@/lib/roles";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

const employeeGroups = [
  {
    title: "WORKSPACE", items: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Leads", href: "/requests", icon: Inbox },
      { label: "Proposal generator", href: "/proposals", icon: FileText },
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Invoice generator", href: "/invoices", icon: Receipt },
      { label: "My work", href: "/work", icon: CheckSquare },
      { label: "Clients", href: "/clients", icon: Users },
    ]
  },
  {
    title: "DELIVERY", items: [
      { label: "Post-sale", href: "/post-sale", icon: Handshake },
    ]
  },
  {
    title: "SYSTEM", items: [
      { label: "Settings", href: "/settings", icon: Settings },
    ]
  },
];

const adminGroups = [
  { title: "ADMINISTRATION", items: [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    { label: "Leads", href: "/requests", icon: Inbox },
    { label: "Proposal generator", href: "/proposals", icon: FileText },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Invoices", href: "/invoices", icon: Receipt },
    { label: "My work", href: "/work", icon: CheckSquare },
    { label: "Clients", href: "/clients", icon: Users },
  ] },
  { title: "DELIVERY", items: [{ label: "Post-sale", href: "/post-sale", icon: Handshake }] },
  { title: "SYSTEM", items: [{ label: "Settings", href: "/settings", icon: Settings }] },
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

type Crumb = { label: string; href?: string };
const routeLabels: Record<string, string> = { admin: "Admin", client: "Client portal", requests: "Leads", proposals: "Proposal generator", projects: "Projects", invoices: "Invoice generator", work: "My work", clients: "Clients", "post-sale": "Post-sale", settings: "Settings" };

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const { user, loading, role, signOut, configured, mustChangePassword } = useWorkspaceAuth();

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
  if (loading) return <div className="access-denied"><div className="panel"><p>Loading workspace…</p></div></div>;
  if (!user) return <div className="access-denied"><div className="panel"><span className="section-kicker">EVECTURE</span><h1>Sign in to your workspace.</h1><p>Use the email and password provided by your administrator.</p><Link className="button button-primary" href="/sign-in">Open sign in <ChevronRight size={15} /></Link></div></div>;
  if (mustChangePassword && pathname !== "/settings") return <div className="access-denied"><div className="panel"><span className="section-kicker">PASSWORD UPDATE REQUIRED</span><h1>Set your own password.</h1><p>For account security, update the temporary password before continuing to the workspace.</p><Link className="button button-primary" href="/settings">Change password <ChevronRight size={15} /></Link></div></div>;

  const allowed = canAccessPath(role, pathname);
  if (!allowed) return <div className="access-denied"><div className="panel"><span className="section-kicker">{roleLabels[role]}</span><h1>This area is not part of your workspace.</h1><p>Your account is signed in with {roleLabels[role].toLowerCase()} access. Open the area assigned to your role.</p><Link className="button button-primary" href={role === "client" ? "/client" : "/"}>Continue to workspace <ChevronRight size={15} /></Link></div></div>;

  const openRequestCount = leads.filter((lead) => ["NEW", "QUALIFIED", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status)).length;

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
      <button className="brand" type="button" onClick={() => {
        if (window.matchMedia("(max-width: 700px)").matches) setMenuOpen((open) => !open);
        else setSidebarCollapsed((collapsed) => !collapsed);
      }} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!sidebarCollapsed}>
        <span className="brand-mark"><img src="/evecture-logo.png" alt="EVECTURE" width={32} height={32} className="brand-logo-img" /></span>
        <span className="brand-copy"><strong>EVECTURE</strong><small>PROJECT WORKSPACE</small></span>
      </button>
      {groupsForRole(role).map((group) => <div className="nav-group" key={group.title}>
        <div className="workspace-label">{group.title}{group.title === "WORKSPACE" && <button className="dots" aria-label="Workspace options"><MoreHorizontal size={18} /></button>}</div>
        <nav className="primary-nav" aria-label={`${group.title} navigation`}>
          {group.items.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
            const badgeCount = href === "/requests" ? openRequestCount : 0;
            return <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`nav-link ${active ? "active" : ""}`}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span><span className="nav-link-label">{label}</span>
              {badgeCount > 0 && <span className="nav-count" aria-label={`${badgeCount} open requests`}>{badgeCount}</span>}
            </Link>;
          })}
        </nav>
      </div>)}
      <div className="sidebar-bottom">
        <div className="profile"><span className="avatar avatar-me">{(user.user_metadata?.full_name?.[0] ?? "V").toUpperCase()}</span><span className="profile-copy"><strong>{user.user_metadata?.full_name || "Workspace user"}</strong><small>{roleLabels[role]}</small></span><button className="profile-menu-trigger" type="button" aria-label="Open profile menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}><MoreHorizontal size={18} className="profile-more" /></button>
          {profileMenuOpen && <div className="profile-menu"><Link href="/settings" onClick={() => setProfileMenuOpen(false)}>Account settings</Link><Link href="/settings#user-management" onClick={() => setProfileMenuOpen(false)}>User management</Link><button type="button" onClick={() => { setProfileMenuOpen(false); void signOut(); }}>Sign out</button></div>}
        </div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <nav className="breadcrumb" aria-label="Breadcrumb">{trail.map((crumb, index) => <span className="breadcrumb-segment" key={`${crumb.label}-${index}`}>{index > 0 && <ChevronRight size={13} className="crumb-slash" />}{index === trail.length - 1 ? <strong aria-current="page">{crumb.label}</strong> : <Link href={crumb.href ?? "/"}>{crumb.label}</Link>}</span>)}</nav>
        <div className="top-actions"><button className="global-search-trigger" type="button" onClick={() => window.dispatchEvent(new Event("evecture:command-open"))}><Search size={15} /><span>Search workspace</span><kbd><Command size={10} /> K</kbd></button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /></button><button className="account-signout" type="button" onClick={() => void signOut()} title="Sign out">Sign out</button></div>
      </header>
      {children}
    </main>
    <CommandPalette />
    <ToastHub />
  </div>;
}
