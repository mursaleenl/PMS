"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ProjectLogoUpload } from "@/app/_components/project-logo";
import { X } from "lucide-react";
import { addProject, createInternalProject, type Project } from "@/lib/projects";
import { useAssignableUsers } from "@/lib/assignees";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";
import { CalendarPicker } from "@/app/_components/calendar-picker";

export function InternalProjectDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (project: Project) => void }) {
  const { users } = useAssignableUsers();
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Project | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    form.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => previous?.focus();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const managerId = String(data.get("manager") || "");
    const manager = users.find(person => person.id === managerId && person.role === "project_manager");
    if (managerId && !manager) { setError("Select a user with the Project Manager role."); return; }
    setBusy(true); setError("");
    try {
      if (!pending.current) {
        pending.current = await createInternalProject({
          title: String(data.get("title") || ""), description: String(data.get("description") || ""),
          startDate: String(data.get("startDate") || ""),
          objectives: String(data.get("objectives") || ""), priority: String(data.get("priority") || "Normal") as Project["priority"],
          team: [
            ...(manager ? [{ role: "Project Manager" as const, name: manager.name, userId: manager.id, allocationPercent: 0 }] : []),
            ...users.filter(person => person.id && person.id !== managerId && data.getAll("team").includes(person.id)).map(person => ({role: "Supporting team member" as const, name: person.name, userId: person.id, allocationPercent: 0})),
          ],
        });
        pending.current.logoDataUrl = logoDataUrl;
        addProject(pending.current);
      }
      await flushWorkspaceChanges();
      onCreated(pending.current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The project could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="task-drawer-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }} onKeyDown={event => {
    if (event.key === "Escape" && !busy) onClose();
    if (event.key === "Tab") {
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <aside className="task-dispatch-drawer post-sale-drawer internal-project-drawer" role="dialog" aria-modal="true" aria-labelledby="internal-project-title">
      <header><h2 id="internal-project-title">New internal project</h2><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="Close form"><X size={18} /></button></header>
      <p>Organize internal work with tasks, a project manager, messages, and project links.</p>
      <form ref={form} onSubmit={submit}>
        <fieldset disabled={busy || Boolean(pending.current)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <ProjectLogoUpload value={logoDataUrl} onChange={setLogoDataUrl} />
          <label className="field required">Project name<input name="title" required maxLength={200} /></label>
          <label className="field">Description<textarea name="description" rows={5} placeholder="What are we working on?" /></label>
          <label className="field">Objectives<textarea name="objectives" rows={3} placeholder="What should this project achieve?" /></label>
          <label className="field">Priority<select name="priority" defaultValue="Normal"><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></label>
          <label className="field">Start date<CalendarPicker name="startDate" /></label>
          <label className="field">Project manager<select name="manager" defaultValue=""><option value="">Unassigned</option>{users.filter(person => person.id && person.role === "project_manager").map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <div className="internal-project-team"><h3>Team members</h3><p>Select the people working on this project.</p>{users.filter(person => person.id).map(person => <label key={person.id}><input type="checkbox" name="team" value={person.id} />{person.name}</label>)}</div>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button className="button button-quiet" type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : pending.current ? "Retry saving" : "Create internal project"}</button></div>
      </form>
    </aside>
  </div>;
}
