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

test("public onboarding cannot self-assign privileged roles", async () => {
  const authScreen = await read("src/components/AuthScreen.tsx");
  const authContext = await read("src/context/AuthContext.tsx");
  const migration = await read("supabase/migrations/20261004120000_production_hardening.sql");
  assert.doesNotMatch(authScreen, /<option value="professor">/);
  assert.match(authContext, /SelfAssignableRole/);
  assert.match(migration, /Professor and Lab Admin roles require administrator verification/);
  assert.match(migration, /has_professor_privileges/);
  assert.match(migration, /privileged_role_verified/);
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
