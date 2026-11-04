"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { attendanceTime } from "@/lib/qr-attendance";
import { supabase } from "@/lib/supabase";

type AttendanceChange = {
  id: string;
  changed_at: string;
  actor_id: string;
  old_record: Record<string, unknown> | null;
  new_record: Record<string, unknown> | null;
};
const pageSize = 50;

export function AttendanceChanges({ timezone, name, refreshKey }: {
  timezone: string;
  name: (id: string) => string;
  refreshKey: number;
}) {
  const [changes, setChanges] = useState<AttendanceChange[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const version = ++generation.current;
    setLoading(true); setError(""); setExpanded(new Set());
    setLoadingMore(false); loadingMoreRef.current = false;
    async function load() {
      try {
        if (!supabase) throw new Error("Attendance history is unavailable.");
        const result = await supabase.from("attendance_audit")
          .select("id,changed_at,actor_id,old_record,new_record")
          .order("changed_at", { ascending: false }).order("id", { ascending: false })
          .range(0, pageSize);
        if (result.error) throw new Error("Unable to load attendance changes.");
        if (generation.current !== version) return;
        const rows: AttendanceChange[] = result.data ?? [];
        setChanges(rows.slice(0, pageSize)); setHasMore(rows.length > pageSize);
      } catch (cause) {
        if (generation.current === version) setError(cause instanceof Error ? cause.message : "Unable to load attendance changes.");
      } finally {
        if (generation.current === version) setLoading(false);
      }
    }
    void load();
    return () => { generation.current++; };
  }, [refreshKey, retry]);

  async function loadMore() {
    if (!supabase || loading || loadingMoreRef.current) return;
    const version = generation.current;
    loadingMoreRef.current = true; setLoadingMore(true); setError("");
    const last = changes.at(-1);
    if (!last) { loadingMoreRef.current = false; setLoadingMore(false); return; }
    try {
      // Use the last visible row as a cursor so new changes cannot shift older pages.
      const result = await supabase.from("attendance_audit")
        .select("id,changed_at,actor_id,old_record,new_record")
        .order("changed_at", { ascending: false }).order("id", { ascending: false })
        .or(`changed_at.lt.${last.changed_at},and(changed_at.eq.${last.changed_at},id.lt.${last.id})`)
        .limit(pageSize + 1);
      if (result.error) throw new Error("Unable to load older changes. Try again.");
      if (generation.current !== version) return;
      const rows: AttendanceChange[] = result.data ?? [];
      setChanges(current => [...current, ...rows.slice(0, pageSize).filter(row => !current.some(item => item.id === row.id))]);
      setHasMore(rows.length > pageSize);
    } catch (cause) {
      if (generation.current === version) setError(cause instanceof Error ? cause.message : "Unable to load older changes.");
    } finally {
      if (generation.current === version) { loadingMoreRef.current = false; setLoadingMore(false); }
    }
  }

  const allExpanded = changes.length > 0 && changes.every(change => expanded.has(change.id));
  return <details id="attendance-change-history" className="panel attendance-audit-panel attendance-changes">
    <summary className="attendance-section-heading attendance-changes-heading">
      <div><h2>Recent attendance changes</h2><p>QR summaries and administrator corrections.</p></div>
      <span className="attendance-changes-summary"><span className="attendance-record-count">{loading ? "Loading…" : `${changes.length}${hasMore ? "+" : ""} ${changes.length === 1 ? "change" : "changes"}`}</span><ChevronDown size={16} aria-hidden="true" /></span>
    </summary>
    {error && <div className="attendance-changes-error" role="alert"><p>{error}</p>{!changes.length && <button className="button button-quiet" type="button" onClick={() => setRetry(value => value + 1)}>Retry changes</button>}</div>}
    {loading ? <p role="status" className="attendance-empty-state">Loading attendance changes…</p> : changes.length > 0 ? <>
      <ol className="attendance-change-list">{changes.map(change => {
        const isExpanded = expanded.has(change.id);
        const member = name(String(change.new_record?.user_id || change.old_record?.user_id || ""));
        const reason = String(change.new_record?.reason || change.new_record?.notes || "Attendance updated");
        return <li key={change.id}>
          <button className="attendance-change-toggle" type="button" aria-expanded={isExpanded} aria-controls={`attendance-change-${change.id}`} onClick={() => setExpanded(current => {
            const next = new Set(current); if (next.has(change.id)) next.delete(change.id); else next.add(change.id); return next;
          })}>
            <span className="attendance-change-copy"><strong>{reason}</strong><span>{member} · {attendanceTime(change.changed_at, timezone)} · Changed by {name(change.actor_id)}</span></span><ChevronDown size={16} aria-hidden="true" />
          </button>
          {isExpanded && <div className="attendance-change-details" id={`attendance-change-${change.id}`}>
            <dl><div><dt>Team member</dt><dd>{member}</dd></div><div><dt>Work date</dt><dd>{String(change.new_record?.work_date || change.old_record?.work_date || "—")}</dd></div>
              {change.old_record?.checked_in_at || change.new_record?.checked_in_at ? <><div><dt>Previous departure</dt><dd>{typeof change.old_record?.checked_out_at === "string" ? attendanceTime(change.old_record.checked_out_at, timezone) : "Missing checkout"}</dd></div><div><dt>Corrected departure</dt><dd>{typeof change.new_record?.checked_out_at === "string" ? attendanceTime(change.new_record.checked_out_at, timezone) : "—"}</dd></div></> : <><div><dt>Previous daily hours</dt><dd>{String(change.old_record?.hours_logged ?? "—")}</dd></div><div><dt>Updated daily hours</dt><dd>{String(change.new_record?.hours_logged ?? "—")}</dd></div><div><dt>Status</dt><dd>{String(change.new_record?.status || change.old_record?.status || "—").replaceAll("_", " ")}</dd></div></>}
            </dl>
          </div>}
        </li>;
      })}</ol>
      <div className="attendance-changes-tools">
        {hasMore && <button className="button button-quiet" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading older changes…" : "Load older changes"}</button>}
        <button className="button button-quiet" type="button" onClick={() => setExpanded(allExpanded ? new Set() : new Set(changes.map(change => change.id)))}>{allExpanded ? "Collapse all" : "Expand all"}</button>
      </div>
    </> : !error && <p className="attendance-empty-state">No changes recorded.</p>}
  </details>;
}
