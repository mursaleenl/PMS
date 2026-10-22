import { UserProfile } from "@clerk/nextjs";

export default function SettingsPage() {
  return <div className="page-content settings-page">
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>Account settings</h2>
        <p>Update your profile, email addresses, password, and security options.</p>
      </div>
      <div className="settings-profile">
        <UserProfile routing="hash" />
      </div>
    </section>
  </div>;
}
