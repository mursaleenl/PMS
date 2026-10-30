"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ListTodo, ChevronDown, ChevronRight, Command, Files, FolderOpenDot, Repeat2, ContactRound, PanelsTopLeft, LogOut, ChevronUp, Plus, ScanLine, ReceiptText, Search, SlidersHorizontal, User, UserRoundCog, Building2 } from "lucide-react";
import { WorkspaceSaveIndicator, WorkspaceSyncFeedback } from "@/app/_components/providers";
import { CommandPalette } from "@/app/_components/command-palette";
import { ToastHub } from "@/app/_components/toast-hub";
import { NotificationCenter } from "@/app/_components/notification-center";
import { readLeads, type Lead } from "@/lib/leads";
import { readProjects, type Project } from "@/lib/projects";
import { canAccessPath, roleLabels, type WorkspaceRole } from "@/lib/roles";
import { useWorkspaceAuth } from "@/lib/workspace-auth";

const workspaceGroups = [
  { title: "Workspace", items: [
    { label: "Dashboard", href: "/", icon: PanelsTopLeft },
    { label: "Projects", href: "/projects", icon: FolderOpenDot },
    { label: "Tasks", href: "/work", icon: ListTodo },
    { label: "Attendance", href: "/work/attendance", icon: ScanLine },
  ]},
  { title: "Sales", items: [
    { label: "Leads", href: "/requests", icon: ContactRound },
    { label: "Proposals", href: "/proposals", icon: Files },
    { label: "Invoices", href: "/invoices", icon: ReceiptText },
  ]},
  { title: "Relationships", items: [
    { label: "Clients", href: "/clients", icon: Building2 },
    { label: "Retainers", href: "/post-sale", icon: Repeat2 },
  ]},
];
const adminGroups = [...workspaceGroups, {title:"Administration",items:[{label:"Users",href:"/users",icon:UserRoundCog}]}];
const employeeGroups = workspaceGroups;

