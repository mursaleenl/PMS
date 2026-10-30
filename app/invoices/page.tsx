"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, Building2, Check, CheckCircle2, ExternalLink, FileText, FolderKanban, Plus, Printer, Receipt, Search, Send, Trash2, X } from "lucide-react";
import type { OperatingCompany } from "@/lib/companies";
import { readProjects, updateProject, type Project } from "@/lib/projects";
import { deleteInvoice, nextInvoiceNumber as getNextInvoiceNumber, readInvoices, saveInvoice, updateInvoice, type InvoiceStatus, type StoredInvoice } from "@/lib/invoices";
import { StatusBadge } from "@/app/_components/status-badge";
import { showToast } from "@/app/_components/toast-hub";
import { isValidDateValue } from "@/lib/dates";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { convertCurrency, formatMoney, getExchangeRates, refreshExchangeRates } from "@/lib/currency";
import { CalendarPicker } from "@/app/_components/calendar-picker";

const SAMPLE_PAYMENT_TERMS = "Payment due within 7 days of invoice date.";
const SAMPLE_CONTACT = "billing@vrkspace.example · +91 00000 00000";

const money = formatMoney;


function today() {
  return new Date().toISOString().slice(0, 10);
}

function inSevenDays() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

const statusLabels: Record<InvoiceStatus, string> = {
  GENERATED: "Draft",
  SENT: "Sent",
  CONFIRMED_PAID: "Paid",
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | InvoiceStatus>("ALL");
  const [companyFilter, setCompanyFilter] = useState<"ALL" | OperatingCompany>("ALL");
  const [createMode, setCreateMode] = useState<"project" | "custom">("project");
  const [customProjectId, setCustomProjectId] = useState("");
  const [customCompany, setCustomCompany] = useState<OperatingCompany>("Evecture");
  const [customCurrency, setCustomCurrency] = useState("USD");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState<number>(18);
  const [projectAmount, setProjectAmount] = useState<number | string>("");
  const [customAmount, setCustomAmount] = useState<number | string>("");
  const [assigningCompany, setAssigningCompany] = useState<OperatingCompany>("Evecture");
  const [error, setError] = useState("");
  const [saving,setSaving] = useState(false);
  const creating = useRef(false);
  const pendingInvoice = useRef<StoredInvoice | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  const refreshAll = () => {
    setInvoices(readInvoices());
    setProjects(readProjects());
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowGenerateModal(false);
        setSelectedInvoiceNumber(null);
      }
    }
    if (showGenerateModal || selectedInvoiceNumber) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [showGenerateModal, selectedInvoiceNumber]);

  useEffect(() => {
    refreshAll();
    const params = new URLSearchParams(window.location.search);
    const queryInv = params.get("invoice");
    const queryLead = params.get("lead");
    const queryProject = params.get("project");

    if (queryInv) {
      setSelectedInvoiceNumber(queryInv);
    } else if (queryProject) {
      setSelectedProjectId(queryProject);
      setCreateMode("project");
      const allInvs = readInvoices();
      const match = allInvs.find((inv) => inv.projectId === queryProject);
      if (match) {
        setSelectedInvoiceNumber(match.invoiceNumber);
      } else {
        setShowGenerateModal(true);
      }
    } else if (queryLead) {
      const allProjects = readProjects();
      const projectMatch = allProjects.find((p) => p.leadId === queryLead);
      if (projectMatch) {
        setSelectedProjectId(projectMatch.id);
        setCreateMode("project");
        if (projectMatch.invoice) {
          setSelectedInvoiceNumber(projectMatch.invoice.invoiceNumber);
        } else {
          setShowGenerateModal(true);
        }
      } else {
        const allInvs = readInvoices();
        const match = allInvs.find((inv) => inv.leadId === queryLead);
        if (match) {
          setSelectedInvoiceNumber(match.invoiceNumber);
        }
      }
    }

    window.addEventListener("evecture:invoices-updated", refreshAll);
    window.addEventListener("evecture:projects-updated", refreshAll);
    window.addEventListener("storage", refreshAll);

    return () => {
      window.removeEventListener("evecture:invoices-updated", refreshAll);
      window.removeEventListener("evecture:projects-updated", refreshAll);
      window.removeEventListener("storage", refreshAll);
    };
  }, []);

  const activeProject = projects.find((item) => item.id === selectedProjectId) ?? null;

  // Sync project parameters when active project changes
  useEffect(() => {
    if (activeProject) {
      setProjectAmount(activeProject.contractedValue || "");
      if (activeProject.operatingCompany) {
        setAssigningCompany(activeProject.operatingCompany);
      }
    }
  }, [activeProject]);

  // Auto-select first project when project mode is active
  useEffect(() => {
    if (showGenerateModal && createMode === "project" && projects.length > 0) {
      if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [showGenerateModal, createMode, projects, selectedProjectId]);

  // Calculation helpers for modal
  const parsedProjectAmount = Number(projectAmount) || (activeProject?.contractedValue ?? 0);
  const projectGstAmount = gstEnabled ? (parsedProjectAmount * gstRate) / 100 : 0;
  const projectTotal = parsedProjectAmount + projectGstAmount;

  const parsedCustomAmount = Number(customAmount) || 0;
  const customGstAmount = gstEnabled ? (parsedCustomAmount * gstRate) / 100 : 0;
  const customTotal = parsedCustomAmount + customGstAmount;

  // Selected invoice for preview modal
  const activeInvoice = useMemo(() => {
    if (!selectedInvoiceNumber) return null;
    return invoices.find((inv) => inv.invoiceNumber === selectedInvoiceNumber) ?? null;
  }, [invoices, selectedInvoiceNumber]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const matchStatus = statusFilter === "ALL" || inv.status === statusFilter;
      const matchCompany = companyFilter === "ALL" || inv.operatingCompany === companyFilter;
      const matchQuery =
        !query ||
        [inv.invoiceNumber, inv.billTo, inv.clientName, inv.clientEmail, inv.description, inv.operatingCompany]
          .filter(Boolean)
          .some((val) => val!.toLowerCase().includes(query));
      return matchStatus && matchCompany && matchQuery;
    });
  }, [invoices, search, statusFilter, companyFilter]);

  // Live exchange rates to convert all invoice amounts into USD
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(() => getExchangeRates());

  useEffect(() => {
    refreshExchangeRates().then((rates) => {
      setExchangeRates(rates);
    });
    const onRatesUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<Record<string, number>>;
      if (customEvent.detail) setExchangeRates(customEvent.detail);
    };
    window.addEventListener("evecture:exchange-rates-updated", onRatesUpdated);
    return () => window.removeEventListener("evecture:exchange-rates-updated", onRatesUpdated);
  }, []);

  // Statistics: always convert all currencies (INR, EUR, etc.) automatically into USD (dollars)
  const paidInvoices = useMemo(() => invoices.filter((inv) => inv.status === "CONFIRMED_PAID"), [invoices]);
  const sentInvoices = useMemo(() => invoices.filter((inv) => inv.status === "SENT"), [invoices]);
  const draftInvoices = useMemo(() => invoices.filter((inv) => inv.status === "GENERATED"), [invoices]);

  const sumInUsd = useCallback((list: StoredInvoice[]) => {
    return list.reduce((acc, inv) => {
      const amt = inv.total ?? inv.depositAmount ?? 0;
      const cur = inv.currency || "USD";
      return acc + convertCurrency(amt, cur, "USD", exchangeRates);
    }, 0);
  }, [exchangeRates]);

  const totalAmount = useMemo(() => sumInUsd(invoices), [invoices, sumInUsd]);
  const paidAmount = useMemo(() => sumInUsd(paidInvoices), [paidInvoices, sumInUsd]);
  const sentAmount = useMemo(() => sumInUsd(sentInvoices), [sentInvoices, sumInUsd]);
  const draftAmount = useMemo(() => sumInUsd(draftInvoices), [draftInvoices, sumInUsd]);

  async function handleCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating.current) return;
    if (pendingInvoice.current && readInvoices().some(item => item.invoiceNumber === pendingInvoice.current?.invoiceNumber)) {
      creating.current = true; setSaving(true);
      try {
        await flushWorkspaceChanges();
        setSelectedInvoiceNumber(pendingInvoice.current.invoiceNumber); pendingInvoice.current = null;
        setShowGenerateModal(false); setError(""); refreshAll();
      } catch(cause) { setError(cause instanceof Error ? cause.message : "Invoice could not be saved."); }
      finally { creating.current = false; setSaving(false); }
      return;
    }
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get("amount"));
    const isGst = data.get("gstEnabled") === "on";
    const parsedRate = isGst ? Number(data.get("gstRate") || gstRate) : 0;
    const issueDate = String(data.get("issueDate") || today());
    const dueDate = String(data.get("dueDate") || inSevenDays());
    const description = String(data.get("description") || "").trim();

    if (!Number.isFinite(amount) || amount <= 0 || !issueDate || !dueDate || !description) {
      setError("Please provide a valid description, amount, issue date, and due date.");
      return;
    }

    if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 100 || !isValidDateValue(issueDate) || !isValidDateValue(dueDate) || dueDate < issueDate) {
      setError("Enter valid dates, a due date on or after the issue date, and tax from 0 to 100."); return;
    }
    const gstAmount = isGst ? Math.round(amount * parsedRate) / 100 : 0;
    const total = Math.round((amount + gstAmount)*100)/100;
    creating.current = true; setSaving(true);
    try {

    if (createMode === "project") {
      if (!activeProject) {
        setError("Please select a project workspace.");
        return;
      }
      const company = (activeProject.operatingCompany || assigningCompany) as OperatingCompany;
      if (!activeProject.operatingCompany) {
        updateProject(activeProject.id, { operatingCompany: company });
      }

      const invNumber = await getNextInvoiceNumber(company);

      const newInvoice: StoredInvoice = {
        id: invNumber,
        invoiceNumber: invNumber,
        projectId: activeProject.id,
        leadId: activeProject.leadId || undefined,
        operatingCompany: company,
        billTo: activeProject.clientCompany || activeProject.clientName || "Client",
        clientName: activeProject.clientName || activeProject.clientCompany,
        clientEmail: activeProject.clientEmail || undefined,
        description,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount,
        gstEnabled: isGst,
        gstRate: parsedRate,
        gstAmount,
        total,
        issueDate,
        dueDate,
        contractValue: activeProject.contractedValue,
        isDeposit: data.get("isDeposit") === "on",
        depositPercent: data.get("isDeposit") === "on" ? 100 : 0,
        depositAmount: total,
        currency: activeProject.currency || "USD",
        paymentTerms: SAMPLE_PAYMENT_TERMS,
        paymentInstructions: `Sample account: ${company} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`,
        status: "GENERATED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      pendingInvoice.current = newInvoice;
      saveInvoice(newInvoice);
      await flushWorkspaceChanges();
      pendingInvoice.current = null;
      refreshAll();
      setShowGenerateModal(false);
      setSelectedInvoiceNumber(invNumber);
      setError("");
      showToast({ message: `Invoice ${invNumber} generated for ${activeProject.title}` });
    } else {
      // Direct custom invoice
      const customProject = customProjectId ? projects.find((p) => p.id === customProjectId) : undefined;
      const company = customCompany;
      const billTo = String(data.get("billTo") || "").trim();
      const clientName = String(data.get("clientName") || "").trim();
      const clientEmail = String(data.get("clientEmail") || "").trim();
      const currency = String(data.get("currency") || customCurrency || "USD").trim().toUpperCase();

      if (!billTo) {
        setError("Please enter a client / company name to bill.");
        return;
      }

      const invNumber = await getNextInvoiceNumber(company);

      const newInvoice: StoredInvoice = {
        id: invNumber,
        invoiceNumber: invNumber,
        projectId: customProject?.id,
        leadId: customProject?.leadId,
        operatingCompany: company,
        billTo,
        clientName: clientName || billTo,
        clientEmail: clientEmail || undefined,
        description,
        quantity: 1,
        unitPrice: amount,
        subtotal: amount,
        gstEnabled: isGst,
        gstRate: parsedRate,
        gstAmount,
        total,
        issueDate,
        dueDate,
        contractValue: amount,
        isDeposit: data.get("isDeposit") === "on",
        depositPercent: data.get("isDeposit") === "on" ? 100 : 0,
        depositAmount: total,
        currency,
        paymentTerms: String(data.get("paymentTerms") || SAMPLE_PAYMENT_TERMS),
        paymentInstructions: String(
          data.get("paymentInstructions") ||
            `Sample account: ${company} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`
        ),
        status: "GENERATED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      pendingInvoice.current = newInvoice;
      saveInvoice(newInvoice);
      await flushWorkspaceChanges();
      pendingInvoice.current = null;
      refreshAll();
      setShowGenerateModal(false);
      setSelectedInvoiceNumber(invNumber);
      setError("");
      showToast({ message: `Invoice ${invNumber} generated and saved to database` });
    }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invoice could not be saved."); }
    finally { creating.current = false; setSaving(false); }
  }

  async function handleMarkSent(inv: StoredInvoice) {
    const sentAt = new Date().toISOString();
    updateInvoice(inv.invoiceNumber, { status: "SENT", sentAt });
    try { await flushWorkspaceChanges(); } catch(cause) { showToast({message:cause instanceof Error ? cause.message : "Invoice could not be saved"}); return; }
    refreshAll();
    showToast({ message: `Invoice ${inv.invoiceNumber} marked as sent` });
  }

  async function handleConfirmPaid(inv: StoredInvoice) {
    const ref = window.prompt("Enter bank / external payment transaction reference:", inv.transactionReference || "");
    if (!ref?.trim()) return;
    const confirmedPaidAt = new Date().toISOString();
    updateInvoice(inv.invoiceNumber, {
      status: "CONFIRMED_PAID",
      transactionReference: ref.trim() || undefined,
      confirmedPaidAt,
    });
    try { await flushWorkspaceChanges(); } catch(cause) { showToast({message:cause instanceof Error ? cause.message : "Invoice could not be saved"}); return; }
    refreshAll();
    showToast({ message: `Invoice ${inv.invoiceNumber} confirmed paid` });
  }

  async function handleDelete(inv: StoredInvoice) {
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber}? This will remove it from the system and database.`)) return;
    deleteInvoice(inv.invoiceNumber);
    if (selectedInvoiceNumber === inv.invoiceNumber) {
      setSelectedInvoiceNumber(null);
    }
    try { await flushWorkspaceChanges(); } catch(cause) { showToast({message:cause instanceof Error ? cause.message : "Invoice could not be saved"}); return; }
    refreshAll();
    showToast({ message: `Invoice ${inv.invoiceNumber} deleted` });
  }

  const isServnInvoice = activeInvoice?.operatingCompany === "Servn";
  const invoiceLegalName = isServnInvoice ? "Servn Pvt Limited" : "Evecture Pvt Limited";
  const invoiceAmount = activeInvoice?.subtotal ?? activeInvoice?.contractValue ?? 0;
  const invoiceGst = activeInvoice?.gstEnabled ? activeInvoice.gstAmount ?? 0 : 0;
  const invoiceTotal = activeInvoice ? activeInvoice.total ?? activeInvoice.depositAmount : 0;

  return (
    <div className="page-content invoice-module-page">
      <section className="welcome-row">
        <div>
          <h1>Invoices</h1>
          <p className="welcome-subtitle">Create invoices, track payments, and keep client billing in one place.</p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setError("");
            setShowGenerateModal(true);
          }}
        >
          <Receipt size={16} />
          Generate invoice
        </button>
      </section>

      {/* Summary KPI Cards (Converted to USD) */}
      <section className="invoice-stats-grid" aria-label="Invoice statistics">
        <button
          type="button"
          className={`invoice-stat-card ${statusFilter === "ALL" ? "selected" : ""}`}
          onClick={() => setStatusFilter("ALL")}
        >
          <div className="invoice-stat-copy">
            <small>Total invoiced</small>
            <strong>{formatMoney(totalAmount, "USD")}</strong>
          </div>
          <span className="invoice-stat-note">{invoices.length} {invoices.length === 1 ? "invoice" : "invoices"} generated</span>
        </button>

        <button
          type="button"
          className={`invoice-stat-card ${statusFilter === "CONFIRMED_PAID" ? "selected" : ""}`}
          onClick={() => setStatusFilter("CONFIRMED_PAID")}
        >
          <div className="invoice-stat-copy">
            <small>Confirmed paid</small>
            <strong>{formatMoney(paidAmount, "USD")}</strong>
          </div>
          <span className="invoice-stat-note">{paidInvoices.length} paid {paidInvoices.length === 1 ? "invoice" : "invoices"}</span>
        </button>

        <button
          type="button"
          className={`invoice-stat-card ${statusFilter === "SENT" ? "selected" : ""}`}
          onClick={() => setStatusFilter("SENT")}
        >
          <div className="invoice-stat-copy">
            <small>Awaiting payment</small>
            <strong>{formatMoney(sentAmount, "USD")}</strong>
          </div>
          <span className="invoice-stat-note">{sentInvoices.length} sent to clients</span>
        </button>

        <button
          type="button"
          className={`invoice-stat-card ${statusFilter === "GENERATED" ? "selected" : ""}`}
          onClick={() => setStatusFilter("GENERATED")}
        >
          <div className="invoice-stat-copy">
            <small>Draft invoices</small>
            <strong>{formatMoney(draftAmount, "USD")}</strong>
          </div>
          <span className="invoice-stat-note">{draftInvoices.length} not yet logged sent</span>
        </button>
      </section>

      {/* Generated invoices directory */}
      <section className="invoice-directory-panel">
        <div className="invoice-table-heading">
          <div>
            <h2>Generated invoices</h2>
            <p>
              {filteredInvoices.length} {filteredInvoices.length === 1 ? "invoice" : "invoices"} shown · {invoices.length} stored in database
            </p>
          </div>
          <div className="invoice-table-tools">
            <label className="invoice-table-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search invoices, clients, numbers…"
              />
            </label>

            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value as "ALL" | OperatingCompany)}
              className="button button-quiet"
              style={{ height: 38 }}
              aria-label="Filter by operating company"
            >
              <option value="ALL">All companies</option>
              <option value="Evecture">Evecture</option>
              <option value="Servn">Servn</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ALL" | InvoiceStatus)}
              className="button button-quiet"
              style={{ height: 38 }}
              aria-label="Filter by status"
            >
              <option value="ALL">All statuses</option>
              <option value="GENERATED">Draft (Generated)</option>
              <option value="SENT">Sent</option>
              <option value="CONFIRMED_PAID">Paid</option>
            </select>
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="invoice-empty-state" style={{ padding: "48px 24px", textAlign: "center", justifyItems: "center" }}>
            <FileText size={26} color="#94a3b8" />
            <strong>{invoices.length === 0 ? "No invoices created yet" : "No invoices match your search"}</strong>
            <p>
              {invoices.length === 0
                ? "Generate an invoice from any project workspace or create a direct invoice. All records are saved to the database."
                : "Try clearing your filters or search term to see other invoices."}
            </p>
            {invoices.length === 0 ? (
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
                  setError("");
                  setShowGenerateModal(true);
                }}
                style={{ marginTop: 8 }}
              >
                <Plus size={14} /> Generate your first invoice
              </button>
            ) : (search || statusFilter !== "ALL" || companyFilter !== "ALL") && (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
                  setCompanyFilter("ALL");
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="invoice-table-scroll">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client / Bill To</th>
                  <th>Company</th>
                  <th>Description</th>
                  <th>Issue / Due</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.invoiceNumber}>
                    <td>
                      <button
                        type="button"
                        className="invoice-num-btn"
                        onClick={() => setSelectedInvoiceNumber(inv.invoiceNumber)}
                        title="Click to view and print invoice"
                      >
                        {inv.invoiceNumber}
                      </button>
                    </td>
                    <td className="invoice-client-cell">
                      <strong>{inv.billTo}</strong>
                      {inv.clientEmail && <small>{inv.clientEmail}</small>}
                    </td>
                    <td>
                      <span className={`company-pill company-${inv.operatingCompany.toLowerCase()}`} data-company={inv.operatingCompany}>
                        {inv.operatingCompany}
                      </span>
                    </td>
                    <td>
                      <span style={{ maxWidth: 220, display: "inline-block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inv.description}
                      </span>
                    </td>
                    <td>
                      <div>{inv.issueDate}</div>
                      {inv.dueDate && <small style={{ color: "var(--ws-muted, #64748b)" }}>Due: {inv.dueDate}</small>}
                    </td>
                    <td className="invoice-amount-cell">
                      <strong>{money(inv.total ?? inv.depositAmount ?? 0, inv.currency)}</strong>
                      {inv.gstEnabled && <small>incl. GST ({inv.gstRate}%)</small>}
                    </td>
                    <td>
                      <StatusBadge status={inv.status}>{statusLabels[inv.status]}</StatusBadge>
                    </td>
                    <td>
                      <div className="invoice-actions-cell">
                        <button
                          type="button"
                          className="button button-quiet button-micro"
                          onClick={() => setSelectedInvoiceNumber(inv.invoiceNumber)}
                          title="Preview invoice"
                        >
                          <Printer size={13} />
                          Preview
                        </button>
                        {inv.status === "GENERATED" && (
                          <button
                            type="button"
                            className="button button-quiet button-micro"
                            onClick={() => handleMarkSent(inv)}
                            title="Log invoice sent"
                          >
                            <Send size={12} />
                            Sent
                          </button>
                        )}
                        {inv.status === "SENT" && (
                          <button
                            type="button"
                            className="button button-primary button-micro"
                            onClick={() => handleConfirmPaid(inv)}
                            title="Confirm payment"
                          >
                            <Check size={12} />
                            Paid
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-quiet button-micro"
                          onClick={() => handleDelete(inv)}
                          title="Delete invoice"
                          style={{ color: "var(--ws-muted, #64748b)" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invoice Preview Modal / Drawer */}
      {mounted && activeInvoice && typeof document !== "undefined" && createPortal(
        <div className="invoice-preview-backdrop" onClick={() => setSelectedInvoiceNumber(null)}>
          <div className="invoice-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="invoice-preview-topbar">
              <div className="invoice-preview-topbar-title">
                <FileText size={18} color="#0f172a" />
                <h3>{activeInvoice.invoiceNumber}</h3>
                <StatusBadge status={activeInvoice.status}>{statusLabels[activeInvoice.status]}</StatusBadge>
                <span className={`company-pill company-${activeInvoice.operatingCompany.toLowerCase()}`} data-company={activeInvoice.operatingCompany}>
                  {activeInvoice.operatingCompany}
                </span>
              </div>
              <div className="invoice-preview-topbar-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => window.print()}
                >
                  <Printer size={14} />
                  Print / Save PDF
                </button>
                {activeInvoice.status === "GENERATED" && (
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => handleMarkSent(activeInvoice)}
                  >
                    <Send size={14} />
                    Log sent
                  </button>
                )}
                {activeInvoice.status === "SENT" && (
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => handleConfirmPaid(activeInvoice)}
                  >
                    <Check size={14} />
                    Confirm paid
                  </button>
                )}
                {activeInvoice.leadId && (
                  <Link className="button button-quiet" href={`/requests/${activeInvoice.leadId}`}>
                    Open lead
                    <ExternalLink size={12} />
                  </Link>
                )}
                {activeInvoice.projectId && (
                  <Link className="button button-quiet" href={`/projects/${activeInvoice.projectId}`}>
                    Open project
                    <ExternalLink size={12} />
                  </Link>
                )}
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setSelectedInvoiceNumber(null)}
                  title="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="invoice-preview-scroll">
              <div className={`invoice-print-area invoice-reference-layout${isServnInvoice ? " invoice-company-servn" : ""}`}>
                <div className="invoice-paper-head">
                  <div>
                    <span className={`invoice-logo-crop${isServnInvoice ? " invoice-logo-servn" : ""}`}>
                      <img
                        className={`invoice-company-logo${isServnInvoice ? " invoice-company-logo-servn" : ""}`}
                        src={isServnInvoice ? "/servn-logo.png" : "/invoice-logo.png"}
                        alt={`${activeInvoice.operatingCompany} invoice logo`}
                      />
                    </span>
                  </div>
                  <div className="invoice-title">
                    <span>INVOICE</span>
                    <h2>{activeInvoice.invoiceNumber}</h2>
                  </div>
                </div>

                <div className="invoice-paper-meta">
                  <div>
                    <small>INVOICE TO</small>
                    <strong>{activeInvoice.billTo}</strong>
                    {activeInvoice.clientName && <span>{activeInvoice.clientName}</span>}
                    {activeInvoice.clientEmail && <span>{activeInvoice.clientEmail}</span>}
                  </div>
                  <div className="invoice-meta-right">
                    <small>INVOICE DATE</small>
                    <strong>{activeInvoice.issueDate}</strong>
                    {activeInvoice.dueDate && (
                      <>
                        <small>DUE DATE</small>
                        <strong>{activeInvoice.dueDate}</strong>
                      </>
                    )}
                    <small>COMPANY</small>
                    <strong>{invoiceLegalName}</strong>
                  </div>
                </div>

                <table className="invoice-lines">
                  <thead>
                    <tr>
                      <th>DESCRIPTION</th>
                      <th>QTY</th>
                      <th>UNIT PRICE</th>
                      <th>PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{activeInvoice.description || "Project services"}</td>
                      <td>{activeInvoice.quantity ?? 1}</td>
                      <td>{money(activeInvoice.unitPrice ?? invoiceAmount, activeInvoice.currency)}</td>
                      <td>{money(activeInvoice.subtotal ?? invoiceAmount, activeInvoice.currency)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="invoice-summary-row">
                  <div className="invoice-payment-details">
                    <strong>PAYMENT DETAILS</strong>
                    <p>
                      {activeInvoice.paymentInstructions ||
                        `Sample account: ${activeInvoice.operatingCompany} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`}
                    </p>
                    {activeInvoice.transactionReference && (
                      <p style={{ marginTop: 6, color: "var(--ws-muted, #16a34a)", fontWeight: 600 }}>
                        Reference: {activeInvoice.transactionReference}
                      </p>
                    )}
                  </div>
                  <div className="invoice-totals">
                    <div>
                      <span>Sub total</span>
                      <strong>{money(invoiceAmount, activeInvoice.currency)}</strong>
                    </div>
                    {activeInvoice.gstEnabled && (
                      <div>
                        <span>GST ({activeInvoice.gstRate ?? 0}%)</span>
                        <strong>{money(invoiceGst, activeInvoice.currency)}</strong>
                      </div>
                    )}
                    <div className="invoice-grand-total">
                      <span>Total</span>
                      <strong>{money(invoiceTotal, activeInvoice.currency)}</strong>
                    </div>
                  </div>
                </div>

                <div className="invoice-sample-details">
                  <div className="invoice-sample-signature">
                    <span>Hanan Lateef</span>
                    <strong>AUTHORIZED SIGNATORY</strong>
                  </div>
                  <div>
                    <strong>CONTACT US</strong>
                    <p>{SAMPLE_CONTACT}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* POPUP MODAL: Generate Invoice */}
      {mounted && showGenerateModal && typeof document !== "undefined" && createPortal(
        <div
          className="user-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowGenerateModal(false);
          }}
        >
          <section className="invoice-modal-card" role="dialog" aria-modal="true" aria-labelledby="generate-invoice-title">
            <div className="user-modal-heading">
              <div>
                <span className="section-kicker">COMMERCIAL BILLING</span>
                <h2 id="generate-invoice-title">Generate invoice</h2>
                <p>Create a branded invoice from any project workspace or create a direct invoice. All records are automatically saved to the database.</p>
              </div>
              <button
                type="button"
                className="user-modal-close-btn"
                aria-label="Close generate invoice"
                onClick={() => setShowGenerateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="invoice-drawer-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={createMode === "project"}
                className={`invoice-drawer-tab ${createMode === "project" ? "active" : ""}`}
                onClick={() => {
                  setCreateMode("project");
                  setError("");
                }}
              >
                <FolderKanban size={14} />
                From projects
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={createMode === "custom"}
                className={`invoice-drawer-tab ${createMode === "custom" ? "active" : ""}`}
                onClick={() => {
                  setCreateMode("custom");
                  setError("");
                }}
              >
                <Plus size={14} />
                Direct / custom invoice
              </button>
            </div>

            {createMode === "project" && (
              <>
                {projects.length === 0 ? (
                  <div className="invoice-empty-picker-state">
                    <div className="empty-state-icon">
                      <FolderKanban size={26} strokeWidth={1.5} />
                    </div>
                    <strong>No projects found</strong>
                    <p>
                      Active projects and retainers moved to projects will automatically appear here ready for one-click invoice generation.
                    </p>
                    <div className="empty-state-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => {
                          setCreateMode("custom");
                          setError("");
                        }}
                      >
                        <Plus size={14} /> Create direct custom invoice
                      </button>
                      <Link
                        href="/projects"
                        className="button button-quiet"
                        onClick={() => setShowGenerateModal(false)}
                      >
                        Open project portfolio <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <form className="invoice-modal-form" onSubmit={handleCreateInvoice}>
                    <label className="field invoice-deposit-choice"><span><input type="checkbox" name="isDeposit" /> This invoice is a project deposit</span><small>Use this only for the upfront deposit. Milestone and final invoices do not change deposit status.</small></label>
                    <div className="proposal-picker-header">
                      <label className="field-label">
                        Select project workspace
                      </label>
                      <span className="proposal-count-badge">
                        {projects.length} {projects.length === 1 ? "project" : "projects"} available
                      </span>
                    </div>

                    <div className="proposal-picker-list" role="radiogroup">
                      {projects.map((item) => {
                        const isSelected = item.id === selectedProjectId;
                        const hasInvoice = !!item.invoice;
                        const company = item.operatingCompany;

                        return (
                          <div
                            key={item.id}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedProjectId("");
                              } else {
                                setSelectedProjectId(item.id);
                                setError("");
                                setProjectAmount(item.contractedValue || "");
                                if (item.operatingCompany) setAssigningCompany(item.operatingCompany);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                if (isSelected) {
                                  setSelectedProjectId("");
                                } else {
                                  setSelectedProjectId(item.id);
                                  setError("");
                                  setProjectAmount(item.contractedValue || "");
                                  if (item.operatingCompany) setAssigningCompany(item.operatingCompany);
                                }
                              }
                            }}
                            className={`proposal-select-card ${isSelected ? "selected" : ""}`}
                          >
                            <div className="proposal-select-top">
                              <div className="proposal-select-identity">
                                <span className={`radio-dot ${isSelected ? "checked" : ""}`}>
                                  {isSelected && <Check size={11} strokeWidth={2.5} />}
                                </span>
                                <div>
                                  <strong className="proposal-client-name">
                                    {item.title}
                                  </strong>
                                  <span className="proposal-client-sub">
                                    {item.clientCompany || item.clientName} · {item.id}
                                  </span>
                                </div>
                              </div>
                              <div className="proposal-select-price">
                                <strong>{money(item.contractedValue || 0, item.currency || "USD")}</strong>
                                <span className="proposal-currency-badge">{item.currency || "USD"}</span>
                              </div>
                            </div>

                            <div className="proposal-select-bottom">
                              <div className="proposal-service-tags">
                                {(item.services || []).slice(0, 3).map((svc) => (
                                  <span key={svc} className="proposal-service-pill">{svc}</span>
                                ))}
                                {item.billingStructure && (
                                  <span className="proposal-service-pill">{item.billingStructure}</span>
                                )}
                              </div>
                              <div className="proposal-meta-tags">
                                {company ? (
                                  <span className={`company-pill company-${company.toLowerCase()}`} data-company={company}>
                                    {company}
                                  </span>
                                ) : (
                                  <span className="proposal-pill-warning">Company unassigned</span>
                                )}
                                {hasInvoice && (
                                  <span className="proposal-pill-success">
                                    <Check size={11} strokeWidth={2.5} /> {item.invoice?.invoiceNumber}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {activeProject && (
                      <div className="invoice-proposal-details">
                        {activeProject.invoice && (
                          <div className="invoice-existing-alert">
                            <div className="alert-content">
                              <CheckCircle2 size={16} className="alert-icon" />
                              <div>
                                <strong>Invoice {activeProject.invoice.invoiceNumber} already recorded for this project</strong>
                                <p>Status: {statusLabels[activeProject.invoice.status] || activeProject.invoice.status} · Generating will record an updated invoice.</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="button button-quiet"
                              onClick={() => {
                                setShowGenerateModal(false);
                                setSelectedInvoiceNumber(activeProject.invoice!.invoiceNumber);
                              }}
                            >
                              View invoice <ArrowRight size={13} />
                            </button>
                          </div>
                        )}

                        {/* Issuing company selector if unassigned */}
                        {!activeProject.operatingCompany && (
                          <div className="invoice-company-assign-banner">
                            <div className="assign-header">
                              <Building2 size={15} />
                              <strong>Select issuing company for this invoice:</strong>
                            </div>
                            <div className="invoice-company-picker" style={{ maxWidth: 360, marginTop: 8 }}>
                              <button
                                type="button"
                                className={`invoice-company-btn ${assigningCompany === "Evecture" ? "selected" : ""}`}
                                onClick={() => setAssigningCompany("Evecture")}
                              >
                                <span>Evecture</span>
                                {assigningCompany === "Evecture" && <Check size={14} strokeWidth={2.5} />}
                              </button>
                              <button
                                type="button"
                                className={`invoice-company-btn ${assigningCompany === "Servn" ? "selected" : ""}`}
                                onClick={() => setAssigningCompany("Servn")}
                              >
                                <span>Servn</span>
                                {assigningCompany === "Servn" && <Check size={14} strokeWidth={2.5} />}
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="invoice-config-section">
                          <span className="invoice-config-title">Invoice parameters</span>
                          <div className="invoice-form-grid">
                            <label className="field invoice-field-full">
                              Description / Scope of work
                              <input
                                name="description"
                                required
                                defaultValue={activeProject.scopeIncluded || (activeProject.services || []).join(" & ") || activeProject.title || "Project Retainer Services"}
                              />
                            </label>
                            <label className="field">
                              Amount ({activeProject.currency || "USD"})
                              <input
                                name="amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                                value={projectAmount}
                                onChange={(e) => setProjectAmount(e.target.value)}
                              />
                            </label>
                            <label className="field">
                              Issuing company
                              <input
                                disabled
                                value={activeProject.operatingCompany || assigningCompany}
                                style={{ background: "var(--ws-surface, #f8fafc)", color: "var(--ws-muted, #64748b)" }}
                              />
                            </label>
                            <label className="field">
                              Invoice date
                              <CalendarPicker name="issueDate" required defaultValue={today()} />
                            </label>
                            <label className="field">
                              Payment due date
                              <CalendarPicker name="dueDate" required defaultValue={inSevenDays()} />
                            </label>
                          </div>

                          <div className="invoice-tax-box" style={{ marginTop: 12 }}>
                            <label className="invoice-gst-toggle-card">
                              <div className="toggle-left">
                                <input
                                  type="checkbox"
                                  name="gstEnabled"
                                  className="sr-only-checkbox"
                                  checked={gstEnabled}
                                  onChange={(event) => setGstEnabled(event.target.checked)}
                                />
                                <span className={`custom-check ${gstEnabled ? "checked" : ""}`}>
                                  {gstEnabled && <Check size={11} strokeWidth={2.5} />}
                                </span>
                                <div>
                                  <strong>Apply GST ({gstRate}%)</strong>
                                  <small>Tax will be added to the invoice total amount.</small>
                                </div>
                              </div>
                              {gstEnabled && (
                                <div className="tax-rate-input" onClick={(e) => e.stopPropagation()}>
                                  <span>Rate:</span>
                                  <input
                                    name="gstRate"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value={gstRate}
                                    onChange={(e) => setGstRate(Number(e.target.value))}
                                  />
                                  <span>%</span>
                                </div>
                              )}
                            </label>
                          </div>

                          {/* Live Financial Breakdown Summary */}
                          <div className="invoice-calculation-summary">
                            <div className="calc-row">
                              <span>Subtotal</span>
                              <strong>{money(parsedProjectAmount, activeProject.currency || "USD")}</strong>
                            </div>
                            {gstEnabled && (
                              <div className="calc-row">
                                <span>GST ({gstRate}%)</span>
                                <strong>+{money(projectGstAmount, activeProject.currency || "USD")}</strong>
                              </div>
                            )}
                            <div className="calc-row total-row">
                              <span>Total invoice value</span>
                              <strong className="grand-total-amount">
                                {money(projectTotal, activeProject.currency || "USD")}
                              </strong>
                            </div>
                          </div>
                        </div>

                        {error && (
                          <div className="form-error" role="alert" style={{ marginTop: 12 }}>
                            {error}
                          </div>
                        )}

                        <div className="invoice-modal-actions">
                          <button
                            type="button"
                            className="button button-quiet"
                            onClick={() => setShowGenerateModal(false)}
                          >
                            Cancel
                          </button>
                          <button
                            className="button button-primary"
                            type="submit"
                            disabled={saving}
                          >
                            {saving ? "Saving…" : pendingInvoice.current ? "Retry saving invoice" : "Generate & Save Invoice"} <ArrowRight size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                )}
              </>
            )}

            {createMode === "custom" && (
              <form className="invoice-modal-form" onSubmit={handleCreateInvoice}>
                <label className="field invoice-deposit-choice"><span><input type="checkbox" name="isDeposit" /> This invoice is a project deposit</span><small>Milestone and final invoices do not change deposit status.</small></label>
                <div className="invoice-config-section" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <div className="company-selection-group">
                    <label className="field-label" style={{ display: "block", marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
                      Issuing company
                    </label>
                    <div className="invoice-company-picker" style={{ maxWidth: 440 }}>
                      <button
                        type="button"
                        className={`invoice-company-btn ${customCompany === "Evecture" ? "selected" : ""}`}
                        onClick={() => setCustomCompany("Evecture")}
                      >
                        <span style={{ fontWeight: 600 }}>Evecture</span>
                        {customCompany === "Evecture" && <Check size={14} strokeWidth={2.5} />}
                      </button>
                      <button
                        type="button"
                        className={`invoice-company-btn ${customCompany === "Servn" ? "selected" : ""}`}
                        onClick={() => setCustomCompany("Servn")}
                      >
                        <span style={{ fontWeight: 600 }}>Servn</span>
                        {customCompany === "Servn" && <Check size={14} strokeWidth={2.5} />}
                      </button>
                    </div>
                  </div>

                  <span className="invoice-config-title" style={{ marginTop: 18 }}>Client details</span>
                  <div className="invoice-form-grid">
                    <label className="field invoice-field-full">
                      Link to project (optional)
                      <select
                        value={customProjectId}
                        onChange={(e) => {
                          const pId = e.target.value;
                          setCustomProjectId(pId);
                          const p = projects.find((proj) => proj.id === pId);
                          if (p) {
                            const billInput = document.querySelector<HTMLInputElement>('input[name="billTo"]');
                            if (billInput && (p.clientCompany || p.clientName)) billInput.value = p.clientCompany || p.clientName;
                            const emailInput = document.querySelector<HTMLInputElement>('input[name="clientEmail"]');
                            if (emailInput && p.clientEmail) emailInput.value = p.clientEmail;
                            if (p.currency) setCustomCurrency(p.currency);
                            if (p.operatingCompany) setCustomCompany(p.operatingCompany);
                          }
                        }}
                      >
                        <option value="">None (standalone / direct)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.title} · {p.id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field required">
                      Bill to (Company / Client name)
                      <input name="billTo" required placeholder="e.g. Acme Corporation" />
                    </label>
                    <label className="field">
                      Contact person
                      <input name="clientName" placeholder="e.g. Alex Smith" />
                    </label>
                    <label className="field">
                      Contact email
                      <input name="clientEmail" type="email" placeholder="alex@acme.com" />
                    </label>
                    <label className="field required">
                      Currency
                      <select
                        value={customCurrency}
                        onChange={(e) => setCustomCurrency(e.target.value)}
                      >
                        <option value="USD">USD ($)</option>
                        <option value="INR">INR (₹)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="AED">AED (د.إ)</option>
                        <option value="CAD">CAD ($)</option>
                        <option value="AUD">AUD ($)</option>
                      </select>
                    </label>
                  </div>

                  <span className="invoice-config-title" style={{ marginTop: 18 }}>Scope & billing</span>
                  <div className="invoice-form-grid">
                    <label className="field required invoice-field-full">
                      Description / Scope of work
                      <input name="description" required placeholder="e.g. Retainer Services · Brand & Strategy" />
                    </label>
                    <label className="field required">
                      Amount ({customCurrency})
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="5000"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                      />
                    </label>
                    <label className="field required">
                      Invoice date
                      <CalendarPicker name="issueDate" required defaultValue={today()} />
                    </label>
                    <label className="field required">
                      Payment due date
                      <CalendarPicker name="dueDate" required defaultValue={inSevenDays()} />
                    </label>
                  </div>

                  <div className="invoice-tax-box" style={{ marginTop: 12 }}>
                    <label className="invoice-gst-toggle-card">
                      <div className="toggle-left">
                        <input
                          type="checkbox"
                          name="gstEnabled"
                          className="sr-only-checkbox"
                          checked={gstEnabled}
                          onChange={(event) => setGstEnabled(event.target.checked)}
                        />
                        <span className={`custom-check ${gstEnabled ? "checked" : ""}`}>
                          {gstEnabled && <Check size={11} strokeWidth={2.5} />}
                        </span>
                        <div>
                          <strong>Apply GST ({gstRate}%)</strong>
                          <small>Tax will be added to the invoice total amount.</small>
                        </div>
                      </div>
                      {gstEnabled && (
                        <div className="tax-rate-input" onClick={(e) => e.stopPropagation()}>
                          <span>Rate:</span>
                          <input
                            name="gstRate"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={gstRate}
                            onChange={(e) => setGstRate(Number(e.target.value))}
                          />
                          <span>%</span>
                        </div>
                      )}
                    </label>
                  </div>

                  {/* Live Financial Breakdown Summary for Custom */}
                  <div className="invoice-calculation-summary">
                    <div className="calc-row">
                      <span>Subtotal</span>
                      <strong>{money(parsedCustomAmount, customCurrency)}</strong>
                    </div>
                    {gstEnabled && (
                      <div className="calc-row">
                        <span>GST ({gstRate}%)</span>
                        <strong>+{money(customGstAmount, customCurrency)}</strong>
                      </div>
                    )}
                    <div className="calc-row total-row">
                      <span>Total invoice value</span>
                      <strong className="grand-total-amount">
                        {money(customTotal, customCurrency)}
                      </strong>
                    </div>
                  </div>

                  <span className="invoice-config-title" style={{ marginTop: 18 }}>Payment & bank notes</span>
                  <div className="invoice-form-grid">
                    <label className="field invoice-field-full">
                      Payment terms
                      <input name="paymentTerms" defaultValue={SAMPLE_PAYMENT_TERMS} />
                    </label>
                    <label className="field invoice-field-full">
                      Payment instructions
                      <input
                        name="paymentInstructions"
                        defaultValue={`Sample account: ${customCompany} Studio · Account no. 0000 0000 0000 · IFSC: SAMPLE0001`}
                      />
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="form-error" role="alert" style={{ marginTop: 12 }}>
                    {error}
                  </div>
                )}

                <div className="invoice-modal-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setShowGenerateModal(false)}
                  >
                    Cancel
                  </button>
                  <button className="button button-primary" type="submit" disabled={saving}>
                    {saving ? "Saving…" : pendingInvoice.current ? "Retry saving invoice" : "Generate & Save to Database"} <ArrowRight size={14} />
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>,
        document.body
      )}

    </div>
  );
}
