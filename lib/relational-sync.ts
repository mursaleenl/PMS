import { createUuid } from "@/lib/uuid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeLeadStatus, type Lead, type LeadInvoice, type ProposalVersion } from "@/lib/leads";
import type { ManagedProject } from "@/lib/post-sale";
import { resolveProjectName, type Project, type ProjectTeamMember, type ProjectWorkItem } from "@/lib/projects";
import type { StoredInvoice } from "@/lib/invoices";
import { type WorkspaceCollection } from "@/lib/workspace-sync";
import { DUMMY_ASSIGNABLE_NAMES } from "@/lib/assignee-names";

type DbRow = Record<string, any>;
type RelationalValues = Record<WorkspaceCollection, unknown>;
type RelationalSnapshot = {
  values: RelationalValues;
  remoteCollections: Set<WorkspaceCollection>;
  legacyCollections: Set<WorkspaceCollection>;
  revisions: Record<string, number>;
  requiresMigration: boolean;
};

const collections: WorkspaceCollection[] = ["leads", "projects", "management", "invoices", "generalTasks"];

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
    response_name: nullable(proposal.responseName),
    response_note: nullable(proposal.changeRequest),
    attachment_path: null,
    document_name: nullable(proposal.documentName),
    document_data_url: nullable(proposal.documentDataUrl),
    created_at: proposal.createdAt || new Date().toISOString(),
  };
}

