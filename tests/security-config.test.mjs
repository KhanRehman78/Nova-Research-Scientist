import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("frontend credentials must come from deployment environment", async () => {
  const source = await read("src/lib/supabase.ts");
  const build = await read("scripts/build-site.mjs");
  assert.match(source, /VITE_SUPABASE_URL/);
  assert.match(source, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(source, /https:\/\/[a-z]+\.supabase\.co/);
  assert.doesNotMatch(source, /sb_publishable_[A-Za-z0-9_-]+/);
  assert.match(build, /process\.env\.VERCEL/);
  assert.match(build, /Missing required Vercel environment variables/);
});

test("production headers include CSP, clickjacking and transport protection", async () => {
  const config = JSON.parse(await read("vercel.json"));
  const headers = new Map(config.headers[0].headers.map((item) => [item.key, item.value]));
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Strict-Transport-Security") ?? "", /max-age=/);
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("Content-Security-Policy") ?? "", /https:\/\/\*\.supabase\.co/);
});

test("public onboarding can request but cannot self-assign privileged roles", async () => {
  const authScreen = await read("src/components/AuthScreen.tsx");
  const authContext = await read("src/context/AuthContext.tsx");
  const migration = await read("supabase/migrations/20261004120000_production_hardening.sql");
  const saasMigration = await read("supabase/migrations/20261009120000_saas_admin_and_pricing.sql");
  assert.match(authScreen, /<option value="professor">/);
  assert.match(authScreen, /<option value="lab_admin">/);
  assert.match(authContext, /selfAssignableRole/);
  assert.match(authContext, /requested_role/);
  assert.match(migration, /Professor and Lab Admin roles require administrator verification/);
  assert.match(migration, /has_professor_privileges/);
  assert.match(migration, /privileged_role_verified/);
  assert.match(saasMigration, /actual profile role remains non-privileged/);
  assert.match(saasMigration, /review_professional_role_request/);
  assert.match(saasMigration, /is_platform_admin/);
});

