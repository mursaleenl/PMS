"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Plus, ShieldCheck, Trash2, UserRoundPlus, X } from "lucide-react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import type { WorkspaceRole } from "@/lib/roles";

function readError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function roleLabel(role: WorkspaceRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function joinedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

export default function SettingsPage() {
  const { role: workspaceRole, members, provisionUser, updateMemberRole, removeMember, updatePassword, user, mustChangePassword } = useWorkspaceAuth();
  const [showAddUser, setShowAddUser] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [accessRole, setAccessRole] = useState<WorkspaceRole>("employee");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<WorkspaceRole>("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await provisionUser(name, email, initialPassword, accessRole);
      setMessage(`${name} was added as ${roleLabel(accessRole)}.`);
      setShowAddUser(false); setName(""); setEmail(""); setInitialPassword(""); setAccessRole("employee");
    } catch (error) { setMessage(readError(error, "Unable to add this user.")); }
    finally { setBusy(false); }
  }

  async function saveRole(id: string) {
    setBusy(true); setMessage("");
    try { await updateMemberRole(id, editingRole); setEditingMemberId(null); setMessage("User role updated."); }
    catch (error) { setMessage(readError(error, "Unable to update the role.")); }
    finally { setBusy(false); }
  }

  async function deleteMember(id: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} and disable their workspace account?`)) return;
    setBusy(true); setMessage("");
    try { await removeMember(id); setMessage(`${memberName} was removed.`); }
    catch (error) { setMessage(readError(error, "Unable to remove this user.")); }
    finally { setBusy(false); }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordMessage("");
    if (password.length < 8) { setPasswordMessage("Use at least 8 characters for your new password."); return; }
    if (password !== confirmPassword) { setPasswordMessage("The passwords do not match."); return; }
    try {
      await updatePassword(password);
      setPassword(""); setConfirmPassword(""); setPasswordMessage("Password updated successfully.");
    } catch (error) { setPasswordMessage(readError(error, "Unable to update the password.")); }
  }

  return <div className="page-content settings-page">
    <section className="settings-section">
      <div className="settings-section-heading"><h2>Account settings</h2><p>Manage your profile, sign-in email, password, and security options.</p></div>
      <div className="settings-profile"><div className="account-settings-card"><strong>{user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Workspace user"}</strong><span>{user?.email}</span></div></div>
      <form className="password-change-form" onSubmit={changePassword}>
        <div className="password-change-heading"><KeyRound size={18} /><strong>{mustChangePassword ? "Set a new password to continue" : "Change password"}</strong></div>
        <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
        <label className="field">Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        <button className="button button-primary" type="submit">Update password <ArrowRight size={14} /></button>
        {passwordMessage && <p className="settings-inline-message" role="status">{passwordMessage}</p>}
      </form>
    </section>

    <section className="settings-section user-management-section" id="user-management">
      <div className="user-management-heading"><div><span className="section-kicker">WORKSPACE ACCESS</span><h2>User management</h2><p>Manage user accounts, roles, and workspace access.</p></div>{workspaceRole === "admin" && <button className="button button-primary" type="button" onClick={() => { setMessage(""); setShowAddUser(true); }}><UserRoundPlus size={16} />Add user</button>}</div>
      {workspaceRole !== "admin" ? <div className="access-bootstrap"><ShieldCheck size={18} /><div><strong>Administrator access required</strong><p>Only administrators can manage workspace users.</p></div></div> : <div className="user-management-table-wrap"><table className="user-management-table"><thead><tr><th>Name</th><th>Role</th><th>Joined</th><th aria-label="Actions" /></tr></thead><tbody>{members.map((member) => {
        const memberName = member.display_name?.trim() || "No name set";
        const editing = editingMemberId === member.id;
        return <tr key={member.id}><td><strong>{memberName}</strong></td><td>{editing ? <select aria-label={`Role for ${memberName}`} value={editingRole} onChange={(event) => setEditingRole(event.target.value as WorkspaceRole)}><option value="admin">Administrator</option><option value="employee">Employee</option><option value="client">Client</option></select> : <span className={`user-role-badge user-role-${member.role}`}><ShieldCheck size={14} />{roleLabel(member.role)}</span>}</td><td>{joinedDate(member.created_at)}</td><td className="user-management-actions">{editing ? <><button className="button button-quiet" type="button" disabled={busy} onClick={() => void saveRole(member.id)}>Save</button><button className="user-cancel-edit" type="button" aria-label="Cancel role change" onClick={() => setEditingMemberId(null)}><X size={17} /></button></> : <><button className="button button-quiet" type="button" onClick={() => { setEditingMemberId(member.id); setEditingRole(member.role); }}>Change role</button><button className="user-remove-button" type="button" aria-label={`Remove ${memberName}`} disabled={busy || member.user_id === user?.id} onClick={() => void deleteMember(member.id, memberName)}><Trash2 size={17} /></button></>}</td></tr>;
      })}{members.length === 0 && <tr><td colSpan={4} className="user-management-empty">No users have been added yet.</td></tr>}</tbody></table></div>}
      {message && <p className="settings-inline-message" role="status">{message}</p>}
    </section>

    {showAddUser && <div className="user-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddUser(false); }}><section className="user-modal-card" role="dialog" aria-modal="true" aria-labelledby="add-user-title"><div className="user-modal-heading"><div><span className="section-kicker">WORKSPACE ACCESS</span><h2 id="add-user-title">Add a user</h2><p>Create a sign-in and assign a workspace role.</p></div><button type="button" aria-label="Close add user" onClick={() => setShowAddUser(false)}><X size={20} /></button></div><form className="add-user-form" onSubmit={saveMember}><label className="field">Full name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" /></label><label className="field">Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" /></label><label className="field">Initial password<input type="password" required minLength={8} autoComplete="new-password" value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} placeholder="At least 8 characters" /><small>The user can change this password in Account settings.</small></label><label className="field">Role<select value={accessRole} onChange={(event) => setAccessRole(event.target.value as WorkspaceRole)}><option value="admin">Administrator</option><option value="client">Client</option><option value="employee">Employee</option></select></label>{message && <p className="form-error" role="alert">{message}</p>}<div className="user-modal-actions"><button className="button button-quiet" type="button" onClick={() => setShowAddUser(false)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy}><Plus size={15} />{busy ? "Adding user…" : "Add user"}</button></div></form></section></div>}
  </div>;
}