export function rowToProposal(row: DbRow, followUps: DbRow[]): ProposalVersion {
  return {
    changeRequest: row.response_note || undefined,
    responseName: row.response_name || undefined,
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

export async function readRelationalWorkspace(client: SupabaseClient): Promise<RelationalSnapshot> {
  async function readTable(table: string) {
    const data: DbRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from(table).select("*").order("id").range(offset, offset + 499);
      fail(result, `Loading ${table}`);
      data.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 500) return {data};
    }
  }
  const [leads, proposals, followUps, invoices, projects, team, workItems, links, managed, general] = await Promise.all(
    ["leads", "proposals", "proposal_follow_ups", "invoices", "projects", "project_team_members", "project_work_items", "project_links", "managed_projects", "general_tasks"].map(readTable)
  );
  const schemaCheck = await client.from("leads").select("revision").limit(1);
  const schemaVersion = await client.rpc("workspace_schema_version");
  if (schemaCheck.error && !["42703","PGRST204"].includes(schemaCheck.error.code)) fail(schemaCheck,"Checking workspace schema");
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
    if (!row.is_deposit) continue;
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
      projectName: text(row.project_name),
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
      status: normalizeLeadStatus(row.status),
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
        userId: member.user_id || undefined,
        allocationPercent: isDummy ? 0 : number(member.allocation_percent),
      };
    });
    const workItems: ProjectWorkItem[] = (workItemsByProject.get(dbId) ?? []).map((item) => ({
      id: text(item.external_id, text(item.id)),
      title: text(item.title),
      description: text(item.description) || undefined,
      deadline: text(item.deadline) || undefined,
      kind: item.kind,
      assignee: text(item.assignee_name),
      assigneeId: item.assignee_user_id || undefined,
      assignees: Array.isArray(item.assignees) ? item.assignees : [],
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
      objectives: text(row.objectives), deliverables: text(row.deliverables), targetDate: text(row.target_date), priority: row.priority || "Normal",
      logoDataUrl: row.logo_data_url || undefined,
      projectType: row.project_type === "internal" ? "internal" : "client",
      leadId: leadExternalId || text(row.lead_id),
      createdAt: text(row.created_at),
      title: resolveProjectName({title:text(row.title),clientCompany:text(row.client_company),clientName:text(row.client_name),enquiryDetails:row.enquiry_details},text(lead?.project_name)),
      clientCompany: text(row.client_company),
      clientName: text(row.client_name),
      clientEmail: text(row.client_email),
      additionalClients: Array.isArray(row.additional_clients) ? row.additional_clients : [],
      enquiryDetails: {...(lead ? {description:text(lead.description),industry:text(lead.industry),urgency:lead.urgency,country:text(lead.country)} : {}),...(row.enquiry_details && typeof row.enquiry_details === "object" && !Array.isArray(row.enquiry_details) ? row.enquiry_details : {})},
      operatingCompany: row.operating_company || undefined,
      services: Array.isArray(row.services) ? row.services : [],
      classification: row.classification,
      startDate: text(row.start_date),
      billingStructure: row.billing_structure,
      contractedValue: number(row.contracted_value),
      currency: text(row.currency, "USD"),
      depositAmount: invoiceRows.filter(invoice => invoice.is_deposit && (invoice.project_id === dbId || (row.lead_id && invoice.lead_id === row.lead_id))).reduce((sum,invoice) => sum + number(invoice.total),0),
      depositStatus: (() => { const deposits = invoiceRows.filter(invoice => invoice.is_deposit && (invoice.project_id === dbId || (row.lead_id && invoice.lead_id === row.lead_id))); return deposits.length && deposits.every(invoice => invoice.status === "CONFIRMED_PAID") ? "CONFIRMED_PAID" as const : undefined; })(),
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
    clientDetails: row.client_details && typeof row.client_details === "object" && !Array.isArray(row.client_details) ? row.client_details : undefined,
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
    clientName: row.client_name || undefined,
    clientEmail: row.client_email || undefined,
    isDeposit: Boolean(row.is_deposit),
    description: text(row.description),
    quantity: number(row.quantity, 1),
    unitPrice: number(row.unit_price),
    subtotal: number(row.subtotal),
    gstEnabled: Boolean(row.gst_enabled),
    gstRate: number(row.gst_rate),
    gstAmount: number(row.gst_amount),
    total: number(row.total),
    issueDate: text(row.issue_date, new Date().toISOString().slice(0, 10)),
    dueDate: text(row.due_date),
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

  const values: RelationalValues = { leads: hydratedLeads, projects: hydratedProjects, management: hydratedManagement, invoices: hydratedInvoices, postSaleOperations: [], generalTasks: general.data.map(row=>({...row.task,id:row.external_id})) };
  // Every relational collection is authoritative, including an empty one.
  // Do not fall back to the legacy workspace_records table or client state:
  // deleting the final row must make the collection empty in the app.
  return {
    values,
    remoteCollections: new Set<WorkspaceCollection>(collections),
    legacyCollections: new Set<WorkspaceCollection>(),
    requiresMigration: Boolean(schemaCheck.error) || schemaVersion.data !== 1 || [...leadRows,...projectRows,...managedRows,...invoiceRows].some(row => row.revision === undefined),
    revisions: Object.fromEntries(([ ["leads",leadRows], ["projects",projectRows], ["management",managedRows], ["invoices",invoiceRows], ["generalTasks",general.data] ] as [WorkspaceCollection, DbRow[]][]).flatMap(([collection,rows]) => rows.map(row => {
      return [`${collection}:${collection === "invoices" ? row.invoice_number : row.external_id || row.id}`, number(row.revision)];
    }))),
  };
}

export type WorkspaceChange = {
  collection: WorkspaceCollection;
  id: string;
  expectedRevision: number | null;
  operation: "save" | "delete";
  data?: Record<string, unknown>;
};

export function serializeRecord(collection: WorkspaceCollection, value: unknown): Record<string, unknown> {
  if (collection === "generalTasks") { const task=value as ProjectWorkItem;return {row:{external_id:task.id,task,created_at:task.createdAt}}; }
  if (collection === "leads") {
    const lead = value as Lead;
    return { row: {
    external_id: lead.id,
    full_name: lead.fullName?.trim() || "",
    project_name: nullable(lead.projectName),
    designation: nullable(lead.designation),
    company_name: nullable(lead.companyName),
    company_website: nullable(lead.companyWebsite),
    email: lead.email?.trim() || "",
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
    status: normalizeLeadStatus(lead.status),
    disqualification_reason: nullable(lead.disqualificationReason),
    qualification_note: nullable(lead.qualificationNote),
    qualification: lead.qualification ?? {},
    accepted_at: nullable(lead.acceptedAt),
    acceptance_name: nullable(lead.acceptanceName),
    acceptance_document_name: nullable(lead.acceptanceDocumentName),
    acceptance_document_data_url: nullable(lead.acceptanceDocumentDataUrl),
    created_at: lead.createdAt || new Date().toISOString(),
    }, proposals: (lead.proposals ?? []).map(proposal => ({
      row: proposalToRow(proposal, ""),
      followUps: proposal.followUps.map(item => ({ label: item.label, due_at: item.dueAt, logged_at: nullable(item.loggedAt) })),
    })) };
  }
  if (collection === "projects") {
    const project = value as Project;
    return { row: {
      external_id: project.id,
      title: project.title || "Untitled project",
      logo_data_url: nullable(project.logoDataUrl),
      project_type: project.projectType || "client",
      objectives: nullable(project.objectives), deliverables: nullable(project.deliverables), target_date: nullable(project.targetDate), priority: project.priority || "Normal",
      client_company: nullable(project.clientCompany),
      client_name: nullable(project.clientName),
      client_email: nullable(project.clientEmail),
      additional_clients: project.additionalClients ?? [],
      enquiry_details: project.enquiryDetails ?? {},
      operating_company: nullable(project.operatingCompany),
      services: project.services ?? [],
      classification: project.classification,
      start_date: nullable(project.startDate),
      billing_structure: project.billingStructure,
      contracted_value: number(project.contractedValue),
      currency: project.currency || "USD",
      scope_included: nullable(project.scopeIncluded),
      scope_excluded: nullable(project.scopeExcluded),
      assumptions: nullable(project.assumptions),
      revision_rounds: number(project.revisionRounds),
      status: project.status,
      signed_contract_name: nullable(project.signedContractName),
      signed_contract_data_url: nullable(project.signedContractDataUrl),
      created_at: project.createdAt || new Date().toISOString(),
    }, leadId: project.leadId || null, proposalVersion: project.proposalVersion,
      team: project.team.map(member => ({ role: member.role, name: nullable(member.name), user_id: nullable(member.userId), allocation_percent: number(member.allocationPercent) })),
      workItems: (project.workItems ?? []).map(item => ({ external_id: item.id, title: item.title, description: nullable(item.description), deadline: nullable(item.deadline), kind: item.kind, assignee_name: nullable(item.assignee), assignee_user_id: nullable(item.assigneeId), assignees: item.assignees ?? [], priority: item.priority, estimated_hours: number(item.estimatedHours), logged_hours: number(item.loggedHours), status: item.status, blocker_reason: nullable(item.blockerReason), proof: item.proof ?? {}, review_notes: nullable(item.reviewNotes), revision_requested: Boolean(item.revisionRequested), timer_started_at: nullable(item.timerStartedAt), created_at: item.createdAt })),
      links: Object.entries(project.links ?? {}).filter(([,url]) => url).map(([link_type,url]) => ({ link_type, url })),
    };
  }
  if (collection === "management") {
    const item = value as ManagedProject;
    return { row: {
    external_id: item.id,
    project_title: item.projectTitle || "Untitled managed project",
    client_company: nullable(item.clientCompany),
    ...(item.clientDetails ? {client_details:item.clientDetails} : {}),
    model: item.model,
    management_amount: number(item.managementAmount),
    currency: item.currency || "USD",
    billing_cycle: item.billingCycle,
    period_start: item.periodStart || new Date().toISOString().slice(0, 10),
    period_end: nullable(item.periodEnd),
    status: item.status,
    created_at: item.createdAt || new Date().toISOString(),
    }, sourceProjectId: item.sourceProjectId || null };
  }
  if (collection === "invoices") {
    const invoice = value as StoredInvoice;
    return { row: { ...leadInvoiceToRow(invoice, {}), client_name: invoice.clientName || null, client_email: invoice.clientEmail || null, is_deposit: Boolean(invoice.isDeposit) }, leadId: invoice.leadId || null, projectId: invoice.projectId || null };
  }
  throw new Error("Unsupported workspace collection");
}

// Only explicit differences from the last acknowledged snapshot are written.
export function workspaceChanges(before: Partial<RelationalValues>, after: Partial<RelationalValues>, revisions: Record<string, number>): WorkspaceChange[] {
  return collections.flatMap(collection => {
    const previous = new Map(((before[collection] ?? []) as {id:string}[]).map(row => [row.id,row]));
    const current = new Map(((after[collection] ?? []) as {id:string}[]).map(row => [row.id,row]));
    const changes: WorkspaceChange[] = [];
    for (const [id,row] of current) {
      const data = serializeRecord(collection,row);
      if (!previous.has(id) || JSON.stringify(data) !== JSON.stringify(serializeRecord(collection,previous.get(id)))) {
        changes.push({ collection, id, expectedRevision: revisions[`${collection}:${id}`] ?? null, operation: "save", data });
      }
    }
    for (const id of previous.keys()) if (!current.has(id)) changes.push({ collection, id, expectedRevision: revisions[`${collection}:${id}`] ?? null, operation: "delete" });
    return changes;
  });
}

export async function persistWorkspaceChanges(client: SupabaseClient, changes: WorkspaceChange[], requestId = createUuid()): Promise<Record<string, number>> {
  if (!changes.length) return {};
  const result = await client.rpc("save_workspace_changes", { p_changes: changes, p_request_id:requestId });
  fail(result, "Saving workspace");
  return result.data as Record<string, number>;
}
