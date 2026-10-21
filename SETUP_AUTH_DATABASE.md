# Clerk and Convex setup

The app uses Clerk for employee sign-in and Convex for shared workspace data. All authenticated employees currently share one workspace; role-based permissions are not configured yet.

## 1. Install packages

The dependency manifest now includes Clerk and Convex. From the project root, install packages and refresh the lockfile:

```sh
pnpm install --no-frozen-lockfile
```

The Next.js dependency is set to 15.2.8 or newer to satisfy Clerk's current supported version range.

## 2. Create the service projects

1. Create a Clerk application and set its sign-up policy to invitation-only for employee use.
2. Enable the Convex integration in Clerk. The Clerk JWT template/application ID must be `convex`.
3. Create a Convex project and connect it from this repository with `pnpm exec convex dev`.
4. Copy the key names from `.env.example` into the local environment file without committing secrets.
5. Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex deployment's environment variables to the Clerk Frontend API URL shown in Clerk's dashboard.
6. Run `pnpm exec convex dev` to deploy the schema, functions, and Clerk issuer configuration.

## 3. Environment variables

The Next.js app needs the Clerk publishable key, Clerk secret key, and Convex deployment URL. Convex also needs the Clerk issuer domain. Use separate development and production values for the corresponding Clerk instances and Convex deployments.

## Data sync

Leads, projects, management plans, and post-sale operations sync from the existing local browser records into Convex on first authenticated load. Convex then supplies the shared workspace snapshot to other signed-in employees. Browser storage remains a local cache for compatibility with the current screens.

Large documents currently represented as base64 data URLs may exceed Convex document limits. Move uploaded files to Convex file storage before relying on large attachments in production.
