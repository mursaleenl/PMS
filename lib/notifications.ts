import { readLeads } from "./leads";
import { readProjects } from "./projects";
import { readInvoices } from "./invoices";

export type NotificationType = "LEAD" | "TASK" | "INVOICE" | "PROJECT" | "SYSTEM";

export interface WorkspaceNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

let memoryNotifications: WorkspaceNotification[] | undefined;

function dispatchNotificationEvent() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("evecture:notifications-updated"));
  }
}

export function readNotifications(): WorkspaceNotification[] {
  if (typeof window === "undefined") return [];
  if (!memoryNotifications || memoryNotifications.length === 0) {
    memoryNotifications = generateInitialNotifications();
  }
  return memoryNotifications;
}

export function saveNotifications(items: WorkspaceNotification[]) {
  if (typeof window === "undefined") return;
  memoryNotifications = items;
  dispatchNotificationEvent();
}

export function addNotification(
  item: Omit<WorkspaceNotification, "id" | "createdAt" | "read">
): WorkspaceNotification {
  const current = readNotifications();
  const newNotification: WorkspaceNotification = {
    ...item,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
  saveNotifications([newNotification, ...current]);
  return newNotification;
}

export function markNotificationRead(id: string) {
  const current = readNotifications();
  const updated = current.map((item) => (item.id === id ? { ...item, read: true } : item));
  saveNotifications(updated);
}

export function markAllNotificationsRead() {
  const current = readNotifications();
  const updated = current.map((item) => ({ ...item, read: true }));
  saveNotifications(updated);
}

export function dismissNotification(id: string) {
  const current = readNotifications();
  const updated = current.filter((item) => item.id !== id);
  saveNotifications(updated);
}

export function clearAllNotifications() {
  saveNotifications([]);
}

/**
 * Synthesizes initial real notifications from current workspace leads, projects, and invoices
 */
export function generateInitialNotifications(): WorkspaceNotification[] {
  const items: WorkspaceNotification[] = [];
  const now = Date.now();

  try {
    const leads = readLeads();
    const newLeads = leads.filter((lead) => lead.status === "NEW" || !lead.firstContactAt);
    newLeads.slice(0, 3).forEach((lead, index) => {
      items.push({
        id: `seed-lead-${lead.id}`,
        type: "LEAD",
        title: `New Enquiry: ${lead.companyName || lead.fullName}`,
        message: `${lead.fullName} submitted an enquiry for ${lead.services.join(", ") || "Project delivery"}.`,
        link: `/requests#${lead.id}`,
        read: index > 0,
        createdAt: new Date(now - (index + 1) * 35 * 60 * 1000).toISOString(),
      });
    });

    const invoices = readInvoices();
    const pendingInvoices = invoices.filter((inv) => inv.status === "SENT" || inv.status === "GENERATED");
    pendingInvoices.slice(0, 2).forEach((invoice, index) => {
      items.push({
        id: `seed-inv-${invoice.id}`,
        type: "INVOICE",
        title: `Invoice ${invoice.invoiceNumber || invoice.id} · ${invoice.status === "SENT" ? "Awaiting Payment" : "Draft Ready"}`,
        message: `${invoice.billTo || invoice.clientName || "Client"} invoice for $${(invoice.total || invoice.subtotal || 0).toLocaleString()} is currently ${invoice.status.toLowerCase()}.`,
        link: `/invoices`,
        read: false,
        createdAt: new Date(now - (index + 2) * 85 * 60 * 1000).toISOString(),
      });
    });

    const projects = readProjects();
    const activeProjects = projects.filter((p) => p.status === "ACTIVE");
    if (activeProjects.length > 0) {
      const proj = activeProjects[0];
      const tasks = proj.workItems ?? [];
      const inProgressTask = tasks.find((t) => t.status === "IN_PROGRESS" || t.status === "TO_DO");
      if (inProgressTask) {
        items.push({
          id: `seed-task-${inProgressTask.id}`,
          type: "TASK",
          title: `Active Task: ${inProgressTask.title}`,
          message: `Assigned to ${inProgressTask.assignee || "team"} in project "${proj.title}".`,
          link: `/work`,
          read: true,
          createdAt: new Date(now - 180 * 60 * 1000).toISOString(),
        });
      }
    }

    if (items.length === 0) {
      items.push({
        id: `seed-system-welcome`,
        type: "SYSTEM",
        title: "Welcome to Evecture PMS",
        message: "Your project workspace notifications will appear here in real time.",
        link: "/",
        read: false,
        createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      });
    }
  } catch (error) {
    console.error("Error generating initial notifications", error);
  }

  // Sort by createdAt descending
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
