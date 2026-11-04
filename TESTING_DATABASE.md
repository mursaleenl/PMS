# Create an isolated testing database

The `supabase/` folder contains exactly two SQL scripts:

- `main-database.sql`: canonical application schema and updates, for the main database or an existing test database.
- `testing-database.sql`: generated from the main script, with an empty-database guard for a fresh testing project.

Both include the same tables, constraints, indexes, functions, triggers, grants, RLS, attendance, reviews, notifications, and client portal tasks in dependency order. Edit the main script, then regenerate the testing installer.

This is a repository-defined schema replica, not a verified production snapshot. It contains no production users, passwords, business records, or uploaded files. It includes default attendance settings. Dashboard Auth settings, email delivery, redirect URLs, API keys, Edge Functions, and external integrations are configured separately. Attachments in this app use database data URLs; no application Storage bucket migration exists in this repo.

The installer includes the current lead stages (`NEW`, `PROPOSAL_SENT`, `ACCEPTED`, `CONVERTED`, `LOST`) and the final cleanup migration that retires qualification stages. Existing proposal and project team tables support custom proposals and manager/team assignments; attendance sessions and audit tables support the personal calendar and change list. Those recent interface changes do not require additional database tables.

For an already initialized testing project, review and run `supabase/main-database.sql` to update its schema. It retains application data and normalizes retired statuses. Use `supabase/testing-database.sql` only for a fresh project. Updating these local files does not apply SQL to any hosted database.

## New hosted testing project (recommended)

1. Create a separate Supabase project named, for example, `pms-testing`.
2. Confirm the SQL editor is open in that new project. Paste and run **all of `supabase/testing-database.sql`**. No other database script is needed for that new project. The installer uses one transaction and refuses to run when public application tables already exist. This check is a fresh-database check, not proof of the selected project's identity.
3. Create a testing administrator in **Authentication → Users → Add user**, with your testing email and a fresh password; confirm the email. Keep public signup disabled for administrator-managed accounts. Configure Auth's Site URL as `http://localhost:3000` and allow the local callback URLs your sign-in flow uses.
4. In the app folder (`PMS`), create or update the gitignored `.env.local` with the following values **from the testing project**:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_TEST_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_TEST_PROJECT_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=YOUR_TEST_PROJECT_SERVICE_ROLE_KEY
   NEXT_PUBLIC_ADMIN_EMAIL=your-testing-admin@example.com
   ```

   Replace all three Supabase values together. The service role key must stay server-only. Do not change the deployed application's environment variables. `.env.local` overrides `.env` in local Next.js development; explicitly exported shell variables take priority, so remove any production overrides from your terminal or IDE first. Review `.env.development.local` too if it exists, since it has higher priority than `.env.local`.
5. Before starting the app, check that the effective URL and both keys belong to testing. Stop any running development server, then run `pnpm dev` again; Next.js browser variables require a restart. Sign in using the new testing administrator. The app's administrator bootstrap uses the configured email when no administrator exists; alternatively initialize membership explicitly as below.
6. Create separate employee and client test accounts from Users. Add test records, reload, and check that data appears only in the testing project's Table Editor.

For explicit initial administrator membership, run this **in the testing project's SQL editor**, after creating and confirming the Auth user:

```sql
select public.bootstrap_workspace_admin(id)
from auth.users
where lower(email) = lower('your-testing-admin@example.com');
```

Do not run localhost with the old production credentials while completing these steps. This installer does not change the app's current connection automatically.

## Fully local Supabase instead

Install Docker and the Supabase CLI, then from the app folder:

```sh
supabase init
mkdir -p supabase/migrations
cp supabase/testing-database.sql supabase/migrations/20261102000000_testing_baseline.sql
supabase start
supabase status
```

Use the local API URL, anon key, and service role key printed by `supabase status` in `.env.local`. Use the local Studio address to create the confirmed administrator, and initialize membership as above. No remote project link is needed. If Supabase was already running before you copied the migration, apply it with `supabase migration up --local`. Do not apply the baseline over an existing populated local database.

Supabase's local stack includes Auth and PostgreSQL; plain PostgreSQL alone does not supply the auth schema this installer needs. See [Supabase local development](https://supabase.com/docs/guides/local-development) and [migration workflow](https://supabase.com/docs/guides/local-development/database-migrations).

## If production has manual schema changes

This installer cannot prove parity with an uninspected live database. To capture those changes, export production's application schema using a read-only schema dump (`supabase db dump --db-url "$PRODUCTION_DATABASE_URL" --schema public --file /private/tmp/pms-production-schema.sql`), review it, and use that export as an **alternative** baseline in a fresh testing project. Never apply both baselines. The CLI dump needs Docker; keep the database connection string private. Custom changes in other schemas, including auth triggers, need separate review. Production rows and Auth users require a separate data migration, and platform configuration still must be recreated.

## Maintain and verify the file

After editing a section of `supabase/main-database.sql`, regenerate and verify:

```sh
node scripts/build-testing-database.cjs
node scripts/build-testing-database.cjs --check
node --test tests/testing-database.test.cjs
```

Keep new SQL changes in a named section of `main-database.sql`; the generator automatically includes every section and rejects extra SQL files in `supabase/`. `--check` verifies that the generated testing installer matches the main script without changing it.

The automated check verifies freshness, installs the full bundle against isolated PostgreSQL with a minimal Supabase Auth fixture, and checks RLS, current lead stages, rejection of retired stages, the final client task function, assignment trigger, and refusal to install over existing tables. It does not contact Supabase or verify a hosted project's configuration.
