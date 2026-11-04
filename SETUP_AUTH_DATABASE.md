# Supabase setup

The workspace uses Supabase Auth and PostgreSQL with Administrator, Employee, and Client roles.

1. Configure `.env.local` using the variable names in `.env.example`. `SUPABASE_SERVICE_ROLE_KEY` is server-only; never prefix it with `NEXT_PUBLIC_`.
2. Disable public sign-up in Supabase Authentication when accounts are administrator-managed.
3. For the main database, run all of `supabase/main-database.sql` in the Supabase SQL editor. It contains the schema, role policies, functions, and updates in dependency order inside one transaction. It supports fresh installation and reapplication to an existing application database while retaining records. Review any schema customizations made outside this repository before applying it.
4. For a fresh, separate testing project, use `supabase/testing-database.sql` instead. It is generated from the main script and refuses to run over existing application tables. Follow [TESTING_DATABASE.md](TESTING_DATABASE.md) for the testing environment setup.
5. Set `NEXT_PUBLIC_ADMIN_EMAIL` to the intended administrator's verified email. The server bootstraps that account only when no administrator exists. Browser metadata cannot grant a role.
6. Start the app with `pnpm dev` and sign in. Administrators manage accounts through Users and choose the initial password during account creation.

The main script includes a workspace reliability section and preserves existing records. It adds revision checks, atomic graph saves, database number allocation, scoped proposal response functions, attendance records, and project conversations. Direct browser writes to the workspace graph are revoked so every write passes the transaction and revision checks. It can be rerun.

The employee role section scopes employee project, task, and link reads to assigned work; allows employees to update only their own task progress and add or edit the staging link on assigned projects; and provides read-only client data through assigned project workspaces. Employees cannot access Leads, Clients, Users, Retainers, Proposals, or Invoices pages. Admins retain full workspace management. The migration backfills existing project assignments by matching member display names and email names; review assignments where those names do not match.

The main script includes the employee/client RLS fix and the reviews policies. These remove policy recursion, scope project messages to visible projects, and ensure submitted reports start open without an administrator note.

The Reviews page lets admins and employees submit bug and issue reports. Employees can see only their own reports; admins can review all reports, add follow-up notes, and track them as open, in progress, or resolved. The main script creates the table and role policies.

If the reliability functions are missing, apply the main script and reload before operational use. Applying SQL to a remote deployment is a separate step; starting the development server does not apply it.

Supabase is the persistent source of truth. Browser state is an in-memory working copy that is cleared when identity changes. A failed save remains visible with retry and reload controls. Conflicting edits require reloading the latest records; they do not overwrite another session's work. Retrying the same request after a lost response is idempotent.

Client records are linked to verified accounts by their email address. Client queries are constrained by database row policies. Public proposal links use a server endpoint that returns one proposal and atomically validates responses, status, and expiry. Service credentials remain on the server.

After upgrading, verify a lead edit survives reload, generate one invoice and one project number, open a proposal link in a signed-out browser, and verify a client account sees only its linked projects. Resolve any save errors before closing the app. Number reservations can have gaps when a form is abandoned or a subsequent save fails; numbers are never reused.

Attachments currently use data URLs with a 1.2 MB form limit. Moving them to private Supabase Storage remains a separate storage migration.

## QR attendance

The QR attendance section is included in the main script. It adds settings, expiring QR challenges, visit sessions, daily summary provenance, an append-only attendance audit, and restricted database functions. It does not need another environment variable or the service-role key.

The office timezone defaults to `Asia/Kolkata`. Before first use, set the office name and IANA timezone in SQL if needed:

```sql
update public.attendance_settings
set office_name = 'Main office', timezone = 'Asia/Kolkata'
where id = true;
```

