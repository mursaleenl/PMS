"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bug, RefreshCw, Send, ShieldAlert } from "lucide-react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import { StatusBadge } from "@/app/_components/status-badge";
import { supabase } from "@/lib/supabase";

type ReviewStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
type ReviewType = "BUG" | "ISSUE";
type ReviewPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type WorkspaceReview = {
  id: string;
  reporter_user_id: string;
  reporter_name: string;
  reporter_email: string | null;
  title: string;
  report_type: ReviewType;
  priority: ReviewPriority;
  description: string;
  page_path: string | null;
  status: ReviewStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<ReviewStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
};
const priorityLabels: Record<ReviewPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export default function ReviewsPage() {
  const { role, user, session } = useWorkspaceAuth();
  const isAdmin = role === "admin";
  const [reviews, setReviews] = useState<WorkspaceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState<ReviewType>("BUG");
  const [priority, setPriority] = useState<ReviewPriority>("MEDIUM");
  const [pagePath, setPagePath] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const loadReviews = useCallback(async () => {
    if (!supabase || !session) {
      setError("Workspace database is unavailable. Sign in again and retry.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const result = await supabase.from("workspace_reviews").select("*").order("created_at", { ascending: false });
    if (result.error) setError(result.error.message || "Unable to load reviews.");
    else setReviews((result.data ?? []) as WorkspaceReview[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void loadReviews(); }, [loadReviews, refreshKey]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || busy) return;
    setBusy(true);
    setError("");
    const reporterName = String(user.user_metadata?.full_name || user.email?.split("@")[0] || "Workspace user");
    const result = await supabase.from("workspace_reviews").insert({
      reporter_user_id: user.id,
      reporter_name: reporterName,
      reporter_email: user.email || null,
      title: title.trim(),
      report_type: reportType,
      priority,
      description: description.trim(),
      page_path: pagePath.trim() || null,
    });
    if (result.error) setError(result.error.message || "Your review could not be submitted.");
    else {
      setTitle("");
      setReportType("BUG");
      setPriority("MEDIUM");
      setPagePath("");
      setDescription("");
      setRefreshKey((value) => value + 1);
    }
    setBusy(false);
  }

  async function updateStatus(review: WorkspaceReview, status: ReviewStatus) {
    if (!supabase || !isAdmin) return;
    setError("");
    const result = await supabase.from("workspace_reviews").update({ status }).eq("id", review.id).select("*").single();
    if (result.error) setError(result.error.message || "Review status could not be updated.");
    else setReviews((items) => items.map((item) => item.id === review.id ? result.data as WorkspaceReview : item));
  }

  async function saveAdminNote(review: WorkspaceReview) {
    if (!supabase || !isAdmin) return;
    setError("");
    const result = await supabase.from("workspace_reviews").update({ admin_note: notes[review.id] ?? review.admin_note ?? "" }).eq("id", review.id).select("*").single();
    if (result.error) setError(result.error.message || "Admin note could not be saved.");
    else setReviews((items) => items.map((item) => item.id === review.id ? result.data as WorkspaceReview : item));
  }

  return <div className="page-content reviews-page">
    <section className="welcome-row"><div><h1>Reviews</h1><p className="welcome-subtitle">{isAdmin ? "Review reported bugs and issues, then track them through resolution." : "Report bugs and issues for the admin team to review."}</p></div><button className="button button-quiet" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={14} />Refresh</button></section>

    <section className="panel reviews-submit-panel">
      <div className="panel-heading"><div><h2>Report a bug or issue</h2><p>Describe what happened and what should be fixed.</p></div><Bug size={18} /></div>
      <form className="reviews-submit-form" onSubmit={submitReview}>
        <div className="reviews-form-grid">
          <label className="field">Title<input required minLength={3} maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Short summary of the issue" /></label>
          <label className="field">Type<select value={reportType} onChange={(event) => setReportType(event.target.value as ReviewType)}><option value="BUG">Bug</option><option value="ISSUE">Issue</option></select></label>
          <label className="field">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as ReviewPriority)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select></label>
          <label className="field reviews-location-field">Page or project (optional)<input maxLength={300} value={pagePath} onChange={(event) => setPagePath(event.target.value)} placeholder="For example, /projects/EV-123" /></label>
        </div>
        <label className="field">Description<textarea required minLength={8} maxLength={5000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Steps to reproduce, what you expected, and what happened instead" /></label>
        <div className="reviews-form-footer"><span>Admins can add follow-up notes and update the status.</span><button className="button button-primary" type="submit" disabled={busy || !title.trim() || !description.trim()}><Send size={14} />{busy ? "Submitting…" : "Submit review"}</button></div>
      </form>
    </section>

    <section className="reviews-list-section">
      <div className="overview-section-heading"><div><h2>{isAdmin ? "Review queue" : "My reports"}</h2><p>{isAdmin ? "Reports submitted by the team." : "Your reports and their progress."}</p></div><span className="reviews-count">{reviews.length} {reviews.length === 1 ? "report" : "reports"}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <div className="panel reviews-empty" role="status">Loading reviews…</div> : reviews.length === 0 ? <div className="panel reviews-empty"><ShieldAlert size={19} /><strong>No reports yet</strong><span>{isAdmin ? "Employee and admin reports will appear here." : "Reports you submit will appear here."}</span></div> : <div className="reviews-list">{reviews.map((review) => <article className="panel review-card" key={review.id}>
        <header className="review-card-header"><div><div className="review-card-title-line"><h3>{review.title}</h3><StatusBadge status={review.status}>{statusLabels[review.status]}</StatusBadge></div><p>{review.reporter_name}{review.reporter_email ? ` · ${review.reporter_email}` : ""} · {new Date(review.created_at).toLocaleString()}</p></div>{isAdmin && <label className="field review-status-field">Status<select value={review.status} onChange={(event) => void updateStatus(review, event.target.value as ReviewStatus)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label>}</header>
        <div className="review-meta-row"><span>{review.report_type === "BUG" ? "Bug" : "Issue"}</span><span>Priority: {priorityLabels[review.priority]}</span>{review.page_path && <span>Page: {review.page_path}</span>}</div>
        <p className="review-description">{review.description}</p>
        {isAdmin ? <div className="review-admin-note"><label className="field">Admin follow-up note<textarea rows={2} maxLength={2000} value={notes[review.id] ?? review.admin_note ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [review.id]: event.target.value }))} placeholder="Add a fix plan or follow-up note" /></label><button className="button button-quiet" type="button" onClick={() => void saveAdminNote(review)}>Save note</button></div> : review.admin_note && <div className="review-admin-note-read"><strong>Admin update</strong><p>{review.admin_note}</p></div>}
      </article>)}</div>}
    </section>
  </div>;
}
