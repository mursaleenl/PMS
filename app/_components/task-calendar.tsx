"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { isValidDateValue, taskDeadlineInput } from "@/lib/dates";
import { GENERAL_TASKS_ID } from "@/lib/general-tasks";
import { getTaskAssigneeLabel, type ProjectWorkItem } from "@/lib/projects";

export type CalendarTask = { projectId: string; projectTitle: string; organization?: string; task: ProjectWorkItem };

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const statusLabels: Record<ProjectWorkItem["status"], string> = {
  TO_DO: "To do",
  IN_PROGRESS: "In progress",
  UNDER_REVIEW: "In review",
  BLOCKED: "Blocked",
  DONE: "Completed",
};
const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "full" });
const deadlineFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function deadlineDay(deadline?: string) {
  if (deadline && isValidDateValue(deadline)) return deadline;
  return taskDeadlineInput(deadline).slice(0, 10);
}

function deadlineLabel(deadline: string) {
  return isValidDateValue(deadline)
    ? dayFormat.format(new Date(`${deadline}T00:00:00`))
    : deadlineFormat.format(new Date(deadline));
}

function taskHref({ projectId, task }: CalendarTask) {
  const taskId = encodeURIComponent(task.id);
  return projectId === GENERAL_TASKS_ID
    ? `/work?project=${GENERAL_TASKS_ID}&task=${taskId}`
    : `/projects/${encodeURIComponent(projectId)}?tab=tasks&task=${taskId}`;
}

