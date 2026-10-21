"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckSquare, ChevronRight, FolderKanban, Heart, Inbox, LayoutDashboard, Menu, MoreHorizontal, Receipt, Settings, Users, X } from "lucide-react";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";

const groups = [
  { title: "WORKSPACE", items: [
    { label: "Overview", href: "/", icon: LayoutDashboard },
    { label: "Request pipeline", href: "/requests", icon: Inbox },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "Invoice generator", href: "/invoices", icon: Receipt },
    { label: "My work", href: "/work", icon: CheckSquare },
    { label: "Clients", href: "/clients", icon: Users },
  ] },
  { title: "DELIVERY", items: [
    { label: "Post-sale", href: "/post-sale", icon: Heart },
  ] },
];

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  if (pathname.startsWith("/sign-in")) return <>{children}</>;
  const current = pathname === "/requests/new" ? "Log enquiry" : pathname === "/projects/assignments" ? "Project assignments" : groups.flatMap((group) => group.items).find((item) => item.href === pathname)?.label ?? (pathname.startsWith("/projects/") ? "Project workspace" : "Workspace");

  return <div className="app-shell">
    {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <Link className="brand" href="/" onClick={() => setMenuOpen(false)} aria-label="Evecture Studio home">
        <span className="brand-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7h20M6 16h16M6 25h20"/><path d="M22 12l4 4-4 4"/></svg></span>
        <span className="brand-copy"><strong>evecture</strong><small>STUDIO WORKSPACE</small></span>
      </Link>
      {groups.map((group) => <div className="nav-group" key={group.title}>
        <div className="workspace-label">{group.title}{group.title === "WORKSPACE" && <button className="dots" aria-label="Workspace options"><MoreHorizontal size={18}/></button>}</div>
        <nav className="primary-nav" aria-label={`${group.title} navigation`}>
          {group.items.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className={`nav-link ${pathname === href ? "active" : ""}`}>
            <span className="nav-icon"><Icon size={18} strokeWidth={1.8}/></span>{label}
          </Link>)}
        </nav>
      </div>)}
      <div className="sidebar-bottom">
        <Link href="/settings" className={`nav-link ${pathname === "/settings" ? "active" : ""}`} onClick={() => setMenuOpen(false)}><span className="nav-icon"><Settings size={18}/></span>Settings</Link>
        <div className="profile"><span className="avatar avatar-me">ES</span><span className="profile-copy"><strong>Evecture Studio</strong><small>Workspace</small></span><button className="dots" aria-label="Workspace account options"><MoreHorizontal size={18}/></button></div>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} className="crumb-slash"/><strong>{current}</strong></div>
        <div className="top-actions"><Link className="top-enquiry-link" href="/requests/new">Log enquiry <span>＋</span></Link><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/></button><UserButton/></div>
      </header>
      {children}
    </main>
  </div>;
}
