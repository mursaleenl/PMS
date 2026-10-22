"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { Bell, CheckSquare, ChevronRight, Command, FolderKanban, Heart, Inbox, LayoutDashboard, Menu, MoreHorizontal, Receipt, Search, Settings, Users } from "lucide-react";
import { CommandPalette } from "@/app/_components/command-palette";
import { ToastHub } from "@/app/_components/toast-hub";
import { readLeads, type Lead } from "@/lib/leads";
import { readProjects, type Project } from "@/lib/projects";

const groups = [
  {
    title: "WORKSPACE", items: [
      { label: "Overview", href: "/", icon: LayoutDashboard },
      { label: "Request pipeline", href: "/requests", icon: Inbox },
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Invoice generator", href: "/invoices", icon: Receipt },
      { label: "My work", href: "/work", icon: CheckSquare },
      { label: "Clients", href: "/clients", icon: Users },
    ]
  },
  {
    title: "DELIVERY", items: [
      { label: "Post-sale", href: "/post-sale", icon: Heart },
    ]
  },
];

type Crumb = { label: string; href?: string };
const routeLabels: Record<string, string> = { requests: "Request pipeline", projects: "Projects", invoices: "Invoice generator", work: "My work", clients: "Clients", "post-sale": "Post-sale", settings: "Settings" };

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const { isLoaded, isSignedIn } = useAuth();
  const workspaceRecords = useQuery(api.workspace.getAll, isLoaded && isSignedIn ? {} : "skip");

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

  if (pathname.startsWith("/sign-in")) return <>{children}</>;

  const openRequestCount = workspaceRecords?.filter((record) => {
    if (record.collection !== "leads") return false;
    const lead = record.data as { status?: string };
    return ["NEW", "QUALIFIED", "PROPOSAL_SENT", "ACCEPTED"].includes(lead.status ?? "");
  }).length ?? 0;

  const parts = pathname.split("/").filter(Boolean);
  const trail: Crumb[] = [{ label: "Home", href: "/" }];
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
        <span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d={sidebarCollapsed ? "M6 7h20M6 16h16M6 25h20" : "M6 7h20M10 16h16M6 25h20"} /><path d={sidebarCollapsed ? "M22 12l4 4-4 4" : "M14 12l-4 4 4 4"} /></svg></span>
        <span className="brand-copy"><strong>VRKSpace</strong><small>PROJECT WORKSPACE</small></span>
      </button>
      {groups.map((group) => <div className="nav-group" key={group.title}>
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
        <Link href="/settings" className={`nav-link ${pathname === "/settings" ? "active" : ""}`} onClick={() => setMenuOpen(false)}><span className="nav-icon"><Settings size={18} /></span><span className="nav-link-label">Settings</span></Link>
        <div className="profile"><span className="avatar avatar-me">VR</span><span className="profile-copy"><strong>VRKSpace</strong><small>Workspace</small></span><button className="dots" aria-label="Workspace account options"><MoreHorizontal size={18} /></button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <nav className="breadcrumb" aria-label="Breadcrumb">{trail.map((crumb, index) => <span className="breadcrumb-segment" key={`${crumb.label}-${index}`}>{index > 0 && <ChevronRight size={13} className="crumb-slash" />}{index === trail.length - 1 ? <strong aria-current="page">{crumb.label}</strong> : <Link href={crumb.href ?? "/"}>{crumb.label}</Link>}</span>)}</nav>
        <div className="top-actions"><button className="global-search-trigger" type="button" onClick={() => window.dispatchEvent(new Event("evecture:command-open"))}><Search size={15} /><span>Search workspace</span><kbd><Command size={10} /> K</kbd></button><Link className="top-enquiry-link" href="/requests/new">Log enquiry <span>＋</span></Link><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18} /></button><UserButton /></div>
      </header>
      {children}
    </main>
    <CommandPalette />
    <ToastHub />
  </div>;
}
