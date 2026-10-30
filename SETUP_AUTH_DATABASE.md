# Supabase setup

The workspace uses Supabase Auth and PostgreSQL with Administrator, Employee, and Client roles.

1. Configure `.env.local` using the variable names in `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` is server-only; never prefix it with `NEXT_PUBLIC_`.
2. Disable public sign-up in Supabase Authentication when accounts are administrator-managed.
3. For a new database, run `supabase/schema.sql`, then `supabase/workspace-reliability-migration.sql`.
4. For an existing database, run `supabase/production-relational-migration.sql` if the normalized tables are not installed, then `supabase/workspace-reliability-migration.sql`.
5. Set `NEXT_PUBLIC_ADMIN_EMAIL` to the intended administrator's verified email. The server bootstraps that account only when no administrator exists. Browser metadata cannot grant a role.
6. Start the app with `pnpm dev` and sign in. Administrators manage accounts through Users and choose the initial password during account creation.

The reliability migration runs inside a transaction and preserves existing records. It adds revision checks, atomic graph saves, database number allocation, scoped proposal response functions, attendance records, and project conversations. Direct browser writes to the workspace graph are revoked so every write passes the transaction and revision checks. It can be rerun.

The app remains available for preview when the reliability migration is missing. Preview edits are not persisted. Apply the migration and reload before operational use. Applying SQL to a remote deployment is a separate step; starting the development server does not apply it.

Supabase is the persistent source of truth. Browser state is an in-memory working copy that is cleared when identity changes. A failed save remains visible with retry and reload controls. Conflicting edits require reloading the latest records; they do not overwrite another session's work. Retrying the same request after a lost response is idempotent.

Client records are linked to verified accounts by their email address. Client queries are constrained by database row policies. Public proposal links use a server endpoint that returns one proposal and atomically validates responses, status, and expiry. Service credentials remain on the server.

After upgrading, verify a lead edit survives reload, generate one invoice and one project number, open a proposal link in a signed-out browser, and verify a client account sees only its linked projects. Check the save indicator before closing the app. Number reservations can have gaps when a form is abandoned or a subsequent save fails; numbers are never reused.

Attachments currently use data URLs with a 1.2 MB form limit. Moving them to private Supabase Storage remains a separate storage migration.

## QR attendance

After the reliability migration, apply `supabase/qr-attendance-migration.sql` in the Supabase SQL editor. It runs in a transaction and can be rerun. This adds settings, expiring QR challenges, visit sessions, daily summary provenance, an append-only attendance audit, and restricted database functions. It does not need another environment variable or the service-role key.

The office timezone defaults to `Asia/Kolkata`. Before first use, set the office name and IANA timezone in SQL if needed:

```sql
update public.attendance_settings
set office_name = 'Main office', timezone = 'Asia/Kolkata'
where id = true;
```

Use the deployed app's HTTPS address, accessible from employees' phones. As an administrator, open **Attendance → Display office QR** on a screen at the office. Codes expire after 60 seconds and refresh automatically while the screen is open. Employees can open **Attendance → Scan attendance → Start camera**, or use their phone camera, then explicitly confirm check-in or check-out. In-app scanning decodes the QR locally, accepts only attendance links from this workspace, and stops the camera when the scanner closes or the app goes into the background. Camera access requires HTTPS (localhost is allowed for development); a pasted office link is available when camera access is unavailable. Each signed-in employee sees their own profile, current visit state, and completed visit totals for the selected period. Administrators can filter team visits without changing whose attendance a scan records. A code may expire during sign-in; scan the current code again. QR generation is local to the app and does not send attendance tokens to an external image service.

Employees can read their own visit sessions and daily summaries; administrators can read the team and the latest 50 audit entries. QR issuance is admin-only. The scan function derives identity from Supabase Auth and time from the database, validates membership and expiry, serializes changes per employee, and prevents multiple open visits. Repeating a recorded action with the same QR returns the original visit even after expiry, so a lost response can be recovered without a second write. New actions always require a valid QR. A new arrival after a completed visit requires a QR that has not already been used for that employee's arrival.

Hours are the sum of completed office visits, rounded to two decimals. A currently open visit contributes no duration. Visits cannot span office dates: a forgotten checkout is shown as **Missing checkout** and an admin must supply the actual departure and a reason via **Correct departure** before the employee can start another visit. The correction form accepts the administrator device's local time; saved timestamps display in the office timezone. Schedule, breaks, late arrival, overtime, holidays and automatic half-day rules are not inferred from scans.

The existing Team performance form remains available for manual daily summaries and requires a note or correction reason. These summaries take precedence over QR-derived hours, including after later scans or departure corrections. Session history and audit records remain available separately. Audit entries retain before/after values and the authenticated actor. Correction reasons are enforced by the database, and departures cannot be corrected to overlap another visit. Team performance shows arrival, departure, completed visit hours, daily hours, and missing checkouts separately.

A rotating QR reduces reuse of old screenshots but does not enforce physical presence: a live code can still be forwarded. This version does not enforce office IP or phone location. Never distribute the administrator's signed-in office-display browser session to employees.

Verify using separate admin and employee accounts: display a QR, scan and confirm arrival, scan again to confirm departure, inspect the summary, and verify a client cannot use attendance. Automated database tests cover expiry, role isolation, repeated submissions, manual overrides, and missing-checkout corrections.
