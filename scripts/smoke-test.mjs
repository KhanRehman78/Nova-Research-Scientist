import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const client = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `nova-smoke-${suffix}@example.com`;
const password = `Nova-${crypto.randomUUID()}-9!`;
let userId;

const check = (condition, message, detail) => {
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
};

const invoke = async (name, body) => {
  const started = Date.now();
  const { data, error } = await client.functions.invoke(name, { body });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (error) {
    const context = error.context;
    let detail = error.message;
    if (context && typeof context.json === "function") {
      try {
        const payload = await context.json();
        detail = payload?.detail || payload?.error || JSON.stringify(payload);
      } catch {
        // Keep the SDK error message.
      }
    }
    throw new Error(`${name} failed after ${elapsed}s: ${detail}`);
  }
  console.log(JSON.stringify({ stage: name, seconds: Number(elapsed), ok: true, summary: data }, null, 2));
  return data;
};

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "NOVA Smoke Test", role: "student" },
  });
  check(created.user && !createError, "Could not create smoke user", createError?.message);
  userId = created.user.id;

  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password });
  check(!signInError, "Smoke user could not sign in", signInError?.message);
  check(signedIn.user?.id === userId, "Signed-in user does not match created user");

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();
  check(profile && !profileError, "Profile trigger/RLS failed", profileError?.message);

  const projectId = crypto.randomUUID();
  const { error: projectError } = await client
    .from("projects")
    .insert({
      id: projectId,
      name: "NOVA E2E Smoke Test",
      description: "Temporary automated verification",
      owner_id: userId,
    });
  check(!projectError, "Project insert/RLS failed", projectError?.message);
  const { data: project, error: projectReadError } = await client
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  check(project && !projectReadError, "Project read/RLS failed", projectReadError?.message);

  const planned = await invoke("research-manager", {
    action: "plan",
    project_id: project.id,
    query: "interpretable machine learning methods for medical imaging diagnosis",
    mode: "quick",
  });
  check(planned?.run_id, "Planning did not return run_id");
  const runId = planned.run_id;

  const search = await invoke("search-agent", { run_id: runId });
  check(search?.total > 0, "Search returned no papers");
  check(
    (search?.sources ?? []).filter((source) => source.status === "ok").length >= 3,
    "Fewer than three academic sources succeeded",
  );

  const analysis = await invoke("paper-reader", { run_id: runId });
  check(analysis?.analyzed > 0, "Paper reader produced no literature rows");
  await invoke("reasoning-gap", { run_id: runId });
  await invoke("scientist-hypothesis", { run_id: runId });
  await invoke("report-writer", { run_id: runId });

  const [runResult, countsResult] = await Promise.all([
    client.from("research_runs").select("status, current_stage, finished_at").eq("id", runId).single(),
    Promise.all(
      ["papers", "literature_matrix", "gaps", "hypotheses", "experiments", "reports"].map(async (table) => {
        const { count, error } = await client
          .from(table)
          .select("id", { head: true, count: "exact" })
          .eq("run_id", runId);
        if (error) throw error;
        return [table, count ?? 0];
      }),
    ),
  ]);
  check(!runResult.error && runResult.data?.status === "completed", "Run did not complete", runResult.error?.message);
  console.log(JSON.stringify({
    result: "PASS",
    run: runResult.data,
    counts: Object.fromEntries(countsResult),
  }, null, 2));
} finally {
  await client.auth.signOut();
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`Smoke-user cleanup failed: ${error.message}`);
    else console.log("Temporary smoke user and cascaded test data removed.");
  }
}
