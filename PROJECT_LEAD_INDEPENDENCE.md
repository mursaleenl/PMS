# Independent projects and leads

Projects supports direct creation for a new client, a client selected from the database directory, and internal work. The existing From a lead workflow remains available. Direct creation writes no lead, proposal, or invoice.

Project names and contact edits belong to the project. Renaming a project no longer updates the originating lead. Converted projects retain their own title and delivery details.

## Database update

The direct-creation SQL is packaged for the main CLI workflow in `supabase/migrations/20261121064000_independent_project_clients_prerequisite.sql`. It depends on the existing workspace migrations, including shared project clients. The canonical main SQL and generated testing installer also include this update.

The migration adds:

- A manager-only `project_creation_clients()` directory RPC. The creation form requires this RPC before accepting submissions; older installations cannot fall back to inferred client matching.
- Explicit client ID resolution in the existing transactional graph writer. Existing project ownership is retained during edits. Standalone creation requires selecting a client ID or explicitly creating a new client.
- Atomic creation of the new client, project, team, and links, retaining existing revision and request-id checks.
- `clients.require_explicit_portal_link` for clients created through this flow. A matching email, an older provisioning request, or a full schema rerun cannot automatically give an account access to those records.
- An administrator-only `link_client_portal_account(client_id, user_id)` RPC for explicitly linking a new client to an existing client portal account. This is not a new UI flow. Existing client-account links and current role scopes remain unchanged.

New clients have no portal access until explicitly linked. Selecting an existing client intentionally uses that client's current portal access. Project contact email edits do not grant or transfer portal access.

The frontend requires the direct-creation SQL. Apply the reviewed migrations through the repository’s database workflow before deploying the frontend to another environment.

## Project and lead access boundary

Apply `supabase/migrations/20261121064102_project_lead_access_boundary.sql` after the existing independent-project-clients migration and before deploying the application changes.

- Projects use their saved titles, enquiry details, and project-linked invoices. Managers can open the originating lead through an explicit history link. Conversion copies delivery details once and keeps lead budget notes, acceptance documents, and lead-only invoices on the lead.
- Leads and projects can both select an existing client by directory ID. A new client record requires an explicit administrator link before any portal account can see its shared records. Changing the contact fields on either record preserves its client ID.
- Additional project clients must be selected from the directory to receive portal access. The migration removes historical secondary links that lack an explicit ID and keeps their contact text. A manager can select the verified directory entry to restore access. Existing primary portal links keep their current ownership.
- Legacy project detail backfill uses the saved lead link and a matching non-null client ID. Project-owned values take precedence. The Clients page uses IDs for grouping and editing records with a directory identity.

The direct-creation prerequisite and access-boundary migrations were applied to PMS production through the Supabase CLI on 21 November 2026. The database test runs against isolated PostgreSQL.
