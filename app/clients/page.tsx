"use client";
import {DeleteClientDialog} from "@/app/_components/delete-client-dialog";
import {ClientProjectEditDialog} from "@/app/_components/client-project-edit-dialog";
import {ClientProjectDrawer} from "@/app/_components/client-project-drawer";
import {EditDetailsDialog} from "@/app/_components/edit-details-dialog";
import {clientContactName,clientContactMatches} from "@/lib/client-identity";
import {customerEdits,customerOrganizations} from "@/lib/customer-editing";
import {canEditRecordDetails,linkedCustomerLeadIds} from "@/lib/record-editing";
import {useWorkspaceAuth} from "@/lib/workspace-auth";
import {flushWorkspaceChanges} from "@/lib/workspace-sync";
import {showToast} from "@/app/_components/toast-hub";

import { ProjectCardLogo } from "@/app/_components/project-card-logo";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  Building2,
  ChevronDown,
  ExternalLink,
  FolderKanban,
  Globe,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { getProjectClients, projectClientKey, getProjectDisplayTitle, getProjectDisplayServices, readProjects, updateProject, type Project } from "@/lib/projects";
import { readManagedProjects, updateManagedProject, type ManagedProject } from "@/lib/post-sale";
import { readLeads, updateLead, type Lead } from "@/lib/leads";
import { EmptyState } from "@/app/_components/empty-state";

type ClientProject = {
  logoDataUrl?: string;
  displayServices?: string;
  id: string;
  title: string;
  status?: string;
  operatingCompany?: string;
  contractedValue?: number;
  currency?: string;
  invoiceNumber?: string;
};

type ClientRecord = {
  key: string;
  name: string;
  contactName?: string;
  companyName?: string;
  organizations?: string[];
  email?: string;
  phone?: string;
  designation?: string;
  country?: string;
  website?: string;
  industry?: string;
  projects: ClientProject[];
  managedPlans: ManagedProject[];
};

function clientSlug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
}