Use the deployed app's HTTPS address, accessible from employees' phones. As an administrator, open **Attendance → Display office QR** on a screen at the office. Codes expire after 60 seconds and refresh automatically while the screen is open. Employees can open **Attendance → Scan attendance** to start the camera, or use their phone camera to scan the office QR. Scanning records check-in when the employee has no open visit and check-out when they do; there is no separate confirmation step. In-app scanning decodes the QR locally, accepts only attendance links from this workspace, and pauses the camera when the scanner closes or the app goes into the background. Camera access requires HTTPS (localhost is allowed for development). Each signed-in employee sees their own profile, current visit state, and completed visit totals for the selected period. Administrators can filter team visits without changing whose attendance a scan records. A code may expire during sign-in; scan the current code again. QR generation is local to the app and does not send attendance tokens to an external image service.

Employees can read their own visit sessions and daily summaries; administrators can read the team and attendance audit entries, with older changes available through the change list. QR issuance is admin-only. The scan function derives identity from Supabase Auth and time from the database, validates membership and expiry, serializes changes per employee, and prevents multiple open visits. Repeating a recorded action with the same QR returns the original visit even after expiry, so a lost response can be recovered without a second write. New actions always require a valid QR. A new arrival after a completed visit requires a QR that has not already been used for that employee's arrival.

Hours are the sum of completed office visits, rounded to two decimals. A currently open visit contributes no duration. Visits cannot span office dates: a forgotten checkout is shown as **Missing checkout** and an admin must supply the actual departure and a reason via **Correct departure** before the employee can start another visit. The correction form accepts the administrator device's local time; saved timestamps display in the office timezone. Schedule, breaks, late arrival, overtime, holidays and automatic half-day rules are not inferred from scans.

The existing Team performance form remains available for manual daily summaries and requires a note or correction reason. These summaries take precedence over QR-derived hours, including after later scans or departure corrections. Session history and audit records remain available separately. Audit entries retain before/after values and the authenticated actor. Correction reasons are enforced by the database, and departures cannot be corrected to overlap another visit. Team performance shows arrival, departure, completed visit hours, daily hours, and missing checkouts separately.

A rotating QR reduces reuse of old screenshots but does not enforce physical presence: a live code can still be forwarded. This version does not enforce office IP or phone location. Never distribute the administrator's signed-in office-display browser session to employees.

Verify using separate admin and employee accounts: display a QR, scan and confirm arrival, scan again to confirm departure, inspect the summary, and verify a client cannot use attendance. Automated database tests cover expiry, role isolation, repeated submissions, manual overrides, and missing-checkout corrections.

## Client project portal

The main script includes the current client portal policies and functions. Clients see only projects linked through `clients.client_user_id` to their signed-in account, task completion counts, assigned team names and roles, and client-visible task details. The portal excludes proposals, invoices, messages, links, and internal project details. Direct client reads of these tables are removed; `read_client_projects()` returns only the permitted summary and derives identity from Supabase Auth. Account settings remain available for managing sign-in details.

## Project status

The main script enables the On track and AMC statuses. Each project has a Project status tab immediately before Messages. Admins can move the project between Active, On track, Completed, and AMC. Employees can view the status but cannot change it. Task visibility does not depend on project completion, so assigned tasks from completed projects remain available on Tasks and the dashboard.

Selecting AMC opens retainer setup when a linked plan does not exist. Saving the plan persists the project AMC status and retainer together, then opens Retainers. Admin project listings exclude AMC projects. Employees retain access to their assigned project workspaces and tasks. Existing AMC projects without a plan can use Add retainer plan in Project status.

The project assignment section is included in the main script. Assigning a task changes an Active project to On track; completed and AMC projects keep their status. Existing Active projects with assigned tasks are updated once. Progress-only task updates do not change the project status.

Retainers support Edit plan for commercial terms and start dates. The available durations are Monthly (1 month), Quarterly (3 months), and Annual (12 months), regardless of plan model. Month-end and leap-day anniversaries clamp to the last valid target date. Existing custom end dates are preserved unless the start date or cycle changes. Legacy one-time records have no recurring term; editing one requires selecting Monthly, Quarterly, or Annual. Existing plans without an end date show the calculated date; new and edited plans persist it in the existing `period_end` column. No additional migration is needed.
