import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead, LeadInvoice, ProposalVersion } from "@/lib/leads";
import type { ManagedProject } from "@/lib/post-sale";
import type { Project, ProjectTeamMember, ProjectWorkItem } from "@/lib/projects";
import type { StoredInvoice } from "@/lib/invoices";
import { type WorkspaceCollection } from "@/lib/workspace-sync";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignees";

type DbRow = Record<string, any>;
type RelationalValues = Record<WorkspaceCollection, unknown>;
type RelationalSnapshot = {
  values: RelationalValues;
  remoteCollections: Set<WorkspaceCollection>;
  legacyCollections: Set<WorkspaceCollection>;
};

const collections: WorkspaceCollection[] = ["leads", "projects", "management", "invoices"];

function fail(result: { error: { message?: string; details?: string } | null }, action: string) {
  if (result.error) throw new Error(`${action}: ${result.error.message || result.error.details || "database request failed"}`);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullable(value: unknown) {
  return value === undefined || value === "" ? null : value;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" ? value : {};
}

function clientKey(company: string, email: string) {
  return `${company.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
}

function leadInvoiceToRow(invoice: LeadInvoice | StoredInvoice, relationships: { leadId?: string | null; projectId?: string | null }) {
  return {
    invoice_number: invoice.invoiceNumber,
    lead_id: relationships.leadId ?? null,
    project_id: relationships.projectId ?? null,
    operating_company: nullable(invoice.operatingCompany),
    bill_to: nullable(invoice.billTo),
    description: nullable(invoice.description),
    quantity: number(invoice.quantity, 1),
    unit_price: number(invoice.unitPrice),
    subtotal: number(invoice.subtotal),
    gst_enabled: Boolean(invoice.gstEnabled),
    gst_rate: number(invoice.gstRate),
    gst_amount: number(invoice.gstAmount),
    total: number(invoice.total),
    issue_date: invoice.issueDate || new Date().toISOString().slice(0, 10),
    due_date: nullable(invoice.dueDate),
    contract_value: number(invoice.contractValue),
    deposit_percent: number(invoice.depositPercent),
    deposit_amount: number(invoice.depositAmount),
    currency: invoice.currency || "USD",
    payment_terms: nullable(invoice.paymentTerms),
    payment_instructions: nullable(invoice.paymentInstructions),
    external_payment_link: nullable(invoice.externalPaymentLink),
    status: invoice.status,
    sent_at: nullable(invoice.sentAt),
    transaction_reference: nullable(invoice.transactionReference),
    confirmed_paid_at: nullable(invoice.confirmedPaidAt),
  };
}

function rowToInvoice(row: DbRow | undefined): LeadInvoice | undefined {
  if (!row) return undefined;
  return {
    invoiceNumber: text(row.invoice_number),
    operatingCompany: row.operating_company || undefined,
    billTo: row.bill_to || undefined,
    description: row.description || undefined,
    quantity: number(row.quantity, 1),
    unitPrice: number(row.unit_price),
    subtotal: number(row.subtotal),
    gstEnabled: Boolean(row.gst_enabled),
    gstRate: number(row.gst_rate),
    gstAmount: number(row.gst_amount),
    total: number(row.total),
    issueDate: text(row.issue_date),
    dueDate: text(row.due_date),
    contractValue: number(row.contract_value),
    depositPercent: number(row.deposit_percent),
    depositAmount: number(row.deposit_amount),
    currency: text(row.currency, "USD"),
    paymentTerms: text(row.payment_terms),
    paymentInstructions: text(row.payment_instructions),
    externalPaymentLink: text(row.external_payment_link),
    status: row.status,
    sentAt: row.sent_at || undefined,
    transactionReference: row.transaction_reference || undefined,
    confirmedPaidAt: row.confirmed_paid_at || undefined,
  };
}

function proposalToRow(proposal: ProposalVersion, leadId: string) {
  return {
    lead_id: leadId,
    version: proposal.version,
    status: proposal.status,
    share_token: nullable(proposal.shareToken),
    proposal_title: proposal.proposalTitle || "Proposal",
    project_title: nullable(proposal.projectTitle),
    prepared_by: nullable(proposal.preparedBy),
    executive_summary: nullable(proposal.executiveSummary),
    background: nullable(proposal.background),
    challenge: nullable(proposal.challenge),
    approach: nullable(proposal.approach),
    objectives: nullable(proposal.objectives),
    scope_included: nullable(proposal.scopeIncluded),
    scope_excluded: nullable(proposal.scopeExcluded),
    deliverables: nullable(proposal.deliverables),
    timeline: nullable(proposal.timeline),
    quoted_amount: number(proposal.quotedAmount),
    currency: proposal.currency || "USD",
    billing_structure: proposal.billingStructure,
    revision_rounds: number(proposal.revisionRounds),
    deposit_percent: number(proposal.depositPercent),
    payment_terms: nullable(proposal.paymentTerms),
    payment_schedule: nullable(proposal.paymentSchedule),
    approval_process: nullable(proposal.approvalProcess),
    client_requirements: nullable(proposal.clientRequirements),
    assumptions: nullable(proposal.assumptions),
    software_process_model: nullable(proposal.softwareProcessModel),
    process_activities: nullable(proposal.processActivities),
    budget_breakdown: nullable(proposal.budgetBreakdown),
    system_architecture: nullable(proposal.systemArchitecture),
    risk_assessment: nullable(proposal.riskAssessment),
    resources: nullable(proposal.resources),
    technical_specifications: nullable(proposal.technicalSpecifications),
    timeline_deliverables: nullable(proposal.timelineDeliverables),
    conclusion: nullable(proposal.conclusion),
    about_us: nullable(proposal.aboutUs),
    how_we_work: nullable(proposal.howWeWork),
    recent_work: nullable(proposal.recentWork),
    testimonial: nullable(proposal.testimonial),
    change_request_policy: nullable(proposal.changeRequestPolicy),
    intellectual_property: nullable(proposal.intellectualProperty),
    warranty_support: nullable(proposal.warrantySupport),
    cancellation_policy: nullable(proposal.cancellationPolicy),
    expiry_date: nullable(proposal.expiryDate),
    final_follow_up_date: nullable(proposal.finalFollowUpDate),
    sent_at: nullable(proposal.sentAt),
    viewed_at: nullable(proposal.viewedAt),
    responded_at: nullable(proposal.respondedAt),
    response_name: null,
    response_note: nullable(proposal.changeRequest),
    attachment_path: null,
    document_name: nullable(proposal.documentName),
    document_data_url: nullable(proposal.documentDataUrl),
    created_at: proposal.createdAt || new Date().toISOString(),
  };
}

function rowToProposal(row: DbRow, followUps: DbRow[]): ProposalVersion {
  return {
    version: number(row.version, 1),
    status: row.status,
    createdAt: text(row.created_at),
    sentAt: row.sent_at || undefined,
    viewedAt: row.viewed_at || undefined,
    respondedAt: row.responded_at || undefined,
    shareToken: row.share_token || undefined,
    proposalTitle: row.proposal_title || undefined,
    projectTitle: row.project_title || undefined,
    preparedBy: row.prepared_by || undefined,
    executiveSummary: row.executive_summary || undefined,
    background: row.background || undefined,
    challenge: row.challenge || undefined,
    approach: row.approach || undefined,
    objectives: row.objectives || undefined,
    timeline: row.timeline || undefined,
    softwareProcessModel: row.software_process_model || undefined,
    processActivities: row.process_activities || undefined,
    budgetBreakdown: row.budget_breakdown || undefined,
    systemArchitecture: row.system_architecture || undefined,
    riskAssessment: row.risk_assessment || undefined,
    resources: row.resources || undefined,
    technicalSpecifications: row.technical_specifications || undefined,
    timelineDeliverables: row.timeline_deliverables || undefined,
    conclusion: row.conclusion || undefined,
    aboutUs: row.about_us || undefined,
    howWeWork: row.how_we_work || undefined,
    recentWork: row.recent_work || undefined,
    testimonial: row.testimonial || undefined,
    paymentSchedule: row.payment_schedule || undefined,
    changeRequestPolicy: row.change_request_policy || undefined,
    intellectualProperty: row.intellectual_property || undefined,
    warrantySupport: row.warranty_support || undefined,
    cancellationPolicy: row.cancellation_policy || undefined,
    expiryDate: text(row.expiry_date),
    finalFollowUpDate: text(row.final_follow_up_date),
    quotedAmount: number(row.quoted_amount),
    currency: text(row.currency, "USD"),
    scopeIncluded: text(row.scope_included),
    scopeExcluded: text(row.scope_excluded),
    deliverables: text(row.deliverables),
    revisionRounds: number(row.revision_rounds),
    depositPercent: number(row.deposit_percent),
    billingStructure: row.billing_structure,
    paymentTerms: text(row.payment_terms),
    approvalProcess: text(row.approval_process),
    clientRequirements: text(row.client_requirements),
    assumptions: text(row.assumptions),
    documentName: text(row.document_name),
    documentDataUrl: row.document_data_url || undefined,
    followUps: followUps.map((followUp) => ({ label: text(followUp.label), dueAt: text(followUp.due_at), loggedAt: followUp.logged_at || undefined })),
  };
}

function projectClientDetails(project: Project) {
  return {
    companyName: project.clientCompany || project.clientName || project.clientEmail || "Unnamed client",
    contactName: project.clientName,
    email: project.clientEmail,
  };
}

async function ensureClients(client: SupabaseClient, details: { companyName: string; contactName?: string; email?: string; phone?: string; website?: string; country?: string; timezone?: string }[]) {
  const existing = await client.from("clients").select("id,company_name,email");
  fail(existing, "Loading clients");
  const ids = new Map<string, string>();
  for (const row of (existing.data ?? []) as DbRow[]) ids.set(clientKey(text(row.company_name), text(row.email)), text(row.id));
  for (const detail of details) {
    const companyName = detail.companyName || detail.contactName || detail.email || "Unnamed client";
    const email = detail.email || "";
    const key = clientKey(companyName, email);
    if (ids.has(key)) continue;
    const created = await client.from("clients").insert({
      company_name: companyName,
      contact_name: nullable(detail.contactName),
      email: nullable(email),
      phone: nullable(detail.phone),
      website: nullable(detail.website),
      country: nullable(detail.country),
      timezone: nullable(detail.timezone),
    }).select("id").single();
    fail(created, "Creating client");
    ids.set(key, text((created.data as DbRow).id));
  }
  return ids;
}

export async function readRelationalWorkspace(client: SupabaseClient): Promise<RelationalSnapshot> {
  const [leads, proposals, followUps, invoices, projects, team, workItems, links, managed] = await Promise.all([
    client.from("leads").select("*"),
    client.from("proposals").select("*"),
    client.from("proposal_follow_ups").select("*"),
    client.from("invoices").select("*"),
    client.from("projects").select("*"),
    client.from("project_team_members").select("*"),
    client.from("project_work_items").select("*"),
    client.from("project_links").select("*"),
    client.from("managed_projects").select("*"),
  ]);
  for (const [result, name] of [[leads, "leads"], [proposals, "proposals"], [followUps, "proposal follow-ups"], [invoices, "invoices"], [projects, "projects"], [team, "project team"], [workItems, "project work items"], [links, "project links"], [managed, "managed projects"]] as const) fail(result, `Loading ${name}`);

  const leadRows = (leads.data ?? []) as DbRow[];
  const proposalRows = (proposals.data ?? []) as DbRow[];
  const followUpRows = (followUps.data ?? []) as DbRow[];
  const invoiceRows = (invoices.data ?? []) as DbRow[];
  const projectRows = (projects.data ?? []) as DbRow[];
  const teamRows = (team.data ?? []) as DbRow[];
  const workItemRows = (workItems.data ?? []) as DbRow[];
  const linkRows = (links.data ?? []) as DbRow[];
  const managedRows = (managed.data ?? []) as DbRow[];
  const proposalsByLead = new Map<string, DbRow[]>();
  const followUpsByProposal = new Map<string, DbRow[]>();
  const invoiceByLead = new Map<string, DbRow>();
  const invoiceByProject = new Map<string, DbRow>();
  const projectsByLead = new Map<string, DbRow>();
  const teamByProject = new Map<string, DbRow[]>();
  const workItemsByProject = new Map<string, DbRow[]>();
  const linksByProject = new Map<string, DbRow[]>();

  for (const row of proposalRows) (proposalsByLead.get(text(row.lead_id)) ?? (proposalsByLead.set(text(row.lead_id), []), proposalsByLead.get(text(row.lead_id))!)).push(row);
  for (const row of followUpRows) (followUpsByProposal.get(text(row.proposal_id)) ?? (followUpsByProposal.set(text(row.proposal_id), []), followUpsByProposal.get(text(row.proposal_id))!)).push(row);
  for (const row of invoiceRows) {
    if (row.lead_id) invoiceByLead.set(text(row.lead_id), row);
    if (row.project_id) invoiceByProject.set(text(row.project_id), row);
  }
  for (const row of projectRows) if (row.lead_id) projectsByLead.set(text(row.lead_id), row);
  for (const row of teamRows) (teamByProject.get(text(row.project_id)) ?? (teamByProject.set(text(row.project_id), []), teamByProject.get(text(row.project_id))!)).push(row);
  for (const row of workItemRows) (workItemsByProject.get(text(row.project_id)) ?? (workItemsByProject.set(text(row.project_id), []), workItemsByProject.get(text(row.project_id))!)).push(row);
  for (const row of linkRows) (linksByProject.get(text(row.project_id)) ?? (linksByProject.set(text(row.project_id), []), linksByProject.get(text(row.project_id))!)).push(row);

  const leadIdByDbId = new Map(leadRows.map((row) => [text(row.id), text(row.external_id, text(row.id))]));
  const projectIdByDbId = new Map(projectRows.map((row) => [text(row.id), text(row.external_id, text(row.id))]));
  const hydratedLeads: Lead[] = leadRows.map((row) => {
    const dbId = text(row.id);
    const project = projectsByLead.get(dbId);
    return {
      id: text(row.external_id, dbId),
      createdAt: text(row.created_at),
      fullName: text(row.full_name),
      designation: text(row.designation),
      companyName: text(row.company_name),
      companyWebsite: text(row.company_website),
      email: text(row.email),
      phone: text(row.phone),
      country: text(row.country),
      timezone: text(row.timezone),
      services: Array.isArray(row.services) ? row.services : [],
      industry: text(row.industry),
      description: text(row.description),
      referenceLinks: text(row.reference_links),
      budgetRange: text(row.budget_range),
      budgetShared: Boolean(row.budget_shared),
      budgetNote: text(row.budget_note),
      urgency: row.urgency,
      source: text(row.source),
      acquisitionSource: text(row.acquisition_source),
      operatingCompany: row.operating_company || undefined,
      status: row.status,
      firstContactAt: row.first_contact_at || undefined,
      disqualificationReason: row.disqualification_reason || undefined,
      qualificationNote: row.qualification_note || undefined,
      qualification: row.qualification || undefined,
      proposals: (proposalsByLead.get(dbId) ?? []).sort((a, b) => number(a.version) - number(b.version)).map((proposal) => rowToProposal(proposal, followUpsByProposal.get(text(proposal.id)) ?? [])),
      acceptedAt: row.accepted_at || undefined,
      acceptanceName: row.acceptance_name || undefined,
      acceptanceDocumentName: row.acceptance_document_name || undefined,
      acceptanceDocumentDataUrl: row.acceptance_document_data_url || undefined,
      invoice: rowToInvoice(invoiceByLead.get(dbId)),
      projectId: project ? text(project.external_id, text(project.id)) : undefined,
    };
  });

  const proposalIdByLeadAndVersion = new Map(proposalRows.map((row) => [`${text(row.lead_id)}|${number(row.version)}`, text(row.id)]));
  const hydratedProjects: Project[] = projectRows.map((row) => {
    const dbId = text(row.id);
    const lead = leadRows.find((candidate) => text(candidate.id) === text(row.lead_id));
    const teamMembers: ProjectTeamMember[] = (teamByProject.get(dbId) ?? []).map((member) => {
      const memberName = text(member.name);
      const isDummy = DUMMY_ASSIGNABLE_NAMES.has(memberName.toLowerCase().trim());
      return {
        role: member.role,
        name: isDummy ? "" : memberName,
        allocationPercent: isDummy ? 0 : number(member.allocation_percent),
      };
    });
    const workItems: ProjectWorkItem[] = (workItemsByProject.get(dbId) ?? []).map((item) => ({
      id: text(item.external_id, text(item.id)),
      title: text(item.title),
      kind: item.kind,
      assignee: text(item.assignee_name),
      priority: item.priority,
      estimatedHours: number(item.estimated_hours),
      loggedHours: number(item.logged_hours),
      createdAt: text(item.created_at),
      status: item.status,
      timerStartedAt: item.timer_started_at || undefined,
      blockerReason: item.blocker_reason || undefined,
      proof: item.proof || undefined,
      reviewNotes: item.review_notes || undefined,
      revisionRequested: Boolean(item.revision_requested),
    }));
    const projectLinks = Object.fromEntries((linksByProject.get(dbId) ?? []).map((link) => [text(link.link_type), text(link.url)]));
    const leadExternalId = lead ? text(lead.external_id, text(lead.id)) : "";
    const proposalId = row.proposal_id || proposalIdByLeadAndVersion.get(`${text(row.lead_id)}|${number(row.proposal_version, 1)}`);
    const proposalVersion = proposalRows.find((proposal) => text(proposal.id) === text(proposalId))?.version;
    return {
      id: text(row.external_id, dbId),
      leadId: leadExternalId,
      createdAt: text(row.created_at),
      title: text(row.title),
      clientCompany: text(row.client_company),
      clientName: text(row.client_name),
      clientEmail: text(row.client_email),
      operatingCompany: row.operating_company || undefined,
      services: Array.isArray(row.services) ? row.services : [],
      classification: row.classification,
      startDate: text(row.start_date),
      billingStructure: row.billing_structure,
      contractedValue: number(row.contracted_value),
      currency: text(row.currency, "USD"),
      depositAmount: row.deposit_amount === null ? undefined : number(row.deposit_amount),
      depositStatus: row.deposit_status || undefined,
      invoice: rowToInvoice(invoiceByProject.get(dbId) || (lead ? invoiceByLead.get(text(lead.id)) : undefined)),
      proposalVersion: number(proposalVersion, 1),
      signedContractName: row.signed_contract_name || undefined,
      signedContractDataUrl: row.signed_contract_data_url || undefined,
      scopeIncluded: text(row.scope_included),
      scopeExcluded: text(row.scope_excluded),
      assumptions: text(row.assumptions),
      revisionRounds: number(row.revision_rounds),
      team: teamMembers,
      workItems,
      links: Object.keys(projectLinks).length ? projectLinks : undefined,
      status: row.status,
    };
  });

  const hydratedManagement: ManagedProject[] = managedRows.map((row) => ({
    id: text(row.external_id, text(row.id)),
    sourceProjectId: row.source_project_id ? projectIdByDbId.get(text(row.source_project_id)) : undefined,
    projectTitle: text(row.project_title),
    clientCompany: text(row.client_company),
    model: row.model,
    managementAmount: number(row.management_amount),
    currency: text(row.currency, "USD"),
    billingCycle: row.billing_cycle,
    periodStart: text(row.period_start),
    periodEnd: row.period_end || undefined,
    status: row.status,
    createdAt: text(row.created_at),
  }));

  const hydratedInvoices = invoiceRows.map((row) => ({
    id: text(row.invoice_number),
    invoiceNumber: text(row.invoice_number),
    leadId: row.lead_id ? leadIdByDbId.get(text(row.lead_id)) : undefined,
    projectId: row.project_id ? projectIdByDbId.get(text(row.project_id)) : undefined,
    operatingCompany: (row.operating_company as "Evecture" | "Servn") || "Evecture",
    billTo: text(row.bill_to),
    description: text(row.description),
    quantity: number(row.quantity, 1),
    unitPrice: number(row.unit_price),
    subtotal: number(row.subtotal),
    gstEnabled: Boolean(row.gst_enabled),
    gstRate: number(row.gst_rate),
    gstAmount: number(row.gst_amount),
    total: number(row.total),
    issueDate: text(row.issue_date, new Date().toISOString().slice(0, 10)),
    dueDate: text(row.due_date, new Date().toISOString().slice(0, 10)),
    contractValue: number(row.contract_value),
    depositPercent: number(row.deposit_percent),
    depositAmount: number(row.deposit_amount),
    currency: text(row.currency, "USD"),
    paymentTerms: text(row.payment_terms),
    paymentInstructions: text(row.payment_instructions),
    externalPaymentLink: row.external_payment_link || undefined,
    status: (row.status as "GENERATED" | "SENT" | "CONFIRMED_PAID") || "GENERATED",
    sentAt: row.sent_at || undefined,
    transactionReference: row.transaction_reference || undefined,
    confirmedPaidAt: row.confirmed_paid_at || undefined,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  }));

  const values: RelationalValues = { leads: hydratedLeads, projects: hydratedProjects, management: hydratedManagement, invoices: hydratedInvoices, postSaleOperations: [] };
  // Every relational collection is authoritative, including an empty one.
  // Do not fall back to the legacy workspace_records table or client state:
  // deleting the final row must make the collection empty in the app.
  return {
    values,
    remoteCollections: new Set<WorkspaceCollection>(collections),
    legacyCollections: new Set<WorkspaceCollection>(),
  };
}

async function persistLeads(client: SupabaseClient, leads: Lead[], userId: string) {
  const clientIds = await ensureClients(client, leads.map((lead) => ({ companyName: lead.companyName || lead.fullName, contactName: lead.fullName, email: lead.email, phone: lead.phone, website: lead.companyWebsite, country: lead.country, timezone: lead.timezone })));
  const payload = leads.map((lead) => ({
    external_id: lead.id,
    client_id: clientIds.get(clientKey(lead.companyName || lead.fullName, lead.email)) ?? null,
    created_by: userId,
    full_name: lead.fullName || "Unnamed lead",
    designation: nullable(lead.designation),
    company_name: nullable(lead.companyName),
    company_website: nullable(lead.companyWebsite),
    email: lead.email || "unknown@example.invalid",
    phone: nullable(lead.phone),
    country: nullable(lead.country),
    timezone: nullable(lead.timezone),
    services: lead.services ?? [],
    industry: nullable(lead.industry),
    description: nullable(lead.description),
    reference_links: nullable(lead.referenceLinks),
    budget_range: nullable(lead.budgetRange),
    budget_shared: Boolean(lead.budgetShared),
    budget_note: nullable(lead.budgetNote),
    urgency: lead.urgency || "Standard",
    source: nullable(lead.source),
    acquisition_source: nullable(lead.acquisitionSource),
    operating_company: nullable(lead.operatingCompany),
    status: lead.status || "NEW",
    first_contact_at: nullable(lead.firstContactAt),
    disqualification_reason: nullable(lead.disqualificationReason),
    qualification_note: nullable(lead.qualificationNote),
    qualification: lead.qualification ?? {},
    accepted_at: nullable(lead.acceptedAt),
    acceptance_name: nullable(lead.acceptanceName),
    acceptance_document_name: nullable(lead.acceptanceDocumentName),
    acceptance_document_data_url: nullable(lead.acceptanceDocumentDataUrl),
    created_at: lead.createdAt || new Date().toISOString(),
  }));
  const upserted = payload.length ? await client.from("leads").upsert(payload, { onConflict: "external_id" }).select("id,external_id") : { data: [], error: null };
  fail(upserted, "Saving leads");
  const leadIds = new Map(((upserted.data ?? []) as DbRow[]).map((row) => [text(row.external_id), text(row.id)]));
  const existing = await client.from("leads").select("id,external_id");
  fail(existing, "Loading existing leads");
  const currentIds = new Set(leads.map((lead) => lead.id));
  const staleIds = ((existing.data ?? []) as DbRow[]).filter((row) => row.external_id && !currentIds.has(text(row.external_id))).map((row) => text(row.id));
  if (staleIds.length) fail(await client.from("leads").delete().in("id", staleIds), "Removing deleted leads");

  for (const lead of leads) {
    const leadId = leadIds.get(lead.id);
    if (!leadId) continue;
    fail(await client.from("proposals").delete().eq("lead_id", leadId), "Refreshing proposals");
    for (const proposal of lead.proposals ?? []) {
      const created = await client.from("proposals").insert(proposalToRow(proposal, leadId)).select("id").single();
      fail(created, "Saving proposal");
      const proposalId = text((created.data as DbRow).id);
      if (proposal.followUps.length) {
        fail(await client.from("proposal_follow_ups").insert(proposal.followUps.map((followUp) => ({ proposal_id: proposalId, label: followUp.label, due_at: followUp.dueAt, logged_at: nullable(followUp.loggedAt) }))), "Saving proposal follow-ups");
      }
    }
    if (lead.invoice) fail(await client.from("invoices").upsert(leadInvoiceToRow(lead.invoice, { leadId }), { onConflict: "invoice_number" }), "Saving lead invoice");
  }
}

async function persistProjects(client: SupabaseClient, projects: Project[]) {
  const leads = await client.from("leads").select("id,external_id");
  fail(leads, "Loading leads for projects");
  const leadIds = new Map(((leads.data ?? []) as DbRow[]).map((row) => [text(row.external_id, text(row.id)), text(row.id)]));
  const proposals = await client.from("proposals").select("id,lead_id,version");
  fail(proposals, "Loading proposals for projects");
  const proposalIds = new Map(((proposals.data ?? []) as DbRow[]).map((row) => [`${text(row.lead_id)}|${number(row.version)}`, text(row.id)]));
  const clientIds = await ensureClients(client, projects.map((project) => ({ ...projectClientDetails(project) })));
  const payload = projects.map((project) => {
    const leadDbId = leadIds.get(project.leadId);
    return {
      external_id: project.id,
      lead_id: leadDbId ?? null,
      client_id: clientIds.get(clientKey(projectClientDetails(project).companyName, project.clientEmail)) ?? null,
      proposal_id: leadDbId ? proposalIds.get(`${leadDbId}|${number(project.proposalVersion, 1)}`) ?? null : null,
      title: project.title || "Untitled project",
      client_company: nullable(project.clientCompany),
      client_name: nullable(project.clientName),
      client_email: nullable(project.clientEmail),
      operating_company: nullable(project.operatingCompany),
      services: project.services ?? [],
      classification: project.classification,
      start_date: nullable(project.startDate),
      billing_structure: project.billingStructure,
      contracted_value: number(project.contractedValue),
      currency: project.currency || "USD",
      deposit_amount: project.depositAmount ?? null,
      deposit_status: project.depositStatus ?? null,
      scope_included: nullable(project.scopeIncluded),
      scope_excluded: nullable(project.scopeExcluded),
      assumptions: nullable(project.assumptions),
      revision_rounds: number(project.revisionRounds),
      status: project.status,
      signed_contract_name: nullable(project.signedContractName),
      signed_contract_data_url: nullable(project.signedContractDataUrl),
      created_at: project.createdAt || new Date().toISOString(),
    };
  });
  const upserted = payload.length ? await client.from("projects").upsert(payload, { onConflict: "external_id" }).select("id,external_id") : { data: [], error: null };
  fail(upserted, "Saving projects");
  const projectIds = new Map(((upserted.data ?? []) as DbRow[]).map((row) => [text(row.external_id), text(row.id)]));
  const existing = await client.from("projects").select("id,external_id");
  fail(existing, "Loading existing projects");
  const currentIds = new Set(projects.map((project) => project.id));
  const staleIds = ((existing.data ?? []) as DbRow[]).filter((row) => row.external_id && !currentIds.has(text(row.external_id))).map((row) => text(row.id));
  if (staleIds.length) fail(await client.from("projects").delete().in("id", staleIds), "Removing deleted projects");

  for (const project of projects) {
    const projectId = projectIds.get(project.id);
    if (!projectId) continue;
    fail(await client.from("project_team_members").delete().eq("project_id", projectId), "Refreshing project team");
    fail(await client.from("project_work_items").delete().eq("project_id", projectId), "Refreshing project work items");
    fail(await client.from("project_links").delete().eq("project_id", projectId), "Refreshing project links");
    if (project.team.length) fail(await client.from("project_team_members").insert(project.team.map((member) => ({ project_id: projectId, role: member.role, name: nullable(member.name), allocation_percent: number(member.allocationPercent) }))), "Saving project team");
    if (project.workItems?.length) fail(await client.from("project_work_items").insert(project.workItems.map((item) => ({ project_id: projectId, external_id: item.id, title: item.title, kind: item.kind, assignee_name: nullable(item.assignee), priority: item.priority, estimated_hours: number(item.estimatedHours), logged_hours: number(item.loggedHours), status: item.status, blocker_reason: nullable(item.blockerReason), proof: item.proof ?? {}, review_notes: nullable(item.reviewNotes), revision_requested: Boolean(item.revisionRequested), timer_started_at: nullable(item.timerStartedAt), created_at: item.createdAt || new Date().toISOString() }))), "Saving project work items");
    const links = Object.entries(project.links ?? {}).filter(([, url]) => url).map(([linkType, url]) => ({ project_id: projectId, link_type: linkType, url }));
    if (links.length) fail(await client.from("project_links").insert(links), "Saving project links");
    if (project.invoice) fail(await client.from("invoices").upsert(leadInvoiceToRow(project.invoice, { leadId: leadIds.get(project.leadId) ?? null, projectId }), { onConflict: "invoice_number" }), "Saving project invoice");
  }
}

async function persistManagement(client: SupabaseClient, items: ManagedProject[]) {
  const projects = await client.from("projects").select("id,external_id");
  fail(projects, "Loading projects for managed plans");
  const projectIds = new Map(((projects.data ?? []) as DbRow[]).map((row) => [text(row.external_id, text(row.id)), text(row.id)]));
  const payload = items.map((item) => ({
    external_id: item.id,
    source_project_id: item.sourceProjectId ? projectIds.get(item.sourceProjectId) ?? null : null,
    project_title: item.projectTitle || "Untitled managed project",
    client_company: nullable(item.clientCompany),
    model: item.model,
    management_amount: number(item.managementAmount),
    currency: item.currency || "USD",
    billing_cycle: item.billingCycle,
    period_start: item.periodStart || new Date().toISOString().slice(0, 10),
    period_end: nullable(item.periodEnd),
    status: item.status,
    created_at: item.createdAt || new Date().toISOString(),
  }));
  const upserted = payload.length ? await client.from("managed_projects").upsert(payload, { onConflict: "external_id" }) : { data: [], error: null };
  fail(upserted, "Saving managed projects");
  const existing = await client.from("managed_projects").select("id,external_id");
  fail(existing, "Loading existing managed projects");
  const currentIds = new Set(items.map((item) => item.id));
  const staleIds = ((existing.data ?? []) as DbRow[]).filter((row) => row.external_id && !currentIds.has(text(row.external_id))).map((row) => text(row.id));
  if (staleIds.length) fail(await client.from("managed_projects").delete().in("id", staleIds), "Removing deleted managed projects");
}

async function persistInvoices(client: SupabaseClient, invoices: StoredInvoice[]) {
  const leads = await client.from("leads").select("id,external_id");
  fail(leads, "Loading leads for invoices");
  const leadIds = new Map(((leads.data ?? []) as DbRow[]).map((row) => [text(row.external_id, text(row.id)), text(row.id)]));
  const projects = await client.from("projects").select("id,external_id");
  fail(projects, "Loading projects for invoices");
  const projectIds = new Map(((projects.data ?? []) as DbRow[]).map((row) => [text(row.external_id, text(row.id)), text(row.id)]));

  for (const invoice of invoices) {
    const leadDbId = invoice.leadId ? leadIds.get(invoice.leadId) ?? null : null;
    const projectDbId = invoice.projectId ? projectIds.get(invoice.projectId) ?? null : null;
    const row = leadInvoiceToRow(invoice, { leadId: leadDbId, projectId: projectDbId });
    fail(await client.from("invoices").upsert(row, { onConflict: "invoice_number" }), "Saving invoice");
  }
}

export async function persistRelationalCollection(client: SupabaseClient, collection: WorkspaceCollection, data: unknown, userId: string) {
  if (collection === "leads") return persistLeads(client, Array.isArray(data) ? data as Lead[] : [], userId);
  if (collection === "projects") return persistProjects(client, Array.isArray(data) ? data as Project[] : []);
  if (collection === "management") return persistManagement(client, Array.isArray(data) ? data as ManagedProject[] : []);
  if (collection === "invoices") return persistInvoices(client, Array.isArray(data) ? data as StoredInvoice[] : []);
}