test("public site and protected owner control plane are separate build surfaces", async () => {
  const app = await read("src/App.tsx");
  const landing = await read("src/pages/LandingPage.tsx");
  const admin = await read("src/pages/OwnerAdmin.tsx");
  assert.match(app, /path="\/" element={<LandingPage/);
  assert.match(app, /VITE_APP_SURFACE === "owner"/);
  assert.match(app, /function OwnerRoutes/);
  assert.match(app, /path="\/admin" element={<RequireOwnerAdmin>/);
  assert.doesNotMatch(app.match(/function MainRoutes[\s\S]*?function OwnerRoutes/)?.[0] ?? "", /path="\/admin"/);
  assert.match(landing, /pricing_plans/);
  assert.match(landing, /Get started/);
  assert.match(admin, /review_professional_role_request/);
  assert.match(admin, /get_platform_admin_dashboard/);
  assert.match(admin, /get_platform_admin_api_usage/);
  assert.match(admin, /set_account_subscription/);
  assert.match(admin, /Change password/);
});

test("API usage and package activation have owner-only tracking", async () => {
  const migration = await read("supabase/migrations/20261009120000_saas_admin_and_pricing.sql");
  assert.match(migration, /create table if not exists public\.api_usage_daily/);
  assert.match(migration, /create table if not exists public\.account_subscriptions/);
  assert.match(migration, /api_usage_read_admin/);
  assert.match(migration, /subscriptions_admin_update/);
  assert.match(migration, /create or replace function public\.get_platform_admin_api_usage/);
  assert.match(migration, /create or replace function public\.set_account_subscription/);
});

test("password recovery is implemented", async () => {
  const authContext = await read("src/context/AuthContext.tsx");
  const authScreen = await read("src/components/AuthScreen.tsx");
  assert.match(authContext, /resetPasswordForEmail/);
  assert.match(authContext, /updateUser\(\{ password \}\)/);
  assert.match(authScreen, /Forgot your password\?/);
});

test("paid edge workflows use the shared database rate limiter", async () => {
  const functions = [
    "research-manager", "search-agent", "paper-reader", "reasoning-gap",
    "scientist-hypothesis", "report-writer", "invite-member",
    "writing-assistant", "paper-validator", "professional-agent",
    "open-research", "external-similarity",
  ];
  for (const name of functions) {
    const source = await read(`supabase/functions/${name}/index.ts`);
    assert.match(source, /rateLimit/, `${name} is missing rate limiting`);
  }
});

test("all application edge functions require JWT verification", async () => {
  const config = await read("supabase/config.toml");
  const functions = [
    "research-manager", "search-agent", "paper-reader", "reasoning-gap",
    "scientist-hypothesis", "report-writer", "invite-member",
    "writing-assistant", "paper-validator", "professional-agent",
    "open-research", "external-similarity",
  ];
  for (const name of functions) {
    const pattern = new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = true`, "m");
    assert.match(config, pattern, `${name} must verify JWTs`);
  }
});

test("Copyleaks callback is public only at the gateway and validates its own secret", async () => {
  const config = await read("supabase/config.toml");
  const webhook = await read("supabase/functions/copyleaks-webhook/index.ts");
  const clientFunction = await read("supabase/functions/external-similarity/index.ts");
  assert.match(config, /\[functions\.copyleaks-webhook\]\s+verify_jwt = false/m);
  assert.match(webhook, /COPYLEAKS_WEBHOOK_SECRET/);
  assert.match(webhook, /secureEqual/);
  assert.match(clientFunction, /COPYLEAKS_API_KEY/);
  assert.match(clientFunction, /indexing: \{ copyleaksDb: false/);
  assert.doesNotMatch(await read("src/pages/WritingStudio.tsx"), /COPYLEAKS_API_KEY/);
});

test("Copyleaks results are version-bound and line ranges are protected by RLS", async () => {
  const migration = await read("supabase/migrations/20261009150000_copyleaks_similarity.sql");
  const webhook = await read("supabase/functions/copyleaks-webhook/index.ts");
  const writing = await read("src/pages/WritingStudio.tsx");
  assert.match(migration, /external_similarity_matches_read_manuscript/);
  assert.match(migration, /can_access_manuscript\(manuscript_id\)/);
  assert.match(webhook, /content_sha256/);
  assert.match(webhook, /start_offset/);
  assert.match(webhook, /line_start/);
  assert.match(writing, /HighlightedManuscript/);
  assert.match(writing, /Line-wise high-risk overlap review/);
});

test("the complete research and professional feature surface is wired", async () => {
  const app = await read("src/App.tsx");
  const runContext = await read("src/context/RunContext.tsx");
  const professional = await read("src/pages/ProfessionalStudio.tsx");
  const writing = await read("src/pages/WritingStudio.tsx");
  for (const route of [
    "dashboard", "writing", "professional", "plan/:runId", "knowledge/:runId",
    "literature/:runId", "gap/:runId", "hypothesis/:runId",
    "experiment/:runId", "report/:runId",
  ]) {
    assert.match(app, new RegExp(`path=\\"${route.replace("/", "\\/")}\\"`), `${route} route is missing`);
  }
  assert.match(runContext, /action: "run"/);
  assert.match(runContext, /research-manager/);
  for (const action of [
    "topic_finder", "paper_simplifier", "research_roadmap", "thesis_coach",
    "professor_discovery", "literature_intelligence", "peer_review",
    "grant_proposal", "global_grant_search", "collaborator_finder",
    "supervision_feedback",
  ]) {
    assert.match(professional, new RegExp(`action: \\"${action}\\"`), `${action} is missing`);
  }
  for (const capability of [
    "writing-assistant", "paper-validator", "external-similarity",
    "finalize_manuscript", "set_manuscript_corpus_scope",
  ]) {
    assert.match(writing, new RegExp(capability.replace("-", "\\-")), `${capability} is missing`);
  }
});

test("research writing preserves evidence scope and traceable source IDs", async () => {
  const reportWriter = await read("supabase/functions/report-writer/index.ts");
  const writingAssistant = await read("supabase/functions/writing-assistant/index.ts");
  const reportUi = await read("src/pages/ReportGenerator.tsx");

  for (const source of [reportWriter, writingAssistant]) {
    assert.match(source, /evidence_scope/);
    assert.match(source, /evidence_excerpt/);
    assert.match(source, /evidence_ledger/);
    assert.match(source, /Never invent|Never invents/i);
    assert.match(source, /clos(?:e|ely) paraphrase/i);
  }
  assert.match(reportWriter, /evidence_ids/);
  assert.match(reportWriter, /Evidence Quality & Limitations/);
  assert.match(reportWriter, /Report failed evidence validation/);
  assert.match(writingAssistant, /Draft failed evidence validation/);
  assert.match(reportUi, /Evidence audit/);
  assert.match(reportUi, /Evidence-grounded AI-assisted draft/);
});