const clientGroups = [
  { title: "CLIENT PORTAL", items: [{ label: "Overview", href: "/client", icon: PanelsTopLeft }, { label: "Proposals", href: "/client/proposals", icon: Files }, { label: "Projects", href: "/client/projects", icon: FolderOpenDot }] },
  { title: "SYSTEM", items: [{ label: "Settings", href: "/settings", icon: SlidersHorizontal }] },
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [hoverNavigation,setHoverNavigation] = useState(false);
  const [islandCollapsed,setIslandCollapsed] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const islandScrollRef = useRef<HTMLDivElement>(null);
  const [mobileNavigation,setMobileNavigation] = useState(false);
  const [navScrolled,setNavScrolled] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const { user, loading, role, signOut, configured, mustChangePassword, databaseRole, accessError, refreshAccess } = useWorkspaceAuth();

  useEffect(() => () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }, []);
  useEffect(()=>{
    if(islandCollapsed)return;
    const timer=setTimeout(()=>{
      const scroller=islandScrollRef.current,active=scroller?.querySelector<HTMLElement>(".island-link.active");
      if(scroller&&active){const links=Array.from(scroller.querySelectorAll<HTMLElement>(".island-link"));const first=links[Math.floor(links.indexOf(active)/4)*4];scroller.scrollTo({left:first.offsetLeft,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
    },320);
    return ()=>clearTimeout(timer);
  },[pathname,islandCollapsed,loading,databaseRole,mobileNavigation]);


  const expandOnHover = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (!mobileNavigation) setHoverNavigation(true);
  };
  const closeAfterHover = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoverNavigation(false),260);
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const updateViewport = () => { setMobileNavigation(media.matches); };
    const updateScroll = () => setNavScrolled(window.scrollY > 12);
    updateViewport(); updateScroll();
    media.addEventListener("change",updateViewport);
    window.addEventListener("scroll",updateScroll,{passive:true});
    return () => { media.removeEventListener("change",updateViewport); window.removeEventListener("scroll",updateScroll); };
  }, []);

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
    setProfileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setProfileMenuOpen(false); }
    };
    window.addEventListener("keydown",onEscape);
    return () => window.removeEventListener("keydown",onEscape);
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
  if (!databaseRole) return <div className="access-denied"><section className="panel"><h1>{accessError ? "Unable to verify workspace access" : "Workspace access is not assigned"}</h1><p>{accessError || "Ask an administrator to assign your account a workspace role."}</p><button className="button button-primary" onClick={() => { void refreshAccess(); }}>Retry access check</button><button className="button button-quiet" onClick={() => { void signOut(); }}>Sign out</button></section></div>;
  if (mustChangePassword && pathname !== "/settings") return <div className="access-denied"><div className="panel"><span className="section-kicker">PASSWORD UPDATE REQUIRED</span><h1>Set your own password.</h1><p>For account security, update the temporary password before continuing to the workspace.</p><Link className="button button-primary" href="/settings">Change password <ChevronRight size={15} /></Link></div></div>;

  const allowed = canAccessPath(role, pathname);
  if (!allowed) return <div className="access-denied"><div className="panel"><span className="section-kicker">{roleLabels[role]}</span><h1>This area is not part of your workspace.</h1><p>Your account is signed in with {roleLabels[role].toLowerCase()} access. Open the area assigned to your role.</p><Link className="button button-primary" href={role === "client" ? "/client" : "/"}>Continue to workspace <ChevronRight size={15} /></Link></div></div>;

  const sidebarExpanded = hoverNavigation;
  const navigationItems = [...groupsForRole(role).flatMap(group=>group.items),{label:"Account settings",href:"/settings",icon:SlidersHorizontal}].filter((item,index,items)=>items.findIndex(other=>other.href===item.href)===index);
  const isActiveRoute = (href:string) => pathname === href || (href !== "/" && href !== "/work" && pathname.startsWith(`${href}/`));
  const currentNavigation = navigationItems.find(item=>isActiveRoute(item.href)) ?? navigationItems[0];

  const parts = pathname.split("/").filter(Boolean);
  const trail: Crumb[] = [];
  if (parts.length) {
    const section = parts[0];
    trail.push({ label: routeLabels[section] ?? "Workspace", href: `/${section}` });
    if (section === "work" && parts[1] === "attendance") {
      trail.push({ label: "Attendance", href: "/work/attendance" });
      if (parts[2]) trail.push({ label: parts[2] === "office" ? "Office QR" : "Confirm attendance" });
    } else if (section === "projects" && parts[1] === "assignments") {
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

  return <div className={`app-shell sidebar-collapsed${sidebarExpanded ? " sidebar-expanded" : ""}`}>
    <a className="workspace-skip-link" href="#workspace-content">Skip to content</a>
    <header className={`topbar workspace-topbar ${navScrolled ? "is-scrolled" : ""}`}>
      <button className="global-search-trigger" type="button" onClick={() => window.dispatchEvent(new Event("evecture:command-open"))} aria-label="Search workspace"><Search size={15}/><span>Search workspace</span><kbd><Command size={11}/> K</kbd></button>
      <div className="top-actions">
        {role !== "client" && <Link className="button button-primary workspace-create" href="/requests/new"><Plus size={15}/><span>New enquiry</span></Link>}
        <NotificationCenter/>
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
                  <SlidersHorizontal size={15} />
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
    <aside id="workspace-sidebar" className="sidebar" aria-label="Workspace navigation" onPointerEnter={expandOnHover} onPointerLeave={closeAfterHover} onFocusCapture={expandOnHover} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))closeAfterHover();}} aria-hidden={mobileNavigation ? true : undefined} inert={mobileNavigation ? true : undefined}>
      <div className={`workspace-sidebar-heading ${role === "client" ? "" : "workspace-sidebar-heading-branded"}`}>{role === "client" ? <><span className="workspace-sidebar-caption">Client workspace</span><strong>Client portal</strong></> : <Link className="workspace-sidebar-brand" href="/" aria-label="Evecture workspace home"><img src="/evecture-logo.png" alt="" width={32} height={32} /><span>EVECTURE</span></Link>}</div>
      <div className="sidebar-nav-scroll">
        {groupsForRole(role).map(group => <section className="nav-group" key={group.title}>
          <div className="workspace-label">{group.title}</div>
          <nav className="primary-nav" aria-label={`${group.title} navigation`}>
            {group.items.map(({label,href,icon:Icon}) => {
              const active = isActiveRoute(href);
              return <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} title={label} aria-label={label} aria-current={active ? "page" : undefined}><span className="nav-icon"><Icon size={20} strokeWidth={1.75}/></span><span className="nav-link-label">{label}</span></Link>;
            })}
          </nav>
        </section>)}
      </div>
      <div className="workspace-sidebar-footer"><Link href="/settings" className={`nav-link ${pathname === "/settings" ? "active" : ""}`} title="Account settings" aria-current={pathname === "/settings" ? "page" : undefined}><span className="nav-icon"><SlidersHorizontal size={20} strokeWidth={1.75}/></span><span className="nav-link-label">Account settings</span></Link></div>
    </aside>
    <main className="main-area" id="workspace-content" tabIndex={-1}>
      <div className="workspace-contextbar"><nav className="breadcrumb" aria-label="Breadcrumb"><Link href={role === "client" ? "/client" : "/"}>Workspace</Link>{trail.length ? trail.map((crumb,index) => <span className="breadcrumb-segment" key={`${crumb.label}-${index}`}><ChevronRight size={12} className="crumb-slash"/>{index === trail.length-1 ? <strong aria-current="page">{crumb.label}</strong> : <Link href={crumb.href ?? "/"}>{crumb.label}</Link>}</span>) : <><ChevronRight size={12} className="crumb-slash"/><strong aria-current="page">Dashboard</strong></>}</nav><WorkspaceSaveIndicator/></div>
      <WorkspaceSyncFeedback/>
      {children}
    </main>
    <nav className={`mobile-navigation-island ${islandCollapsed ? "island-compact" : ""}`} aria-label="Mobile navigation">
      <button className="island-handle" type="button" onClick={()=>setIslandCollapsed(value=>!value)} aria-label={islandCollapsed?"Expand bottom navigation":"Collapse bottom navigation"} aria-expanded={!islandCollapsed} aria-controls="mobile-island-links"><span/>{islandCollapsed&&<><currentNavigation.icon size={18}/><ChevronUp size={14}/></>}</button>
      <div className="island-links" id="mobile-island-links" ref={islandScrollRef} inert={islandCollapsed?true:undefined} aria-hidden={islandCollapsed?true:undefined}>
        {navigationItems.map(({href,label,icon:Icon})=><Link key={href} href={href} className={`island-link ${isActiveRoute(href)?"active":""}`} aria-label={label} aria-current={isActiveRoute(href)?"page":undefined}><span className="island-icon"><Icon size={21} strokeWidth={1.75}/></span><span className="island-label">{label === "Account settings" ? "Settings" : label}</span></Link>)}
      </div>
    </nav>
    <CommandPalette/>
    <ToastHub/>
  </div>;
}
