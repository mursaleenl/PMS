# Independent projects and leads

Projects supports direct creation for a new client, a client selected from the database directory, and internal work. The existing From a lead workflow remains available. Direct creation writes no lead, proposal, or invoice.

Project names and contact edits belong to the project. Renaming a project no longer updates the originating lead. Only explicit lead links provide legacy enquiry details; matching names or email addresses do not supply another lead's details. Newly converted projects retain their own name snapshot.

## Database update

The local SQL migration is `supabase/migrations/20261114111923_independent_project_clients.sql`. It has not been applied to a hosted database. It depends on the existing workspace migrations, including shared project clients. The canonical main SQL and generated testing installer also include this update.

The migration adds:

- A manager-only `project_creation_clients()` directory RPC. The creation form requires this RPC before accepting submissions; older installations cannot fall back to inferred client matching.
- Explicit client ID resolution in the existing transactional graph writer. Existing project ownership is retained during edits. Standalone creation requires selecting a client ID or explicitly creating a new client.
- Atomic creation of the new client, project, team, and links, retaining existing revision and request-id checks.
- `clients.require_explicit_portal_link` for clients created through this flow. A matching email, an older provisioning request, or a full schema rerun cannot automatically give an account access to those records.
- An administrator-only `link_client_portal_account(client_id, user_id)` RPC for explicitly linking a new client to an existing client portal account. This is not a new UI flow. Existing client-account links and current role scopes remain unchanged.

New clients have no portal access until explicitly linked. Selecting an existing client intentionally uses that client's current portal access. Project contact email edits do not grant or transfer portal access.

Apply the reviewed migration through the repository's database workflow when deployment is authorized. Do not deploy the frontend independently of the SQL update: direct creation remains unavailable until setup is complete. Supabase SQL and local tests are ignored by this repository; include the migration explicitly if committing or sharing these changes.

## Verification and boundaries

`tests/project-independence.test.cjs` exercises the actual SQL in isolated PostgreSQL: duplicate names/email, caller authorization, cross-client isolation, assigned employee access, ownership preservation, rollback on child failure, idempotent retries, explicit portal linking, and preservation of projects when their lead is deleted. Browser coverage is in `tests/browser/project-independence.spec.cjs` and the existing project suites.

This change preserves existing access policies. It does not introduce custom roles, migrate or repair historical client matches, or detach proposals from their existing lead requirements. The broader Clients page still has legacy contact grouping outside the project paths updated here; this is not a site-wide authorization audit.
