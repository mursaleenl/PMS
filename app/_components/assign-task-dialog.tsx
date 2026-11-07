"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAssignableUsers } from "@/lib/assignees";
import { createUuid } from "@/lib/uuid";
import { readProjects, updateProject, getProjectDisplayTitle, getProjectDisplayServices, type Project, type ProjectWorkItem } from "@/lib/projects";
import { flushWorkspaceChanges } from "@/lib/workspace-sync";

export function AssignTaskDialog({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { users, loading } = useAssignableUsers();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (!pending.current) {
        const project = readProjects().find(item => item.id === data.get("project"));
        const assignee = users.find(item => item.id && item.id === data.get("assignee"));
        const title = String(data.get("title") || "").trim();
        if (!project || !projects.some(item => item.id === project.id)) throw new Error("Choose a project.");
        if (!assignee) throw new Error("Choose an assignee from the workspace directory.");
        if (!title) throw new Error("Enter a task title.");
        const task: ProjectWorkItem = {
          id: createUuid(), title, assignee: assignee.name, assigneeId: assignee.id,
          kind: String(data.get("kind")) as ProjectWorkItem["kind"],
          priority: String(data.get("priority")) as ProjectWorkItem["priority"],
          estimatedHours: Number(data.get("estimatedHours") || 0), loggedHours: 0,
          createdAt: new Date().toISOString(), status: "TO_DO",
        };
        updateProject(project.id, {workItems: [task, ...(project.workItems ?? [])]});
        pending.current = true;
      }
      await flushWorkspaceChanges(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not assign the task."); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="assign-task-dialog" aria-labelledby="assign-task-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <header><h2 id="assign-task-title">Assign task</h2><button className="icon-button" type="button" aria-label="Close task form" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <p>Choose a project and assign work to your team.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy || pending.current}>
        <label className="field required">Project<select name="project" required defaultValue=""><option value="" disabled>Select a project</option>{projects.map(project => <option key={project.id} value={project.id}>{getProjectDisplayTitle(project)} - {getProjectDisplayServices(project) || project.id}</option>)}</select></label>
        <label className="field required">Task title<textarea name="title" required rows={3} maxLength={1000} placeholder="Describe the work to be done" /></label>
        <label className="field required">Assignee<select name="assignee" required defaultValue="" disabled={loading}><option value="" disabled>{loading ? "Loading team…" : "Select a team member"}</option>{users.filter(user => user.id).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label className="field">Task type<select name="kind" defaultValue="FEATURE_DEV"><option value="FEATURE_DEV">Feature / development</option><option value="CLIENT_FEEDBACK_TODO">Client feedback</option><option value="QA_BUG">QA / bug</option></select></label>
        <div className="assign-task-columns"><label className="field">Priority<select name="priority" defaultValue="P3"><option value="P1">Critical</option><option value="P2">High</option><option value="P3">Normal</option><option value="P4">Low</option></select></label><label className="field">Estimated hours<input name="estimatedHours" type="number" min="0" step="0.25" defaultValue="0" /></label></div>
      </fieldset>
      {!projects.length && <p>No projects available. Create a project first.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button-quiet" disabled={busy} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || loading || !projects.length}>{busy ? "Saving…" : pending.current ? "Retry saving" : "Assign task"}</button></div>
    </form>
  </dialog>;
}
