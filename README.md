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
- `VITE_ENABLE_EXTERNAL_SIMILARITY=false` unless PlagAware is intentionally enabled

Never put a service-role key, database password, Supabase access token or
provider API key in a `VITE_*` variable.

## Supabase release order

1. Link the intended Supabase project.
2. Apply all migrations, including `20261004120000_production_hardening.sql`.
3. Configure Edge secrets: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENALEX_API_KEY`
   and any optional provider values such as `PLAGAWARE_USER_CODE`.
4. Deploy every directory under `supabase/functions/`.
5. Configure the final production URL as the Auth Site URL and add
   `https://<production-domain>/auth?recovery=1` to allowed redirect URLs.
6. Verify Professor/Lab Admin accounts through the service-only
   `set_verified_professional_role` RPC or the Supabase SQL editor. Existing
   privileged-looking accounts remain locked until explicitly verified.

Migrations must be deployed before Edge Functions because the functions depend
on the database rate limiter and atomic research-run claim RPC.

## Vercel release

`vercel.json` defines the Vite build, SPA rewrites, immutable asset caching and
production security headers. After the Supabase release is complete:

1. Authenticate the Vercel CLI or import the GitHub repository in Vercel.
2. Configure the frontend variables above for Preview and Production.
3. Deploy a preview and run the authenticated smoke tests.
4. Promote to production only after signup confirmation, password recovery,
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
