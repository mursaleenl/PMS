"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { useWorkspaceAuth } from "@/lib/workspace-auth";
import type { WorkspaceRole } from "@/lib/roles";

function readError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function roleLabel(role: WorkspaceRole) {
  if (role === "admin") return "Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function SettingsPage() {
  const { role: workspaceRole, updatePassword, user, mustChangePassword } = useWorkspaceAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    if (password.length < 8) {
      setPasswordMessage("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage("The passwords do not match.");
      return;
    }
    try {
      await updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated successfully.");
    } catch (error) {
      setPasswordMessage(readError(error, "Unable to update the password."));
    }
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Workspace user";

  return (
    <div className="page-content settings-page">
      <section className="welcome-row">
        <div>
          <h1>Account settings</h1>
          <p className="welcome-subtitle">Manage your profile, sign-in email, password, and security options.</p>
        </div>
      </section>

      <div className="settings-cards-stack">
        <div className="account-settings-card">
          <div className="account-card-header">
            <div className="account-user-meta">
              <strong className="account-user-name">{userName}</strong>
              <span className="account-user-email">{user?.email}</span>
            </div>
            <span className={`user-role-badge user-role-${workspaceRole}`}>
              {roleLabel(workspaceRole)}
            </span>
          </div>
        </div>

        <form className="password-change-card" onSubmit={changePassword}>
          <div className="password-card-header">
            <div className="password-card-title-row">
              <KeyRound size={16} className="password-header-icon" />
              <h3>{mustChangePassword ? "Set a new password to continue" : "Change password"}</h3>
            </div>
            <p className="password-card-subtitle">
              Ensure your account is using a secure password with at least 8 characters.
            </p>
          </div>

          <div className="password-fields-grid">
            <label className="field">
              <span className="field-label">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
            </label>
            <label className="field">
              <span className="field-label">Confirm new password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
              />
            </label>
          </div>

          <div className="password-card-footer">
            <button className="button button-primary settings-submit-button" type="submit">
              Update password <ArrowRight size={14} />
            </button>
            {passwordMessage && (
              <p
                className={`settings-inline-message ${
                  passwordMessage.includes("successfully") ? "is-success" : "is-error"
                }`}
                role="status"
              >
                {passwordMessage}
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
