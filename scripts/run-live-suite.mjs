import { spawnSync } from "node:child_process";

const projectRef = process.env.NOVA_SUPABASE_PROJECT_REF;
if (!projectRef) throw new Error("NOVA_SUPABASE_PROJECT_REF is required");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const keys = JSON.parse(raw);
const publishable = keys.find((key) => key.type === "publishable")?.api_key
  ?? keys.find((key) => key.id === "anon")?.api_key;
const serviceRole = keys.find((key) => key.id === "service_role")?.api_key
  ?? keys.find((key) => key.type === "secret")?.api_key;
if (!publishable || !serviceRole || serviceRole.includes("·")) {
  throw new Error("Live suite requires publishable and revealed service-role keys");
}

const env = {
  ...process.env,
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: publishable,
  SUPABASE_SERVICE_ROLE_KEY: serviceRole,
};
const suites = process.argv.slice(2);
if (!suites.length) throw new Error("Pass one or more suite scripts");

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
