# Main database changes from VS Code

The Supabase CLI workflow manages **only the main database**. Its configured project reference is stored locally in ignored `supabase/targets.local.json`. Testing is managed manually; there are no testing-target commands or VS Code tasks.

Open the PMS folder containing `package.json` in VS Code. The same commands work with `npm run` or `pnpm`.

## One-time setup

Sign in to the Supabase account that owns the main project, then capture its existing schema:

```sh
npm run db:login
npm run db:pull
```

The main project reference is already configured. Check it with `npm run db:targets`. Another checkout can configure it with `npm run db:target -- main YOUR_MAIN_PROJECT_REF_OR_URL`.

The baseline pull captures the public schema and asks to record it in main's migration history. Review the baseline and confirm that history update so existing tables are not recreated. Production rows are not copied. If remote history refers to missing migration files, recover those files before continuing rather than marking unknown migrations applied.

Hosted login and baseline capture still need to be completed from your terminal. Configuring this workflow does not apply schema changes or modify app connection settings.

## Everyday changes

Edit `supabase/main-database.sql`, then run:

```sh
npm run db:build-testing
npm run db:prepare -- describe_change
npm run db:test
npm run db:preview
npm run db:push
```

`db:build-testing` regenerates the standalone SQL installer for your manual testing database. `db:test` uses isolated in-memory PostgreSQL databases and never connects to either hosted database.

Review generated migrations before pushing. `db:preview` shows pending main migrations without applying them; `db:push` applies them to main. Both pass the configured main reference explicitly, rather than relying on a previously linked CLI project. They also skip Vault changes. `db:history` shows main's applied migration versions.

Commit canonical SQL, generated testing SQL, shared migrations, `supabase/migration-state.json` and main's pulled baseline together. Existing migrations are immutable. Later corrections go in a new migration. Keep named canonical sections in dependency order; the generator replays affected sections and later function/policy overrides. Removing source text alone does not drop a database object: write an explicit SQL update.

Main's baseline is under `supabase/environments/main/supabase/migrations/*_main_baseline*.sql`. Shared application migrations are in `supabase/migrations`; the wrapper copies them into main's context before previewing or applying. Those generated copies are ignored by Git. The legacy eight-digit manual SQL filenames are already incorporated in the canonical schema and are not replayed by target synchronization.

## VS Code

Choose **Terminal → Run Task** for main login, configuration, baseline capture, migration preparation, preview, apply, history and isolated tests.

## Manual testing

Use [TESTING_DATABASE.md](TESTING_DATABASE.md) for the standalone testing SQL installer. Testing account credentials, database changes and deployment are outside this CLI workflow. To run the app against testing, configure its matching URL and keys in the app environment and restart Next.js; selecting a CLI target does not change the app connection.

A Docker-compatible runtime is needed for local-stack or shadow-database workflows. No container runtime was available here, so local stack startup was not tested. The database test suite does not need Docker. Close workspace and Table Editor tabs before schema updates; the installer lock guard asks you to retry when active requests hold required locks.

References: [Supabase CLI targeting](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [database migrations](https://supabase.com/docs/guides/local-development/database-migrations).

## If baseline pull cannot find Docker

`db:pull` creates a temporary local shadow database even though the destination is hosted Supabase. Start Docker Desktop and wait for its engine to be ready before pulling:

```sh
open -a Docker
docker info
npm run db:pull
```

The wrapper now discovers Docker in the usual macOS Docker Desktop locations, including `~/.docker/bin`, even if an older VS Code terminal has not picked up that PATH entry. It checks the engine before contacting the hosted project. If Docker has just been installed, opening a fresh VS Code terminal also refreshes its PATH.

The temporary shadow database is a tool used for schema comparison; this does not configure or change your manually managed testing project. Switching diff engines does not remove the need for the migration-style pull's shadow database. See [Supabase diff engines](https://supabase.com/docs/guides/local-development/diff-engines).
