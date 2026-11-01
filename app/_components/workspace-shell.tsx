"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ListTodo, ChevronDown, ChevronRight, Command, Files, FolderOpenDot, Repeat2, ContactRound, PanelsTopLeft, LogOut, Menu, X, Plus, ScanLine, ReceiptText, Search, SlidersHorizontal, User, UserRoundCog, Building2, ClipboardCheck } from "lucide-react";
import { WorkspaceSaveIndicator, WorkspaceSyncFeedback } from "@/app/_components/providers";
import { CommandPalette } from "@/app/_components/command-palette";
import { ToastHub } from "@/app/_components/toast-hub";
import { RoleIcon } from "@/app/_components/role-icon";
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
const employeeGroups = [
  { title: "Workspace", items: [
    { label: "Dashboard", href: "/", icon: PanelsTopLeft },
    { label: "Projects", href: "/projects", icon: FolderOpenDot },
    { label: "Tasks", href: "/work", icon: ListTodo },
    { label: "Attendance", href: "/work/attendance", icon: ScanLine },
  ]},
];

const clientGroups = [
  { title: "CLIENT PORTAL", items: [{ label: "Projects", href: "/client/projects", icon: FolderOpenDot }] },

];

function groupsForRole(role: WorkspaceRole) {
  if (role === "admin") return adminGroups;
  if (role === "client") return clientGroups;
  return employeeGroups;
}

const routeLabels: Record<string, string> = { admin: "Admin", client: "Client portal", requests: "Leads", proposals: "Proposals", projects: "Project workspaces", invoices: "Invoices", reviews: "Reviews", work: "Tasks", clients: "Clients", "post-sale": "Retainers", settings: "Account settings", users: "Users" };

