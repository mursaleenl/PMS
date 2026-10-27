# Supabase setup

VRKSpace uses Supabase Auth and Postgres. Access is split into three tiers: Administrator, Employee, and Client.

## Setup

1. Create a Supabase project.
2. In Authentication → Providers, enable Email and Password. Disable public sign-up if only invited users should access the workspace.
3. Copy the project URL and anon key into `.env.local` using the names in `.env.example`. Also add the Supabase `service_role` key as `SUPABASE_SERVICE_ROLE_KEY`; it is used only by the server route that creates invited user accounts and must never use a `NEXT_PUBLIC_` prefix.
4. Open the Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
5. Set `NEXT_PUBLIC_ADMIN_EMAIL` to the administrator’s email. Passwords are handled by Supabase Auth and are never stored by this app.

## Role setup

The configured `NEXT_PUBLIC_ADMIN_EMAIL` is automatically registered as the administrator when that account signs in. Administrators can add an account from Settings with the temporary password `admin123`. New accounts must change it in Settings before they can use the workspace. Disable public sign-up in Supabase Auth so accounts can only be created by an administrator.

## Data sync

Leads, projects, and management plans sync from the existing local browser records into the Supabase `workspace_records` table on first authenticated load. Browser storage remains a local cache for compatibility with the current screens.

Large documents currently represented as base64 data URLs should be moved to Supabase Storage before relying on large attachments in production.
