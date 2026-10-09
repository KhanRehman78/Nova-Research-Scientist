# NOVA Research Studio

NOVA is a React/Vite frontend backed by Supabase Auth, Postgres/RLS, Storage,
Realtime and Edge Functions. Paid provider credentials remain in Supabase Edge
secrets and are never exposed to the browser.

## Local verification

```bash
npm ci
cp .env.example .env.local
npm run check
npm run dev
```

`npm run check` runs the TypeScript compiler, security regression tests and the
production build. Edge Functions can be type-checked separately with:

```bash
npx --yes deno check supabase/functions/*/index.ts
```

## Required frontend environment

Configure these values locally and in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (Supabase publishable key)
- `VITE_ENABLE_EXTERNAL_SIMILARITY=false` unless Copyleaks is intentionally enabled

Never put a service-role key, database password, Supabase access token or
provider API key in a `VITE_*` variable.

## Supabase release order

1. Link the intended Supabase project.
2. Apply all migrations, including `20261004120000_production_hardening.sql`.
3. Configure Edge secrets: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENALEX_API_KEY`
   and the optional Copyleaks values `COPYLEAKS_EMAIL`, `COPYLEAKS_API_KEY`,
   and a generated `COPYLEAKS_WEBHOOK_SECRET`.
4. Deploy every directory under `supabase/functions/`.
5. Configure the final production URL as the Auth Site URL and add
   `https://<production-domain>/auth?recovery=1` to allowed redirect URLs.
6. During public beta, `supabase/config.toml` disables signup confirmation so
   new accounts can enter immediately without depending on Supabase's shared
   email sender. Before requiring verification in production, configure custom
   SMTP, test delivery, then set `enable_confirmations = true` and push config.
7. Bootstrap the first Owner Admin once from the SQL editor or service role:
   `select public.set_platform_owner('<app-profile-uuid>');`. Never expose the
   service role key to the browser.
8. Professor and Lab Admin signups create pending role requests. Review these
   in the separate Owner Portal; approval securely promotes the account and unlocks protected
   professional workflows.

## SaaS surfaces

- `/` — public product landing page and database-driven pricing.
- `/auth` — login and role-aware account creation.
- `/dashboard` — authenticated research portal.
- `/professional` — student, researcher, professor and lab workflows.
- Public deployment excludes the Owner Admin route.
- The separate Owner Portal is built with `VITE_APP_SURFACE=owner`; its root
  opens `/admin`, signup is disabled, and access requires `platform_admins`
  membership. Configure `VITE_MAIN_APP_URL` to link back to the public website.

Migrations must be deployed before Edge Functions because the functions depend
on the database rate limiter and atomic research-run claim RPC.

## Vercel release

`vercel.json` defines the Vite build, SPA rewrites, immutable asset caching and
production security headers. After the Supabase release is complete:

1. Authenticate the Vercel CLI or import the GitHub repository in Vercel.
2. Configure the frontend variables above for Preview and Production.
3. Create a second Vercel project for the Owner Portal with the same Supabase
   variables plus `VITE_APP_SURFACE=owner` and `VITE_MAIN_APP_URL`.
4. Deploy a preview and run the authenticated smoke tests.
5. Promote to production only after signup confirmation, password recovery,
   project sharing, research pipeline, Writing Studio and role authorization pass.

## Live smoke suites

The live suites create isolated temporary users and remove them when complete.
They require the documented Supabase URL, publishable key and service-role key.

```bash
npm run test:research:live
npm run test:professional:live
npm run test:writing:live
npm run test:open-research:live
npm run test:first-party-similarity:live
npm run test:external-similarity:live
```

The optional external similarity suite may require paid provider credits. NOVA's
first-party similarity workflow remains independent of that provider.
