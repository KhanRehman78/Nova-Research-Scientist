import { execFileSync } from "node:child_process";

const projectRef = process.env.SUPABASE_PROJECT_REF || "ykmpvokuleuefafcboip";
if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("SUPABASE_ACCESS_TOKEN is required");
const raw = execFileSync(
  "npx",
  ["--yes", "supabase@2.62.10", "projects", "api-keys", "--project-ref", projectRef, "-o", "json"],
  { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "inherit"] },
);
const keys = JSON.parse(raw);
const serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy");
if (!serviceRole?.api_key) throw new Error("Legacy service role key was not found");
process.env.SUPABASE_URL = `https://${projectRef}.supabase.co`;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRole.api_key;
await import("./cleanup-smoke-users.mjs");