export function TaskCalendar({ tasks, workspaceWide }: { tasks: CalendarTask[]; workspaceWide: boolean }) {
  const today = taskDeadlineInput(new Date().toISOString()).slice(0, 10);
  const details = useRef<HTMLElement>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [agenda, setAgenda] = useState(today);
  const [selectedHref, setSelectedHref] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{entry: CalendarTask; x: number; y: number} | null>(null);
  function showPreview(entry: CalendarTask, button: HTMLElement) {
    const box = button.getBoundingClientRect();
    setHover({entry, x: Math.max(8, Math.min(box.left, window.innerWidth - 258)), y: Math.max(8, Math.min(box.bottom + 4, window.innerHeight - 110))});
  }
  function moveDay(step: number) {
    const date = new Date(`${agenda}T12:00:00`);
    date.setDate(date.getDate() + step);
    const next = deadlineDay(date.toISOString());
    setMonth(next.slice(0, 7));
    selectAgenda(next);
  }
  const first = new Date(`${month}-01T00:00:00`);
  const year = first.getFullYear();
  const monthIndex = first.getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const monthLabel = monthFormat.format(first);

  const tasksByDay = new Map<string, CalendarTask[]>();
  for (const entry of tasks) {
    const added = deadlineDay(entry.task.createdAt);
    const due = deadlineDay(entry.task.deadline);
    for (const date of new Set([due, added])) {
      if (!date) continue;
      const entries = tasksByDay.get(date) ?? [];
      entries.push(entry);
      tasksByDay.set(date, entries);
    }
  }
  function eventLabel(entry: CalendarTask, date: string) {
    if (deadlineDay(entry.task.deadline) !== date) return "Added";
    return deadlineDay(entry.task.createdAt) === date ? "Added & due" : "Due";
  }
  const agendaTasks = tasksByDay.get(agenda) ?? [];
  const visibleTasks = agendaTasks.filter(entry => [entry.task.title, entry.projectTitle, entry.organization, getTaskAssigneeLabel(entry.task)].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const agendaTitle = dayFormat.format(new Date(`${agenda}T00:00:00`));
  const selected = agendaTasks.find(entry => taskHref(entry) === selectedHref);

  const start = deadlineDay(selected?.task.createdAt);
  const end = deadlineDay(selected?.task.deadline);

  function selectAgenda(scope: string, href: string | null = null) {
    setHover(null);
    setQuery("");
    setAgenda(scope);
    setSelectedHref(href);
  }

  function revealAgenda(scope: string, href: string | null = null) {
    selectAgenda(scope, href);
    if (window.matchMedia("(max-width: 1050px)").matches) {
      requestAnimationFrame(() => details.current?.scrollIntoView({ block: "start" }));
    }
  }

  function moveMonth(change: number) {
    const next = new Date(year, monthIndex + change, 1, 12);
    const nextMonth = taskDeadlineInput(next.toISOString()).slice(0, 7);
    setMonth(nextMonth);
    if (!selected) selectAgenda(nextMonth === today.slice(0, 7) ? today : `${nextMonth}-01`);
  }

  return <section className="panel dashboard-task-calendar" aria-labelledby="dashboard-calendar-title">
    <header className="task-calendar-header">
      <div>
        <h2 id="dashboard-calendar-title">{workspaceWide ? "Workspace task calendar" : "My task calendar"}</h2>
      </div>
      <div className="task-calendar-header-actions">
        <Link className="text-link" href="/work">Open Tasks <ArrowRight size={14} /></Link>
      </div>
    </header>
    <div className="task-calendar-layout">
      <div className="task-calendar-month">
        <div className="task-calendar-toolbar" onMouseEnter={() => setHover(null)}>
          <div role="group" aria-label="Calendar month">
            <button type="button" className="button button-quiet" aria-label="Previous task month" onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button>
            <strong aria-live="polite">{monthLabel}</strong>
            <button type="button" className="button button-quiet" aria-label="Next task month" onClick={() => moveMonth(1)}><ChevronRight size={16} /></button>
          </div>
          <div role="group" aria-label="Selected date">
            <button type="button" className="button button-quiet" aria-label="Previous day" onClick={() => moveDay(-1)}><ChevronLeft size={14} /></button>
            <span aria-live="polite">{new Date(`${agenda}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            <button type="button" className="button button-quiet" aria-label="Next day" onClick={() => moveDay(1)}><ChevronRight size={14} /></button>
            <button type="button" className="button button-quiet" onClick={() => { setMonth(today.slice(0, 7)); selectAgenda(today); }}>Today</button>
          </div>
        </div>
        <div className="task-calendar-grid" role="group" aria-label={`Task activity for ${monthLabel}`}>
          {weekdays.map(weekday => <span key={weekday} className="task-calendar-weekday" aria-hidden="true">{weekday}</span>)}
          {Array.from({ length: offset }, (_, index) => <div key={`blank-${index}`} className="task-calendar-blank" aria-hidden="true" />)}
          {Array.from({ length: days }, (_, index) => {
            const number = index + 1;
            const date = `${month}-${String(number).padStart(2, "0")}`;
            const entries = tasksByDay.get(date) ?? [];
            let range: string | undefined;
            if (selected) {
              if (date === start || date === end) range = eventLabel(selected, date);
              else if (start && end && start < date && date < end) range = "Task span";
            }
            return <div data-event={range} key={date} className="task-calendar-day" data-selected={agenda === date}>
              <button type="button" className="task-calendar-date"
                aria-label={`${dayFormat.format(new Date(`${date}T00:00:00`))}${range ? ", " + selected?.task.title + ", " + range : ""}, ${entries.length} ${entries.length === 1 ? "task" : "tasks"}`}
                aria-current={date === today ? "date" : undefined} aria-pressed={agenda === date} onClick={() => revealAgenda(date)}>
                {number}
              </button>
              {entries.slice(0, 2).map(entry => {
                const href = taskHref(entry);
                return <button type="button" className="task-calendar-entry" key={href}
                  onMouseEnter={event => showPreview(entry, event.currentTarget)} onMouseLeave={() => setHover(null)}
                  onFocus={event => showPreview(entry, event.currentTarget)} onBlur={() => setHover(null)}
                  onKeyDown={event => { if (event.key === "Escape") setHover(null); }} data-event={eventLabel(entry, date)} aria-label={`${entry.task.title}, ${eventLabel(entry, date)}`}
                  aria-pressed={agenda === date && selectedHref === href} onClick={() => revealAgenda(date, href)}><span>{entry.task.title}</span></button>;
              })}
              {entries.length > 2 && <button type="button" className="task-calendar-more" onClick={() => revealAgenda(date)}>+{entries.length - 2} more</button>}
            </div>;
          })}
        </div>
      </div>
      <aside ref={details} className="task-calendar-sidebar" aria-label="Calendar task details">
        <div className="calendar-day-heading">
          <h3 aria-live="polite">{agendaTitle}</h3>

        </div>
        {!selected && agendaTasks.length > 1 && <input type="search" aria-label="Search tasks on this day" placeholder="Search this day’s tasks" value={query} onChange={event => setQuery(event.target.value)} />}
        {!selected && agendaTasks.length > 0 && !visibleTasks.length && <p>No matching tasks.</p>}
        {!selected && (agendaTasks.length ? <ul className="task-calendar-agenda">{visibleTasks.map(entry => {
          const href = taskHref(entry);
          return <li key={href}><button type="button" className="task-calendar-agenda-task" data-event={eventLabel(entry, agenda)} aria-label={`${entry.task.title}, ${eventLabel(entry, agenda)}, ${entry.projectTitle}`} aria-pressed={selectedHref === href}
            onClick={() => setSelectedHref(href)}>
              <strong>{entry.task.title}</strong>
              <small>{entry.projectTitle}</small>
            </button></li>;
        })}</ul> : <p>No tasks added or due on this date.</p>)}
        {selected && <div className="task-calendar-detail" aria-live="polite">
          <button type="button" className="button button-quiet" onClick={() => { setMonth(agenda.slice(0, 7)); setSelectedHref(null); }}>← Back to day’s tasks</button>
          <h4>{selected.task.title}</h4>
          <p className="calendar-task-summary">{statusLabels[selected.task.status] ?? selected.task.status} · {selected.task.priority} {({P1:"Critical",P2:"High",P3:"Normal",P4:"Low"})[selected.task.priority]} priority</p>
          {selected.task.description && <p className="task-calendar-description">{selected.task.description}</p>}
          <dl>
            {selected.organization && <div><dt>Organization</dt><dd>{selected.organization}</dd></div>}
            <div><dt>Project</dt><dd>{selected.projectTitle}</dd></div>
            {deadlineDay(selected.task.createdAt) && <div><dt>Added</dt><dd><time dateTime={selected.task.createdAt}>{deadlineLabel(selected.task.createdAt)}</time></dd></div>}
            <div><dt>Deadline</dt><dd>{selected.task.deadline && deadlineDay(selected.task.deadline) ? <time dateTime={selected.task.deadline}>{deadlineLabel(selected.task.deadline)}</time> : "No deadline"}</dd></div>
            
            
            <div><dt>Assigned to</dt><dd>{getTaskAssigneeLabel(selected.task) || "Unassigned"}</dd></div>
          </dl>
          <Link className="text-link" href={taskHref(selected)}>Open task <ArrowRight size={14} /></Link>
        </div>}
      </aside>
    </div>
    {hover && <div className="calendar-task-preview" role="tooltip" style={{left:hover.x,top:hover.y}}>
      <strong>{hover.entry.task.title}</strong><span>{hover.entry.projectTitle}</span>{hover.entry.organization && <small>{hover.entry.organization}</small>}
    </div>}
  </section>;
}
