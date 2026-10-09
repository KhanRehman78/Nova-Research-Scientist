import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SERVICE_ROLE_KEY: serviceRole } = process.env;
if (!url || !publishable || !serviceRole) throw new Error("Supabase smoke-test environment is incomplete");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const client = createClient(url, publishable, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `nova-external-similarity-${suffix}@example.com`;
const password = `Nova-${crypto.randomUUID()}-9!`;
const sandbox = process.env.COPYLEAKS_LIVE_TEST !== "true";
let userId;

function check(value, message, detail) {
  if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

async function invoke(body) {
  const { data, error } = await client.functions.invoke("external-similarity", { body });
  let detail = data?.detail || data?.error || error?.message;
  if (error?.context && typeof error.context.json === "function") {
    try { const payload = await error.context.json(); detail = payload?.detail || payload?.error || detail; } catch { /* retain */ }
  }
  check(!error && !data?.error, `${body.action} failed`, detail);
  return data;
}

const manuscript = `# Controlled External Similarity Integration Test

## Abstract

This temporary manuscript verifies that NOVA can submit a version-bound research draft to an external web-similarity provider without exposing provider credentials to the browser. The text describes a hypothetical reproducibility workflow and is not intended for publication.

## Introduction

Reproducible research requires clear records of data provenance, analysis decisions, software versions, and author review. A publication-readiness system should keep automated similarity measurements separate when those measurements are produced from different comparison corpora. Combining unrelated percentages would create a misleading impression of certainty. NOVA therefore preserves the local research-corpus score and the external web score as independent evidence.

## Methods

The integration creates a cryptographic hash of the exact saved manuscript. It removes the bibliography from the submitted screening text, records explicit user consent, submits the remaining prose through a server-side function, and stores only provider metadata needed for an auditable report. The provider credential remains in protected server configuration. Repeated requests for the same manuscript hash reuse the existing scan so that credits are not consumed twice.

## Discussion

Similarity is not equivalent to plagiarism. A percentage cannot determine whether matched language is quoted, properly cited, unavoidable technical phrasing, or unattributed copying. Every source and highlighted passage therefore requires contextual assessment by a qualified person. The system should communicate corpus limits, provider status, timestamps, and document version rather than presenting an automatic misconduct verdict.

## Conclusion

This controlled document tests submission, polling, report persistence, row-level access control, and version binding. Successful completion demonstrates connectivity and workflow behavior only; it does not establish universal detection accuracy.`;

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "External Similarity Smoke" } });
  check(created.data.user && !created.error, "Test user could not be created", created.error?.message);
  userId = created.data.user.id;
  const signedIn = await client.auth.signInWithPassword({ email, password });
  check(!signedIn.error, "Test user sign-in failed", signedIn.error?.message);

  const projectId = crypto.randomUUID();
  const manuscriptId = crypto.randomUUID();
  const project = await client.from("projects").insert({ id: projectId, name: "External Similarity E2E", description: "Temporary automated test", owner_id: userId });
  check(!project.error, "Project creation failed", project.error?.message);
  const inserted = await client.from("manuscripts").insert({
    id: manuscriptId,
    project_id: projectId,
    owner_id: userId,
    title: "Controlled External Similarity Integration Test",
    content: manuscript,
    writing_mode: "human_authored",
    last_edit_source: "human",
    last_change_summary: "Controlled provider integration fixture",
  });
  check(!inserted.error, "Manuscript creation failed", inserted.error?.message);

  const started = await invoke({ action: "start", manuscript_id: manuscriptId, consent: true, sandbox });
  check(started.scan?.provider_report_id, "Provider report id is missing");
  check(started.scan?.provider === "copyleaks", "Unexpected similarity provider");
  console.log(`Copyleaks ${sandbox ? "sandbox" : "live"} scan ${started.scan.provider_report_id} started with status ${started.scan.status}.`);

  let result = started;
  for (let attempt = 1; attempt <= 36 && !["completed", "error"].includes(result.scan.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    result = await invoke({ action: "status", manuscript_id: manuscriptId, scan_id: started.scan.id });
    console.log(`Poll ${attempt}: ${result.scan.status}`);
  }
  check(result.scan.status === "completed", "Provider scan did not complete", result.scan.error_message || result.scan.status);
  check(typeof result.scan.overall_similarity === "number", "Completed scan is missing its similarity percentage");
  check(result.scan.content_sha256 && result.current_version, "Scan is not bound to the current manuscript version");
  check(result.scan.purged_at, "Provider scan was not purged after results were exported");
  const detailed = await client.from("external_similarity_matches").select("*").eq("scan_id", result.scan.id).order("start_offset");
  check(!detailed.error, "Detailed similarity ranges could not be read", detailed.error?.message);
  if ((result.scan.sources?.length ?? 0) > 0) check((detailed.data?.length ?? 0) > 0, "Provider sources did not produce line-wise ranges");
  for (const match of detailed.data ?? []) {
    check(match.line_start > 0 && match.line_end >= match.line_start, "Detailed match has invalid line coordinates");
    check(match.end_offset > match.start_offset, "Detailed match has invalid character offsets");
  }

  const duplicate = await invoke({ action: "start", manuscript_id: manuscriptId, consent: true, sandbox });
  check(duplicate.reused === true && duplicate.scan.id === result.scan.id, "Unchanged manuscript did not reuse the existing scan");
  console.log(JSON.stringify({
    status: result.scan.status,
    overall_similarity: result.scan.overall_similarity,
    matched_words: result.scan.matched_words,
    total_words: result.scan.total_words,
    sources: result.scan.sources?.length ?? 0,
    highlighted_ranges: detailed.data?.length ?? 0,
    credits_used: result.scan.credits_used,
    sandbox,
    duplicate_reused: duplicate.reused,
  }, null, 2));
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
