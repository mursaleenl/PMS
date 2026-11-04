# EVECTURE project workspace

Next.js, React, TypeScript, and Supabase workspace for leads, proposals, delivery, and billing.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Configure authentication and apply database migrations as described in [SETUP_AUTH_DATABASE.md](SETUP_AUTH_DATABASE.md). Use `supabase/main-database.sql` for the main database; it includes all schema updates in dependency order.

Checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The database tests use an isolated in-memory PostgreSQL engine; they do not access the live deployment. Browser tests use mocked workspace data against a running local app:

```sh
pnpm exec playwright install chromium
pnpm test:browser
```

For a separate testing Supabase project or a fully local Supabase stack, use the [complete testing database installer and instructions](TESTING_DATABASE.md).