export default function ClientsPage() {
  const {role}=useWorkspaceAuth();
  const [addingProject,setAddingProject]=useState<ClientRecord|null>(null);
  const [editingClient,setEditingClient]=useState<ClientRecord|null>(null);
  const [editingProject,setEditingProject]=useState<Project|null>(null);
  const [deletingClient,setDeletingClient]=useState<ClientRecord|null>(null);
  const [deletedKeys,setDeletedKeys]=useState<Set<string>>(()=>new Set());

  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<ManagedProject[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [expandedClient, setExpandedClient] = useState<string | null>(null);

  useEffect(() => {
    const refreshProjects = () => setProjects(readProjects().filter(project => project.projectType !== "internal"));
    const refreshPlans = () => setPlans(readManagedProjects());
    const refreshLeads = () => setLeads(readLeads());
    const refreshAll = () => {
      refreshProjects();
      refreshPlans();
      refreshLeads();
    };
    refreshAll();
    window.addEventListener("evecture:projects-updated", refreshProjects);
    window.addEventListener("evecture:post-sale-updated", refreshPlans);
    window.addEventListener("evecture:leads-updated", refreshLeads);
    window.addEventListener("storage", refreshAll);
    return () => {
      window.removeEventListener("evecture:projects-updated", refreshProjects);
      window.removeEventListener("evecture:post-sale-updated", refreshPlans);
      window.removeEventListener("evecture:leads-updated", refreshLeads);
      window.removeEventListener("storage", refreshAll);
    };
  }, []);

  const clients = useMemo(() => {
    const clientMap = new Map<string, ClientRecord>();

    const leadsMap = new Map<string, Lead>();
    for (const lead of leads) {
      leadsMap.set(lead.id, lead);
    }

    const normalize = (s: string) => s.trim().toLowerCase();

    // Missing contact names cannot identify a client. Match meaningful names,
    // exact email addresses, or exact organizations instead of fuzzy substrings.
    const findExisting = (clientName: string, email?: string, company?: string) => {
      const name=clientContactName(clientName),organization=normalize(clientContactName(company));
      return [...clientMap.values()].find(client=>
        (!!email?.trim()&&email.trim().toLowerCase()===client.email?.trim().toLowerCase())||
        (!!name&&normalize(name)===normalize(clientContactName(client.contactName??client.name)))||
        (!!organization&&organization===normalize(client.companyName||""))
      );
    };

    // 1. Process all project workspaces
    for (const project of projects.filter(project=>!project.enquiryDetails?.clientDeleted)) {
      const rawClientName = clientContactName(project.clientName);
      const rawCompany = clientContactName(project.clientCompany);
      const rawEmail = project.clientEmail?.trim() || "";

      // Look up linked lead by ID, lead.projectId, email, name, or company
      const linkedLead =
        (project.leadId ? leadsMap.get(project.leadId) : undefined) ||
        leads.find((l) => l.projectId && l.projectId === project.id) ||
        (rawEmail ? leads.find((l) => l.email && l.email.trim().toLowerCase() === rawEmail.toLowerCase()) : undefined) ||
        (rawClientName ? leads.find((l) => clientContactName(l.fullName).toLowerCase() === rawClientName.toLowerCase()) : undefined) ||
        (rawCompany
          ? leads.find((l) => {
              if (!l.companyName) return false;
              const n1 = normalize(l.companyName);
              const n2 = normalize(rawCompany);
              return !!n1 && n1 === n2;
            })
          : undefined);

      const contactName=rawClientName||clientContactName(linkedLead?.fullName);
      const resolvedCompany=rawCompany||clientContactName(linkedLead?.companyName)||undefined;
      const resolvedPersonName=contactName||resolvedCompany||rawEmail||"Unnamed client";

      const email = rawEmail || linkedLead?.email?.trim() || undefined;
      const phone = project.enquiryDetails?.phone ?? (linkedLead?.phone?.trim() || undefined);
      const designation = project.enquiryDetails?.designation ?? (linkedLead?.designation?.trim() || undefined);
      const country = project.enquiryDetails?.country ?? (linkedLead?.country?.trim() || undefined);
      const website = project.enquiryDetails?.companyWebsite ?? (linkedLead?.companyWebsite?.trim() || undefined);
      const industry = project.enquiryDetails?.industry ?? (linkedLead?.industry?.trim() || undefined);

      let client = findExisting(contactName, email, resolvedCompany);

      if (!client) {
        const key = `client-project-${project.id}`;
        client = {
          key,
          name: resolvedPersonName,
          contactName,
          companyName: resolvedCompany,
          email,
          phone,
          designation,
          country,
          website,
          industry,
          projects: [],
          managedPlans: [],
        };
        clientMap.set(key, client);
      } else {
        if(contactName&&!client.contactName){client.name=contactName;client.contactName=contactName;}
        if (!client.companyName && resolvedCompany) client.companyName = resolvedCompany;
        if (!client.email && email) client.email = email;
        if (!client.phone && phone) client.phone = phone;
        if (!client.designation && designation) client.designation = designation;
        if (!client.country && country) client.country = country;
        if (!client.website && website) client.website = website;
        if (!client.industry && industry) client.industry = industry;
      }

      if (!client.projects.some((p) => p.id === project.id)) {
        client.projects.push({
          id: project.id,
          title: project.title.trim() || getProjectDisplayTitle(project),
          displayServices: getProjectDisplayServices(project),
          logoDataUrl: project.logoDataUrl,
          status: project.status,
          operatingCompany: project.operatingCompany,
          contractedValue: project.contractedValue,
          currency: project.currency,
          invoiceNumber: project.invoice?.invoiceNumber,
        });
      }
    }

    // 2. Process managed plans / retainers
    for (const plan of plans.filter(plan=>!plan.clientDetails?.deleted)) {
      let client: ClientRecord | undefined;

      if (plan.sourceProjectId) {
        for (const c of clientMap.values()) {
          if (c.projects.some((p) => p.id === plan.sourceProjectId)) {
            client = c;
            break;
          }
        }
      }

      if (!client) {
        client = findExisting(clientContactName(plan.clientDetails?.name), plan.clientDetails?.email, plan.clientCompany);
      }

      if (client) {
        if (!client.managedPlans.some((m) => m.id === plan.id)) {
          client.managedPlans.push(plan);
        }
      } else {
        const companyName = plan.clientCompany.trim();
        const matchingLead = leads.find((l) => {
          if (!l.companyName) return false;
          const n1 = normalize(l.companyName);
          const n2 = normalize(companyName);
          return !!n1 && n1 === n2;
        });
        const contactName=plan.clientDetails?clientContactName(plan.clientDetails.name):clientContactName(matchingLead?.fullName);
        const resolvedName=contactName||companyName||plan.clientDetails?.email||"Unnamed client";
        const resolvedCompany=companyName||undefined;

        const key = `client-plan-${plan.id}`;
        client = {
          key,
          name: resolvedName,
          contactName,
          companyName: resolvedCompany,
          email: plan.clientDetails?.email??matchingLead?.email?.trim(),
          phone: plan.clientDetails?.contactDetails?.phone??matchingLead?.phone?.trim(),
          designation: plan.clientDetails?.contactDetails?.designation??matchingLead?.designation?.trim(),
          country: plan.clientDetails?.contactDetails?.country??matchingLead?.country?.trim(),
          website: plan.clientDetails?.contactDetails?.companyWebsite??matchingLead?.companyWebsite?.trim(),
          industry: plan.clientDetails?.contactDetails?.industry??matchingLead?.industry?.trim(),
          projects: [],
          managedPlans: [plan],
        };
        clientMap.set(key, client);
      }
    }

    // 3. Process accepted / converted leads
    for (const lead of leads) {
      if (!lead.qualification?.clientDeleted&&(lead.status === "ACCEPTED" || lead.status === "CONVERTED")) {
        const leadName = clientContactName(lead.fullName);
        const leadCompany = clientContactName(lead.companyName);
        const leadEmail = lead.email?.trim() || "";

        let client = [...clientMap.values()].find(client=>client.projects.some(item=>item.id===lead.projectId||projects.find(project=>project.id===item.id)?.leadId===lead.id))||findExisting(leadName, leadEmail, leadCompany);

        if (!client) {
          const displayName=leadName||leadCompany||leadEmail||"Unnamed client";
          const key = `client-lead-${lead.id}`;
          client = {
            key,
            name: displayName,
            contactName:leadName,
            companyName: leadCompany || undefined,
            email: leadEmail || undefined,
            phone: lead.phone?.trim() || undefined,
            designation: lead.designation?.trim() || undefined,
            country: lead.country?.trim() || undefined,
            website: lead.companyWebsite?.trim() || undefined,
            industry: lead.industry?.trim() || undefined,
            projects: [],
            managedPlans: [],
          };
          clientMap.set(key, client);
        } else if (client) {
          if (leadName && (!client.name || client.name.toLowerCase() === client.companyName?.toLowerCase())) {
            client.name = leadName;client.contactName=leadName;
          }
          if (!client.companyName && leadCompany) client.companyName = leadCompany;
          if (!client.email && leadEmail) client.email = leadEmail;
          if (!client.phone && lead.phone) client.phone = lead.phone.trim();
          if (!client.designation && lead.designation) client.designation = lead.designation.trim();
          if (!client.country && lead.country) client.country = lead.country.trim();
          if (!client.website && lead.companyWebsite) client.website = lead.companyWebsite.trim();
          if (!client.industry && lead.industry) client.industry = lead.industry.trim();
        }

        // Connect lead's projectId if specified
        if (client && lead.projectId) {
          const matchingProject = projects.find((p) => p.id === lead.projectId);
          if (matchingProject && !client.projects.some((p) => p.id === matchingProject.id)) {
            client.projects.push({
              id: matchingProject.id,
              title: getProjectDisplayTitle(matchingProject),
              displayServices: getProjectDisplayServices(matchingProject),
              logoDataUrl: matchingProject.logoDataUrl,
              status: matchingProject.status,
              operatingCompany: matchingProject.operatingCompany,
              contractedValue: matchingProject.contractedValue,
              currency: matchingProject.currency,
              invoiceNumber: matchingProject.invoice?.invoiceNumber,
            });
          }
        }
      }
    }

    // 4. Merge any residual company-named client into the person-named client
    for (const [key, client] of [...clientMap.entries()]) {
      if (client.companyName && client.name.toLowerCase() === client.companyName.toLowerCase()) {
        const personClient = [...clientMap.values()].find(
          (c) =>
            c.key !== key &&
            c.companyName &&
            (c.companyName.toLowerCase() === client.companyName!.toLowerCase() ||
              normalize(c.companyName) === normalize(client.companyName!)) &&
            c.name.toLowerCase() !== c.companyName.toLowerCase()
        );
        if (personClient) {
          for (const proj of client.projects) {
            if (!personClient.projects.some((p) => p.id === proj.id)) {
              personClient.projects.push(proj);
            }
          }
          for (const plan of client.managedPlans) {
            if (!personClient.managedPlans.some((p) => p.id === plan.id)) {
              personClient.managedPlans.push(plan);
            }
          }
          clientMap.delete(key);
        }
      }
    }

    // 5. Final fallback pass: associate any project with matching client
    for (const project of projects.filter(project=>!project.enquiryDetails?.clientDeleted)) {
      for (const client of clientMap.values()) {
        const normProjCompany = project.clientCompany ? normalize(project.clientCompany) : "";
        const normClientCompany = client.companyName ? normalize(client.companyName) : "";
        const normClientName = normalize(clientContactName(client.contactName??client.name));
        const normProjClientName = normalize(clientContactName(project.clientName));

        const matchesCompany =
          normProjCompany &&
          normClientCompany &&
          normProjCompany === normClientCompany;

        const matchesName =
          normClientName &&
          normProjClientName && normClientName === normProjClientName;

        const matchesEmail =
          client.email && project.clientEmail && client.email.toLowerCase() === project.clientEmail.toLowerCase();

        if ((matchesCompany || matchesName || matchesEmail) && !client.projects.some((p) => p.id === project.id)) {
          client.projects.push({
            id: project.id,
            title: project.title.trim() || getProjectDisplayTitle(project),
            displayServices: getProjectDisplayServices(project),
            logoDataUrl: project.logoDataUrl,
            status: project.status,
            operatingCompany: project.operatingCompany,
            contractedValue: project.contractedValue,
            currency: project.currency,
            invoiceNumber: project.invoice?.invoiceNumber,
          });
        }
      }
    }

    // Shared delivery projects appear under every explicitly linked client.
    for(const project of projects)for(const participant of getProjectClients(project).slice(1)){
      let client=findExisting(participant.name,participant.email,participant.companyName);
      if(!client){
        const key=`shared-${project.id}-${projectClientKey(participant)}`;
        client={key,name:clientContactName(participant.name)||participant.companyName||participant.email||"Unnamed client",contactName:clientContactName(participant.name),companyName:participant.companyName,email:participant.email,phone:participant.contactDetails?.phone,country:participant.contactDetails?.country,website:participant.contactDetails?.companyWebsite,industry:participant.contactDetails?.industry,designation:participant.contactDetails?.designation,projects:[],managedPlans:[]};
        clientMap.set(key,client);
      }
      if(!client.projects.some(item=>item.id===project.id))client.projects.push({id:project.id,title:getProjectDisplayTitle(project),displayServices:getProjectDisplayServices(project),logoDataUrl:project.logoDataUrl,status:project.status,operatingCompany:project.operatingCompany});
    }

    return [...clientMap.values()].map(client=>{
      const organizations=new Map<string,string>();
      const add=(value?:string)=>{const name=value?.trim();if(name)organizations.set(name.toLocaleLowerCase(),organizations.get(name.toLocaleLowerCase())||name);};
      const matches=(person:{name:string;email?:string;companyName?:string})=>clientContactMatches(client,person);
      add(client.companyName);
      const projectIds=new Set(client.projects.map(project=>project.id));
      for(const project of projects.filter(project=>projectIds.has(project.id)))for(const participant of getProjectClients(project))if(matches(participant))add(participant.companyName);
      for(const lead of leads)if(!lead.qualification?.clientDeleted&&matches({name:lead.fullName,email:lead.email,companyName:lead.companyName}))add(lead.companyName);
      for(const plan of client.managedPlans)add(plan.clientCompany);
      return {...client,organizations:[...organizations.values()]};
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, plans, leads]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible=clients.filter(client=>!deletedKeys.has(client.key));
    if (!q) return visible;
    if(!clientContactName(q))return visible.filter(client=>!client.contactName);
    return visible.filter((client) => {
      return (
        client.name.toLowerCase().includes(q) ||
        client.organizations?.some(name=>name.toLowerCase().includes(q)) ||
        (client.email && client.email.toLowerCase().includes(q)) ||
        (client.phone && client.phone.toLowerCase().includes(q)) ||
        (client.designation && client.designation.toLowerCase().includes(q)) ||
        (client.country && client.country.toLowerCase().includes(q)) ||
        (client.industry && client.industry.toLowerCase().includes(q)) ||
        client.projects.some((p) => p.title.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) ||
        client.managedPlans.some((m) => m.projectTitle?.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      );
    });
  }, [clients, search, deletedKeys]);

  useEffect(() => {
    const hash=window.location.hash.slice(1);
    if(!hash||clients.length===0)return;
    let targetId:string;
    try{targetId=decodeURIComponent(hash);}catch{return;}
    const target=clients.find(client=>client.key===targetId)||clients.find(client=>`client-${clientSlug(client.name)}`===targetId);
    if(!target)return;
    const frame=window.requestAnimationFrame(()=>{
      document.getElementById(target.key)?.scrollIntoView({behavior:"smooth",block:"center"});
      setExpandedClient(target.key);
    });
    return()=>window.cancelAnimationFrame(frame);
  }, [clients]);

  return (
    <div className="page-content clients-page">
      <section className="welcome-row">
        <div>
          <h1>Clients</h1>
          <p className="welcome-subtitle">Keep client relationships, primary contacts, and linked work in one place.</p>
        </div>
        <div className="welcome-actions">
          <Link className="button button-quiet" href="/projects">
            <FolderKanban size={15} />
            Projects
          </Link>
          <Link className="button button-primary" href="/requests">
            <Plus size={15} />
            From accepted lead
          </Link>
        </div>
      </section>

      {clients.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title="No clients recorded yet"
          description="Clients will appear here automatically when you create project workspaces or retainer plans."
          action={
            <Link className="button button-primary" href="/projects">
              Open projects <ArrowRight size={15} />
            </Link>
          }
        />
      ) : (
        <>
          <div className="clients-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ws-muted, #64748b)" }} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients, organizations, or projects…"
                style={{
                  width: "100%",
                  height: 36,
                  paddingLeft: 34,
                  paddingRight: search ? 32 : 12,
                  fontSize: 13,
                  border: "1px solid var(--ws-border, #e2e8f0)",
                  borderRadius: 0,
                  background: "var(--ws-surface, #ffffff)",
                  color: "var(--ws-text, #0f172a)",
                  outline: "none",
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    color: "var(--ws-muted, #64748b)",
                    display: "inline-flex",
                  }}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <span style={{ fontSize: 12, color: "var(--ws-muted, #64748b)", whiteSpace: "nowrap" }}>
              {filteredClients.length} of {clients.length} {clients.length === 1 ? "client" : "clients"}
            </span>
          </div>

          {filteredClients.length === 0 ? (
            <div className="panel" style={{ padding: "48px 24px", textAlign: "center", justifyItems: "center" }}>
              <Users size={24} color="#94a3b8" />
              <strong style={{ display: "block", marginTop: 10, fontSize: 15, color: "var(--ws-text, #0f172a)" }}>No clients match "{search}"</strong>
              <p style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--ws-muted, #64748b)" }}>Try searching by client name, organization, email, or project title.</p>
              <button type="button" className="button button-quiet" onClick={() => setSearch("")}>
                Clear filter
              </button>
            </div>
          ) : (
            <div className="clients-list">
              {filteredClients.map((client) => {
                const clientId = client.key;
                const isExpanded = expandedClient === client.key;
                return (
                  <article className={`client-card panel ${isExpanded ? "client-card-expanded" : ""}`} id={clientId} key={client.key}>
                    <button
                      className="client-card-summary"
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedClient(isExpanded ? null : client.key)}
                    >
                      <span className="client-card-main">
                        <strong>{client.name}</strong>
                        <small>
                          {client.email ? (
                            <>
                              <span>{client.email}</span>
                              {!!client.organizations?.length && (
                                <span style={{ color: "var(--ws-muted, #64748b)" }}> · {client.organizations.join(" · ")}</span>
                              )}
                            </>
                          ) : client.organizations?.length ? (
                            <span>{client.organizations.join(" · ")}</span>
                          ) : (
                            <span style={{ color: "var(--ws-muted, #94a3b8)" }}>No email recorded</span>
                          )}
                        </small>
                      </span>
                      <span className="client-card-stat client-card-organization-count">
                        <strong>{client.organizations?.length||0}</strong>
                        <small>{client.organizations?.length===1?"Organization":"Organizations"}</small>
                      </span>
                      <span className="client-card-stat">
                        <strong>{client.projects.length}</strong>
                        <small>{client.projects.length === 1 ? "Project" : "Projects"}</small>
                      </span>
                      <span className="client-card-stat">
                        <strong>{client.managedPlans.length}</strong>
                        <small>{client.managedPlans.length === 1 ? "Managed Plan" : "Managed Plans"}</small>
                      </span>
                      <ChevronDown size={21} className="client-card-chevron" />
                    </button>
                    {isExpanded && (
                      <div className="client-card-details">
                        {/* Section 1: All Client Details */}
                        <section>
                          <h2>Client details</h2>
                          {canEditRecordDetails(role)&&(client.projects.length>0||client.managedPlans.length>0||linkedCustomerLeadIds(client,projects,leads).length>0)&&<button type="button" className="button button-quiet" onClick={()=>setEditingClient(client)}>Edit customer</button>}
                          {canEditRecordDetails(role)&&<button type="button" className="button button-quiet" onClick={()=>setDeletingClient(client)}><Trash2 size={14}/>Delete client</button>}
                          <div className="client-contact-fields">
                            <div>
                              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                Client name
                              </span>
                              <strong style={{ display: "block", fontSize: 15, fontWeight: 700, color: "var(--ws-text, #0f172a)" }}>
                                {client.contactName||"Not recorded"}
                              </strong>
                            </div>

                            {!!client.organizations?.length && (
                              <div>
                                <span className="client-organizations-label">Organizations ({client.organizations.length})</span>
                                <ul className="client-organizations" aria-label="Associated organizations">{client.organizations.map(organization=><li key={organization}><Building2 size={13} aria-hidden="true"/><span>{organization}</span></li>)}</ul>
                              </div>
                            )}

                            {client.email && (
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                  Email address
                                </span>
                                <a
                                  href={`mailto:${client.email}`}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ws-text, #0f172a)", fontSize: 13, textDecoration: "none" }}
                                >
                                  <Mail size={13} style={{ color: "var(--ws-muted, #64748b)", flexShrink: 0 }} />
                                  <span>{client.email}</span>
                                </a>
                              </div>
                            )}

                            {client.phone && (
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                  Phone
                                </span>
                                <a
                                  href={`tel:${client.phone}`}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ws-text, #0f172a)", fontSize: 13, textDecoration: "none" }}
                                >
                                  <Phone size={13} style={{ color: "var(--ws-muted, #64748b)", flexShrink: 0 }} />
                                  <span>{client.phone}</span>
                                </a>
                              </div>
                            )}

                            {client.designation && (
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                  Designation
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ws-text, #0f172a)", fontSize: 13 }}>
                                  <Briefcase size={13} style={{ color: "var(--ws-muted, #64748b)", flexShrink: 0 }} />
                                  <span>{client.designation}</span>
                                </div>
                              </div>
                            )}

                            {client.country && (
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                  Location
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ws-text, #0f172a)", fontSize: 13 }}>
                                  <MapPin size={13} style={{ color: "var(--ws-muted, #64748b)", flexShrink: 0 }} />
                                  <span>{client.country}</span>
                                </div>
                              </div>
                            )}

                            {client.website && (
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                  Website
                                </span>
                                <a
                                  href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--ws-text, #0f172a)", fontSize: 13, textDecoration: "none" }}
                                >
                                  <Globe size={13} style={{ color: "var(--ws-muted, #64748b)", flexShrink: 0 }} />
                                  <span>{client.website.replace(/^https?:\/\//, "")}</span>
                                  <ExternalLink size={11} style={{ color: "var(--ws-muted, #64748b)" }} />
                                </a>
                              </div>
                            )}

                            {client.industry && (
                              <div>
                                <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--ws-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                                  Industry
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ws-text, #0f172a)", fontSize: 13 }}>
                                  <Tag size={13} style={{ color: "var(--ws-muted, #64748b)", flexShrink: 0 }} />
                                  <span>{client.industry}</span>
                                </div>
                              </div>
                            )}

                            {!client.companyName && !client.email && !client.phone && !client.designation && !client.country && (
                              <span className="table-muted">No additional contact details recorded</span>
                            )}
                          </div>
                        </section>

                        {/* Section 2: Associated Projects */}
                        <section>
                          <div className="client-projects-heading"><h2>Associated projects ({client.projects.length})</h2>{canEditRecordDetails(role)&&<button type="button" className="button button-quiet" onClick={()=>setAddingProject(client)}><Plus size={14}/>Add project</button>}</div>
                          {client.projects.length ? (
                            <div className="client-detail-links" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {client.projects.map((project) => (
                                <div className="client-project-entry" key={project.id}>
                                <Link
                                  href={`/projects/${project.id}`}
                                  key={project.id}
                                  className="client-project-card"
                                  title={`Open project workspace for ${project.title}`}
                                  style={{
                                    display: "block",
                                    padding: "12px 14px",
                                    border: "1px solid var(--ws-border, #e2e8f0)",
                                    background: "var(--ws-surface, #ffffff)",
                                    textDecoration: "none",
                                    borderRadius: 0,
                                    transition: "border-color 0.15s ease",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                    <span className="project-card-identity" style={{ fontSize: 14, fontWeight: 700, color: "var(--ws-text, #0f172a)" }}>
                                      <ProjectCardLogo src={project.logoDataUrl} title={project.title} />
                                      <span><strong>{project.title}</strong>{project.displayServices && <span className="project-display-services">{project.displayServices}</span>}</span>
                                    </span>
                                    {project.operatingCompany && (
                                      <span
                                        style={{
                                          fontSize: 11,
                                          fontWeight: 700,
                                          color: project.operatingCompany.toLowerCase() === "servn" ? "#2563eb" : "#dc2626",
                                          background: "transparent",
                                          border: "none",
                                          padding: 0,
                                        }}
                                      >
                                        {project.operatingCompany}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ws-muted, #64748b)" }}>
                                    <span style={{ fontFamily: "var(--font-body)", fontWeight: 600, color: "var(--ws-text, #334155)" }}>
                                      {project.id}
                                    </span>
                                    {project.status && (
                                      <span>· {project.status}</span>
                                    )}
                                    {project.contractedValue !== undefined && (
                                      <span>
                                        · {project.currency || "USD"} {project.contractedValue.toLocaleString()}
                                      </span>
                                    )}
                                    {project.invoiceNumber && (
                                      <span>· {project.invoiceNumber}</span>
                                    )}
                                    <ExternalLink size={12} style={{ marginLeft: "auto", color: "var(--ws-muted, #94a3b8)" }} />
                                  </div>
                                </Link>
                                {canEditRecordDetails(role)&&<div className="client-project-edit-action"><button type="button" className="button button-quiet" aria-label={`Edit project ${project.title}`} onClick={()=>{const current=readProjects().find(item=>item.id===project.id);if(current)setEditingProject(current);}}>Edit project</button></div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="table-muted">No associated projects</span>
                          )}
                        </section>

                        {/* Section 3: Managed Plans */}
                        <section>
                          <h2>Managed plans ({client.managedPlans.length})</h2>
                          {client.managedPlans.length ? (
                            <div className="client-plan-list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                              {client.managedPlans.map((plan) => (
                                <div
                                  key={plan.id}
                                  style={{
                                    padding: "12px 14px",
                                    border: "1px solid var(--ws-border, #e2e8f0)",
                                    background: "var(--ws-surface, #ffffff)",
                                    borderRadius: 0,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                                    <strong style={{ fontSize: 14, fontWeight: 700, color: "var(--ws-text, #0f172a)" }}>
                                      {plan.projectTitle || plan.clientCompany || plan.model}
                                    </strong>
                                    {plan.status && (
                                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ws-text, #475569)" }}>
                                        {plan.status}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--ws-muted, #64748b)" }}>
                                    <span>{plan.model}</span>
                                    <span> · {plan.currency} {plan.managementAmount.toLocaleString()}</span>
                                    <span> · {plan.billingCycle}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="table-muted">No managed plans</span>
                          )}
                        </section>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
      {canEditRecordDetails(role)&&deletingClient&&<DeleteClientDialog client={deletingClient} onClose={()=>setDeletingClient(null)} onDeleted={()=>{setDeletedKeys(keys=>new Set([...keys,deletingClient.key]));setExpandedClient(null);showToast({message:"Client deleted. Associated work and documents were kept."});}}/>}
      {canEditRecordDetails(role)&&editingProject&&<ClientProjectEditDialog project={editingProject} onClose={()=>setEditingProject(null)}/>}
      {canEditRecordDetails(role)&&addingProject&&<ClientProjectDrawer initialClient={{name:addingProject.contactName??addingProject.name,companyName:addingProject.companyName,email:addingProject.email,contactDetails:{phone:addingProject.phone,designation:addingProject.designation,country:addingProject.country,companyWebsite:addingProject.website,industry:addingProject.industry}}} onClose={()=>setAddingProject(null)} onCreated={()=>{setAddingProject(null);showToast({message:"Project added to client."});}}/>}
      {canEditRecordDetails(role)&&editingClient&&<EditDetailsDialog title="Edit customer details" onClose={()=>setEditingClient(null)} fields={[
        ...customerOrganizations(editingClient).map((name,index)=>({name:index?`organization_${index}`:"companyName",label:index?`Organization ${index+1}`:"Organization name",value:name})),
        {name:"name",label:"Contact name",value:editingClient.contactName??editingClient.name,required:true},
        {name:"email",label:"Contact email",value:editingClient.email,type:"email" as const},
        {name:"phone",label:"Phone",value:editingClient.phone},
        {name:"designation",label:"Designation",value:editingClient.designation},
        {name:"country",label:"Country",value:editingClient.country},
        {name:"website",label:"Website",value:editingClient.website},
        {name:"industry",label:"Industry",value:editingClient.industry},
      ]} onSave={async values=>{
        if(!canEditRecordDetails(role))throw new Error("You do not have permission to edit customers.");
        const {leadUpdates,projectUpdates,planUpdates}=customerEdits(editingClient,values,readProjects(),readLeads(),readManagedProjects());
        for(const {id,updates} of leadUpdates)updateLead(id,updates);
        for(const {id,updates} of projectUpdates)updateProject(id,updates);
        for(const {id,updates} of planUpdates)updateManagedProject(id,updates);
        await flushWorkspaceChanges();setExpandedClient(null);showToast({message:"Customer details saved."});
      }}/>}
    </div>
  );
}
