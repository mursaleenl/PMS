# Create an isolated testing database

`testing-database.sql` is a single installer for a **fresh Supabase project**. It includes the repository's base schema and every applicable follow-up migration, in dependency order: tables, constraints, indexes, functions, triggers, grants, RLS, attendance, reviews, notifications, and client portal tasks. The existing-production relational migration is deliberately excluded: `schema.sql` is the equivalent starting point for new databases.

This is a repository-defined schema replica, not a verified production snapshot. It contains no production users, passwords, business records, or uploaded files. It includes default attendance settings. Dashboard Auth settings, email delivery, redirect URLs, API keys, Edge Functions, and external integrations are configured separately. Attachments in this app use database data URLs; no application Storage bucket migration exists in this repo.

## New hosted testing project (recommended)

1. Create a separate Supabase project named, for example, `pms-testing`.
2. Confirm the SQL editor is open in that new project. Paste and run **all of `testing-database.sql`**. Do not apply the individual migrations again afterward. The installer uses one transaction and refuses to run when public application tables already exist. This check is a fresh-database check, not proof of the selected project's identity.
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

After changing the source migrations, update the ordered source list if needed and regenerate:

```sh
node scripts/build-testing-database.cjs
node --test tests/testing-database.test.cjs
```

The automated check installs the full bundle against isolated PostgreSQL with a minimal Supabase Auth fixture and checks RLS, final client task function, assignment trigger, and refusal to install over existing tables. It does not contact Supabase or verify a hosted project's configuration.
