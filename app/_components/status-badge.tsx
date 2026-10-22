import type { ReactNode } from "react";

const statusTone: Record<string, string> = {
  ACTIVE: "success", COMPLETED: "success", PAID: "success", CONFIRMED_PAID: "success", WON: "success", ACCEPTED: "success", CONVERTED: "success", DONE: "success",
  PENDING: "warning", NEW: "warning", QUALIFIED: "warning", PROPOSAL_SENT: "warning", DRAFT: "warning", IN_REVIEW: "warning", GENERATED: "warning", SENT: "warning", UPCOMING: "warning", TO_DO: "warning", IN_PROGRESS: "warning",
  BLOCKED: "danger", OVERDUE: "danger", LOST: "danger", DISQUALIFIED: "danger", DECLINED: "danger", EXPIRED: "danger", P1: "danger",
  P2: "warning", P3: "neutral", P4: "neutral",
  PAUSED: "neutral", ENDED: "neutral",
};

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const key = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const tone = statusTone[key] ?? "neutral";
  return <span className={`status-badge status-badge-${tone}`}>{children ?? status.replaceAll("_", " ")}</span>;
}