type Crumb = { label: string; href?: string };

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [signOutError,setSignOutError] = useState("");
  const [hoverNavigation,setHoverNavigation] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mobileSidebarOpen,setMobileSidebarOpen]=useState(false);
  const mobileMenuRef=useRef<HTMLButtonElement>(null);
  const sidebarRef=useRef<HTMLElement>(null);
  const [mobileNavigation,setMobileNavigation] = useState(false);
  const [navScrolled,setNavScrolled] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const { user, loading, role, signOut, configured, mustChangePassword, databaseRole, accessError, refreshAccess } = useWorkspaceAuth();

  async function handleSignOut(){
    setSignOutError("");
    try{if(await signOut())router.replace("/sign-in");}
    catch(cause){setSignOutError(cause instanceof Error?cause.message:"Unable to sign out.");setProfileMenuOpen(true);}
  }

  useEffect(() => () => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }, []);
  useEffect(()=>{
    if(!mobileNavigation||!mobileSidebarOpen)return;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
    const frame=requestAnimationFrame(()=>sidebarRef.current?.querySelector<HTMLElement>('[aria-current="page"],a,button')?.focus());
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        setMobileSidebarOpen(false);
        requestAnimationFrame(() => mobileMenuRef.current?.focus());
      }
    };
    document.addEventListener("keydown",escape);
    return()=>{cancelAnimationFrame(frame);document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",escape);};
  },[mobileNavigation,mobileSidebarOpen]);

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
    const updateViewport = () => { setMobileNavigation(media.matches); if(!media.matches)setMobileSidebarOpen(false); };
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
    setMobileSidebarOpen(false);
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

  if (pathname.startsWith("/sign-in")) return <>{children}</>;
  if (pathname.startsWith("/proposal/")) {
    if (loading) return <div className="access-denied" role="status"><p>Loading workspaceÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</p></div>;
    if (!user || role !== "employee") return <>{children}</>;
  }

  if (!configured) return <div className="access-denied"><div className="panel"><span className="section-kicker">SETUP REQUIRED</span><h1>Connect Supabase to continue.</h1><p>Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment, then restart the app.</p></div></div>;
  if (loading || !user) return <div className="access-denied" role="status"><p>Loading workspaceÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</p></div>;
  if (!databaseRole) return <div className="access-denied"><section className="panel"><h1>{accessError ? "Unable to verify workspace access" : "Workspace access is not assigned"}</h1><p>{accessError || "Ask an administrator to assign your account a workspace role."}</p>{signOutError&&<p role="alert">{signOutError}</p>}<button className="button button-primary" onClick={() => { void refreshAccess(); }}>Retry access check</button><button className="button button-quiet" onClick={()=>void handleSignOut()}>Sign out</button></section></div>;
  if (mustChangePassword && role === "admin" && pathname !== "/settings") return <div className="access-denied"><div className="panel"><span className="section-kicker">PASSWORD UPDATE REQUIRED</span><h1>Set your own password.</h1><p>For account security, update the temporary password before continuing to the workspace.</p><Link className="button button-primary" href="/settings">Change password <ChevronRight size={15} /></Link></div></div>;

  const allowed = canAccessPath(role, pathname);
  if (!allowed) return <div className="access-denied"><div className="panel"><span className="section-kicker">{roleLabels[role]}</span><h1>This area is not part of your workspace.</h1><p>Your account is signed in with {roleLabels[role].toLowerCase()} access. Open the area assigned to your role.</p><Link className="button button-primary" href={role === "client" ? "/client" : "/"}>Continue to workspace <ChevronRight size={15} /></Link></div></div>;

  const sidebarExpanded = hoverNavigation;
  const footerItems = role === "client" ? [] : [{label:"Reviews",href:"/reviews",icon:ClipboardCheck}];
  const navigationItems = [...groupsForRole(role).flatMap(group=>group.items),...footerItems,{label:"Account settings",href:"/settings",icon:SlidersHorizontal}].filter((item,index,items)=>items.findIndex(other=>other.href===item.href)===index);
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
  const mobilePageTitle = trail.length ? trail[trail.length - 1].label : currentNavigation.label;

  return <div className={`app-shell sidebar-collapsed${sidebarExpanded ? " sidebar-expanded" : ""}`}>
    <a className="workspace-skip-link" href="#workspace-content">Skip to content</a>
    <header className={`topbar workspace-topbar ${navScrolled ? "is-scrolled" : ""}`}>
      <button ref={mobileMenuRef} className="mobile-nav-toggle" type="button" aria-label={mobileSidebarOpen?"Close navigation":"Open navigation"} aria-expanded={mobileSidebarOpen} aria-controls="workspace-sidebar" onClick={()=>{setProfileMenuOpen(false);setMobileSidebarOpen(value=>!value);}}><Menu size={21}/></button>
      <span className="mobile-topbar-title">{mobilePageTitle}</span>
      <button className="global-search-trigger" type="button" onClick={() => window.dispatchEvent(new Event("evecture:command-open"))} aria-label="Search workspace"><Search size={15}/><span>Search workspace</span><kbd><Command size={11}/> K</kbd></button>
      <div className="top-actions">
        {role === "admin" && <Link className="button button-primary workspace-create" href="/requests/new"><Plus size={15}/><span>New enquiry</span></Link>}
        <NotificationCenter/>
          <div className="topbar-user-menu-container" ref={profileMenuRef}>
            <button
              className="topbar-user-btn"
              type="button"
              aria-label="User account menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((prev) => !prev)}
            >
              <span className={`topbar-user-icon role-avatar role-avatar-${role}`}>
                <RoleIcon role={role} size={16} />
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
                    <User size={20} aria-hidden="true" />
                  </div>
                  <div className="topbar-dropdown-user-info">
                    <strong>{user.user_metadata?.full_name || user.email?.split("@")[0] || "Workspace user"}</strong>
                    <small>{user.email || "evecture@workspace"}</small>
                    <span className={`role-pill role-${role}`}><RoleIcon role={role} size={13}/>{roleLabels[role]}</span>
                  </div>
                </div>
                <div className="topbar-dropdown-divider" />
                {role !== "client" && <Link
                  href="/settings"
                  className="topbar-dropdown-link"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  <SlidersHorizontal size={15} />
                  <span>Account settings</span>
                </Link>}
                <div className="topbar-dropdown-divider" />
                {signOutError&&<p role="alert" className="topbar-signout-error">{signOutError}</p>}
                <button
                  type="button"
                  className="topbar-dropdown-link signout-action"
                  onClick={() => { setProfileMenuOpen(false); void handleSignOut(); }}
                >
                  <LogOut size={15} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
      </div>
    </header>
    {mobileNavigation&&mobileSidebarOpen&&<button type="button" className="mobile-navigation-backdrop" aria-label="Dismiss navigation" onClick={()=>{setMobileSidebarOpen(false);mobileMenuRef.current?.focus();}}/>}
    <aside ref={sidebarRef} id="workspace-sidebar" className={`sidebar ${mobileSidebarOpen?"mobile-sidebar-open":""}`} role={mobileNavigation?"dialog":undefined} aria-modal={mobileNavigation&&mobileSidebarOpen?true:undefined} aria-label="Workspace navigation" onPointerEnter={expandOnHover} onPointerLeave={closeAfterHover} onFocusCapture={expandOnHover} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))closeAfterHover();}} aria-hidden={mobileNavigation&&!mobileSidebarOpen?true:undefined}
      onClick={event=>{
        const anchor = (event.target as HTMLElement).closest("a");
        if (!mobileNavigation || !anchor) return;
        const targetHref = anchor.getAttribute("href");
        if (targetHref === pathname) {
          setMobileSidebarOpen(false);
        } else {
          setTimeout(() => setMobileSidebarOpen(false), 80);
        }
      }}
      onKeyDown={event=>{if(!mobileNavigation||!mobileSidebarOpen||event.key!=="Tab")return;const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')).filter(item=>item.offsetParent!==null);const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}>
      {mobileNavigation&&<button type="button" className="mobile-sidebar-close" aria-label="Close navigation" onClick={()=>{setMobileSidebarOpen(false);mobileMenuRef.current?.focus();}}><X size={20}/></button>}
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
      <div className="workspace-sidebar-footer">{role !== "client" && <Link href="/reviews" className={`nav-link ${pathname === "/reviews" ? "active" : ""}`} title="Reviews" aria-current={pathname === "/reviews" ? "page" : undefined}><span className="nav-icon"><ClipboardCheck size={20} strokeWidth={1.75}/></span><span className="nav-link-label">Reviews</span></Link>}<Link href="/settings" className={`nav-link ${pathname === "/settings" ? "active" : ""}`} title="Account settings" aria-current={pathname === "/settings" ? "page" : undefined}><span className="nav-icon"><SlidersHorizontal size={20} strokeWidth={1.75}/></span><span className="nav-link-label">Account settings</span></Link></div>
    </aside>
    <main className="main-area" id="workspace-content" tabIndex={-1} inert={mobileNavigation&&mobileSidebarOpen?true:undefined}>
      <div className="workspace-contextbar"><nav className="breadcrumb" aria-label="Breadcrumb"><Link href={role === "client" ? "/client" : "/"}>Workspace</Link>{trail.length ? trail.map((crumb,index) => <span className="breadcrumb-segment" key={`${crumb.label}-${index}`}><ChevronRight size={12} className="crumb-slash"/>{index === trail.length-1 ? <strong aria-current="page">{crumb.label}</strong> : <Link href={crumb.href ?? "/"}>{crumb.label}</Link>}</span>) : <><ChevronRight size={12} className="crumb-slash"/><strong aria-current="page">Dashboard</strong></>}</nav><WorkspaceSaveIndicator/></div>
      <WorkspaceSyncFeedback/>
      {children}
    </main>

    <CommandPalette/>
    <ToastHub/>
  </div>;
}
