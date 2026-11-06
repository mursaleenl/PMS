"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Plus, ShieldCheck, Trash2, User, UserRoundPlus, X } from "lucide-react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import { RoleIcon } from "@/app/_components/role-icon";
import type { WorkspaceRole } from "@/lib/roles";

type WorkspaceMember = {
  id: string;
  email: string;
  role: WorkspaceRole;
  display_name?: string | null;
  user_id?: string | null;
  created_at: string;
};

function readError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function roleLabel(role: WorkspaceRole) {
  if (role === "admin") return "Admin";
  if (role === "project_manager") return "Project Manager";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function joinedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "2-digit", year: "numeric" }).format(date);
}

export default function UsersPage() {
  const { role: workspaceRole, members, provisionUser, updateMemberAccount, removeMember, user } = useWorkspaceAuth();
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { setShowPassword(false); }, [showAddUser]);
  const [accessRole, setAccessRole] = useState<WorkspaceRole>("employee");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [showEditingPassword, setShowEditingPassword] = useState(false);
  const [editingRole, setEditingRole] = useState<WorkspaceRole>("employee");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowAddUser(false);
        setEditingMember(null);
      }
    }
    if (showAddUser || editingMember) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [showAddUser, editingMember]);

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await provisionUser(name, email, initialPassword, accessRole);
      setMessage(`${name} was added as ${roleLabel(accessRole)}.`);
      setShowAddUser(false);
      setName("");
      setEmail("");
      setInitialPassword("");
      setAccessRole("employee");
    } catch (error) {
      setMessage(readError(error, "Unable to add this user."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMember) return;
    setBusy(true);
    setMessage("");
    try {
      await updateMemberAccount(editingMember.id, editingRole, editingEmail, editingPassword);
      setEditingPassword("");
      setMessage(`Updated account for ${editingMember.display_name || editingMember.email}.`);
      setEditingMember(null);
    } catch (error) {
      setMessage(readError(error, "Unable to update this account."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMember(id: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} and disable their workspace account?`)) return;
    setBusy(true);
    setMessage("");
    try {
      await removeMember(id);
      setMessage(`${memberName} was removed.`);
    } catch (error) {
      setMessage(readError(error, "Unable to remove this user."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-content users-page settings-page">
      <section className="welcome-row">
        <div>
          <h1>Users</h1>
          <p className="welcome-subtitle">Manage user accounts, roles, and workspace access.</p>
        </div>
        {workspaceRole === "admin" && (
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setMessage("");
              setShowAddUser(true);
            }}
          >
            <UserRoundPlus size={16} />
            Add user
          </button>
        )}
      </section>

      <section className="settings-section user-management-section">
        {workspaceRole !== "admin" ? (
          <div className="access-bootstrap">
            <ShieldCheck size={18} />
            <div>
              <strong>Admin access required</strong>
              <p>Only administrators can manage workspace users.</p>
            </div>
          </div>
        ) : (
          <div className="user-management-table-wrap">
            <table className="user-management-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const memberName = member.display_name?.trim() || member.email.split("@")[0];
                  return (
                    <tr key={member.id}>
                      <td>
                        <strong>{memberName}</strong>
                        {member.email && <div className="user-table-email">{member.email}</div>}
                      </td>
                      <td>
                        <span className={`user-role-badge user-role-${member.role}`}>
                          <RoleIcon role={member.role} size={15} />
                          {roleLabel(member.role)}
                        </span>
                      </td>
                      <td>{joinedDate(member.created_at)}</td>
                      <td className="user-management-actions">
                        <button
                          className="button button-quiet"
                          type="button"
                          onClick={() => {
                            setEditingMember(member);
                            setEditingRole(member.role);
                            setEditingEmail(member.email);
                            setEditingPassword("");
                            setShowEditingPassword(false);
                            setMessage("");
                          }}
                        >
                          Edit account
                        </button>
                        <button
                          className="user-remove-button"
                          type="button"
                          aria-label={`Remove ${memberName}`}
                          disabled={busy || member.user_id === user?.id}
                          onClick={() => void deleteMember(member.id, memberName)}
                          title={`Remove ${memberName}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={4} className="user-management-empty">
                      No users have been added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {message && <p className="settings-inline-message" role="status">{message}</p>}
      </section>

      {/* POPUP MODAL: Add User */}
      {mounted && showAddUser && typeof document !== "undefined" && createPortal(
        <div
          className="user-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowAddUser(false);
          }}
        >
          <section className="user-modal-card" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
            <div className="user-modal-heading">
              <div>
                <span className="section-kicker">WORKSPACE ACCESS</span>
                <h2 id="add-user-title">Add a user</h2>
                <p>Create a sign-in and assign a workspace role.</p>
              </div>
              <button type="button" aria-label="Close add user" onClick={() => setShowAddUser(false)}>
                <X size={20} />
              </button>
            </div>
            <form className="add-user-form" onSubmit={saveMember}>
              <label className="field">
                Full name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                />
              </label>
              <label className="field">
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="person@company.com"
                />
              </label>
              <div className="field">
                <label htmlFor="add-user-password">Initial password</label>
                <div className="add-user-password-control">
                <input
                  id="add-user-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={initialPassword}
                  onChange={(event) => setInitialPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
                <button className="button button-quiet" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} aria-controls="add-user-password" onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
                </div>
                <small>{accessRole === "employee" ? "Password changes are managed by an administrator." : "The user can change this password in Account settings."}</small>
              </div>
              <label className="field">
                Role
                <select
                  value={accessRole}
                  onChange={(event) => setAccessRole(event.target.value as WorkspaceRole)}
                >
                  <option value="admin">Admin</option>
                  <option value="employee">Employee</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="client">Client</option>
                </select>
              </label>
              {message && <p className="form-error" role="alert">{message}</p>}
              <div className="user-modal-actions">
                <button className="button button-quiet" type="button" onClick={() => setShowAddUser(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={busy}>
                  <Plus size={15} />
                  {busy ? "Adding user…" : "Add user"}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}

      {/* POPUP MODAL: Change Role / Edit User */}
      {mounted && editingMember && typeof document !== "undefined" && createPortal(
        <div
          className="user-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingMember(null);
          }}
        >
          <section className="user-modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
            <div className="user-modal-heading">
              <div>
                <span className="section-kicker">WORKSPACE ACCESS</span>
                <h2 id="edit-user-title">Edit account</h2>
                <p>Update the sign-in email, password, and workspace role.</p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={() => setEditingMember(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="edit-user-info-card">
              <div className="edit-user-icon-badge">
                <User size={18} />
              </div>
              <div className="edit-user-details">
                <div className="edit-user-title-row">
                  <strong>{editingMember.display_name?.trim() || editingMember.email.split("@")[0]}</strong>
                  <span className={`user-role-badge user-role-${editingMember.role}`}>
                    <RoleIcon role={editingMember.role} size={15} />
                    {roleLabel(editingMember.role)}
                  </span>
                </div>
                <span className="edit-user-email">{editingMember.email}</span>
                <small>Joined {joinedDate(editingMember.created_at)}</small>
              </div>
            </div>

            <form className="edit-user-form" onSubmit={handleRoleUpdate}>
              <label className="field">
                Email address
                <input type="email" required autoComplete="off" disabled={!editingMember.user_id || busy} value={editingEmail} onChange={event => setEditingEmail(event.target.value)} />
              </label>
              <div className="field">
                <label htmlFor="edit-user-password">New password</label>
                <div className="add-user-password-control">
                  <input id="edit-user-password" type={showEditingPassword ? "text" : "password"} minLength={8} autoComplete="new-password" disabled={!editingMember.user_id || busy} value={editingPassword} onChange={event => setEditingPassword(event.target.value)} placeholder="Leave blank to keep current password" />
                  <button className="button button-quiet" type="button" aria-label={showEditingPassword ? "Hide new password" : "Show new password"} aria-pressed={showEditingPassword} aria-controls="edit-user-password" onClick={() => setShowEditingPassword(value => !value)}>
                    {showEditingPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <small>{editingMember.user_id ? "Use at least 8 characters. Saving changes requires the user to sign in again." : "No sign-in account is linked to this membership. Only its role can be changed."}</small>
              </div>
              <label className="field">
                Select role
                <select
                  value={editingRole}
                  onChange={(event) => setEditingRole(event.target.value as WorkspaceRole)}
                >
                  <option value="admin">Admin — Full workspace access & settings</option>
                  <option value="employee">Employee — Assigned projects and tasks</option>
                  <option value="project_manager">Project Manager — Assigned projects and tasks</option>
                  <option value="client">Client — Client portal access only</option>
                </select>
              </label>

              {message && <p className="form-error" role="alert">{message}</p>}

              <div className="user-modal-actions">
                <button
                  className="button button-quiet"
                  type="button"
                  onClick={() => setEditingMember(null)}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy || (editingRole === editingMember.role && editingEmail.trim().toLowerCase() === editingMember.email && !editingPassword)}
                >
                  {busy ? "Updating…" : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
