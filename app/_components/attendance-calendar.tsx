"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatAttendanceHours, officeDate, readAttendanceSessions, type AttendanceSession } from "@/lib/qr-attendance";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function monthDate(month: string, day = 1) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1, day));
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function AttendanceCalendar({ userId, personName, timezone, refreshKey }: {
  userId: string;
  personName?: string;
  timezone: string;
  refreshKey: number;
}) {
  const today = officeDate(timezone);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [visits, setVisits] = useState<AttendanceSession[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const first = monthDate(month);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lastDate = `${month}-${String(days).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const offset = (first.getUTCDay() + 6) % 7;

  useEffect(() => {
    setMonth(officeDate(timezone).slice(0, 7)); setSelected("");
  }, [timezone]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setVisits([]);
    async function load() {
      try {
        const rows = await readAttendanceSessions(`${month}-01`, lastDate, userId);
        if (!cancelled) setVisits(rows.filter(visit => visit.user_id === userId && visit.work_date.startsWith(`${month}-`)));
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load the attendance calendar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [month, lastDate, userId, refreshKey, retry]);

  const scopedVisits = visits.filter(visit => visit.user_id === userId && visit.work_date.startsWith(`${month}-`));
  const daysAttended = new Set(scopedVisits.map(visit => visit.work_date));
  const selectedVisits = scopedVisits.filter(visit => visit.work_date === selected);
  const title = personName ? `${personName}’s attendance calendar` : "My attendance calendar";
  const time = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { timeStyle: "short", hour12: true, timeZone: timezone }).format(new Date(value)) : "—";
  function moveMonth(change: number) {
    const date = monthDate(month);
    date.setUTCMonth(date.getUTCMonth() + change);
    setMonth(date.toISOString().slice(0, 7)); setSelected("");
  }

  return <section id="my-attendance-calendar" className="panel attendance-calendar" aria-labelledby="attendance-calendar-title" aria-busy={loading}>
    <div className="attendance-calendar-heading"><div><h2 id="attendance-calendar-title">{title}</h2><p>Dots mark dates with recorded attendance.</p></div><span className="attendance-calendar-count">{loading ? "Loading…" : error ? "Unavailable" : `${daysAttended.size} ${daysAttended.size === 1 ? "day" : "days"} attended`}</span></div>
    <div className="attendance-calendar-month"><h3 aria-live="polite">{monthLabel}</h3><div className="attendance-calendar-controls">
      <button className="button button-quiet" type="button" aria-label="Previous attendance month" onClick={() => moveMonth(-1)}><ChevronLeft size={16}/></button>
      <button className="button button-quiet" type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Today</button>
      <button className="button button-quiet" type="button" aria-label="Next attendance month" disabled={month >= today.slice(0, 7)} onClick={() => moveMonth(1)}><ChevronRight size={16}/></button>
    </div></div>
    {error ? <div className="attendance-calendar-error" role="alert"><p>{error}</p><button className="button button-quiet" type="button" onClick={() => setRetry(value => value + 1)}>Retry calendar</button></div> : <>
      <div className="attendance-calendar-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{day}</span>)}</div>
      <div className="attendance-calendar-days" role="group" aria-label={`${monthLabel} attendance`}>
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true"/>)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const present = daysAttended.has(date);
          return <button type="button" key={date} data-date={date} className="attendance-calendar-day" disabled={loading || date > today} aria-label={`${dateLabel(date)}${present ? ", attendance recorded" : ""}`} aria-current={date === today ? "date" : undefined} aria-pressed={selected === date} onClick={() => setSelected(date)}>
            <span>{day}</span><span className="attendance-calendar-marker" aria-hidden="true">{present && <span className="attendance-date-dot"/>}</span>
          </button>;
        })}
      </div>
      <div className="attendance-calendar-legend"><span className="attendance-date-dot" aria-hidden="true"/>Recorded attendance</div>
      {selected && !loading && <div className="attendance-calendar-day-details" aria-live="polite"><h3>{dateLabel(selected)}</h3>
        {selectedVisits.length ? <ul>{selectedVisits.map(visit => <li key={visit.id}><span><small>Arrival</small>{time(visit.checked_in_at)}</span><span><small>Departure</small>{visit.checked_out_at ? time(visit.checked_out_at) : !visit.checked_in_at ? "—" : visit.work_date === today ? "Checked in" : "Missing checkout"}</span><span><small>Hours</small>{visit.checked_in_at && visit.checked_out_at ? formatAttendanceHours((Date.parse(visit.checked_out_at) - Date.parse(visit.checked_in_at)) / 3600000) : "—"}</span></li>)}</ul> : <p>No attendance recorded for this date.</p>}
      </div>}
    </>}
  </section>;
}
