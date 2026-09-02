import { execFileSync } from "node:child_process";

const projectRef = process.env.SUPABASE_PROJECT_REF || "ykmpvokuleuefafcboip";
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN is required");

const raw = execFileSync(
  "npx",
  ["--yes", "supabase@2.62.10", "projects", "api-keys", "--project-ref", projectRef, "-o", "json"],
  { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "inherit"] },
);
const keys = JSON.parse(raw);
const publishable = keys.find((item) => item.type === "publishable") || keys.find((item) => item.name === "anon");
// Supabase Auth admin endpoints currently require the legacy service-role JWT;
// the newer sb_secret key is suitable for Data API access but not admin.createUser.
const secret = keys.find((item) => item.name === "service_role" && item.type === "legacy") || keys.find((item) => item.type === "secret");
if (!publishable?.api_key || !secret?.api_key) throw new Error("Current publishable/secret project keys were not found");

process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`;
process.env.SUPABASE_PUBLISHABLE_KEY = publishable.api_key;
process.env.SUPABASE_SERVICE_ROLE_KEY = secret.api_key;
await import("./professional-smoke-test.mjs");
