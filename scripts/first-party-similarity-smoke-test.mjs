import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SERVICE_ROLE_KEY: serviceRole } = process.env;
if (!url || !publishable || !serviceRole) throw new Error("Supabase smoke-test environment is incomplete");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const client = createClient(url, publishable, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `nova-first-party-similarity-${suffix}@example.com`;
const password = `Nova-${crypto.randomUUID()}-9!`;
const collaboratorEmail = `nova-corpus-collaborator-${suffix}@example.com`;
const collaboratorPassword = `Nova-${crypto.randomUUID()}-9!`;
let userId;
let collaboratorId;

function check(value, message, detail) {
  if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

async function invoke(functionName, body) {
  const { data, error } = await client.functions.invoke(functionName, { body });
  let detail = data?.error || data?.detail || error?.message;
  if (error?.context && typeof error.context.json === "function") {
    try { const payload = await error.context.json(); detail = payload?.error || payload?.detail || detail; } catch { /* retain */ }
  }
  check(!error && !data?.error, `${functionName} failed`, detail);
  return data;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const controlledPassage = "Transparent research workflows preserve source provenance, version history, reviewer decisions, and exact evidence boundaries so that every consequential conclusion can be independently inspected and corrected before publication.";
const sourceContent = `# Source Corpus Document

## Abstract

This controlled source exists only for an automated NOVA similarity integration test. ${controlledPassage}

## Introduction

Reliable scholarly software separates text overlap from misconduct judgments. ${controlledPassage} The comparison engine must retain accountable review decisions without exposing private full text to unrelated browser clients.

## Methods

The fixture uses sampled fingerprints for candidate retrieval and normalized seven-word shingles for passage alignment. It performs no OpenAI request and calls no commercial plagiarism provider.

## Discussion

The expected result is a localized, source-linked overlap record that a human can confirm or dismiss.

## References

Controlled fixture; no external publication.`;

const targetContent = `# Target Manuscript

## Abstract

This manuscript validates NOVA's self-owned similarity workflow against an authorized private corpus.

## Introduction

Publication systems need reproducible controls. ${controlledPassage} This sentence is intentionally shared with the controlled source so the test can verify passage localization.

## Methods

The system normalizes words, retrieves candidate documents through content-defined fingerprints, aligns matching passages, excludes the bibliography, and stores auditable feedback. No external paid similarity API participates in this deterministic test.

## Results

The expected result includes a NOVA corpus source, a non-zero similarity score, and a review record attached to the exact match.

## Discussion

Automated similarity is decision support and does not establish plagiarism, intent, authorship, or publication acceptance.

## Conclusion

Private indexing, explicit shared opt-in, immediate opt-out, and version-bound reports form the minimum trustworthy workflow.

## References

Controlled fixture; no external publication.`;

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "First-party Similarity Smoke" } });
  check(created.data.user && !created.error, "Test user could not be created", created.error?.message);
  userId = created.data.user.id;
  const signedIn = await client.auth.signInWithPassword({ email, password });
  check(!signedIn.error, "Test user sign-in failed", signedIn.error?.message);

  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const targetId = crypto.randomUUID();
  const project = await client.from("projects").insert({ id: projectId, name: "NOVA First-party Similarity E2E", description: "Temporary automated test", owner_id: userId });
  check(!project.error, "Project creation failed", project.error?.message);

  const collaborator = await admin.auth.admin.createUser({ email: collaboratorEmail, password: collaboratorPassword, email_confirm: true, user_metadata: { full_name: "Corpus Consent Collaborator" } });
  check(collaborator.data.user && !collaborator.error, "Collaborator could not be created", collaborator.error?.message);
  collaboratorId = collaborator.data.user.id;
  const member = await admin.from("project_members").insert({ project_id: projectId, profile_id: collaboratorId, role: "research_assistant" });
  check(!member.error, "Collaborator membership could not be created", member.error?.message);

  for (const manuscript of [
    { id: sourceId, title: "Controlled private corpus source", content: sourceContent },
    { id: targetId, title: "Controlled target manuscript", content: targetContent },
  ]) {
    const inserted = await client.from("manuscripts").insert({
      ...manuscript,
      project_id: projectId,
      owner_id: userId,
      target_journal: "Controlled Test Journal",
      writing_mode: "human_authored",
      last_edit_source: "human",
      last_change_summary: "Controlled first-party similarity fixture",
    });
    check(!inserted.error, `Manuscript ${manuscript.id} creation failed`, inserted.error?.message);
  }

  const { data: indexed, error: indexError } = await admin.from("similarity_corpus_documents").select("manuscript_id,scope,word_count").in("manuscript_id", [sourceId, targetId]);
  check(!indexError && indexed?.length === 2, "Private corpus indexing failed", indexError?.message);
  check(indexed.every((item) => item.scope === "private" && item.word_count > 0), "Default corpus scope or word count is invalid");

  const collaboratorClient = createClient(url, publishable, { auth: { persistSession: false } });
  const collaboratorSignIn = await collaboratorClient.auth.signInWithPassword({ email: collaboratorEmail, password: collaboratorPassword });
  check(!collaboratorSignIn.error, "Collaborator sign-in failed", collaboratorSignIn.error?.message);
  const forbiddenScopeChange = await collaboratorClient.from("manuscripts").update({ corpus_scope: "shared_opt_in" }).eq("id", targetId);
  check(Boolean(forbiddenScopeChange.error), "A project collaborator bypassed the owner-only corpus consent rule");

  const writingCacheInput = await sha256(JSON.stringify({
    content: targetContent,
    title: "Controlled target manuscript",
    target_journal: "Controlled Test Journal",
    article_type: "research_article",
    citation_style: "apa7",
    writing_mode: "human_authored",
  }));
  const cachedWritingResponse = {
    summary: "Controlled cached editorial result",
    suggestions: [{
      category: "grammar",
      severity: "info",
      original_excerpt: "Publication systems need reproducible controls.",
      suggested_text: "",
      explanation: "Controlled cache fixture; author review remains required.",
    }],
  };
  const cacheInsert = await admin.from("llm_response_cache").insert({
    manuscript_id: targetId,
    task_type: "writing_analysis",
    input_sha256: writingCacheInput,
    prompt_version: "academic-editor-v2-cost-aware",
    response: cachedWritingResponse,
  });
  check(!cacheInsert.error, "Writing cache fixture could not be inserted", cacheInsert.error?.message);
  const cachedAnalysis = await invoke("writing-assistant", { manuscript_id: targetId, action: "analyze" });
  check(cachedAnalysis.reused === true && cachedAnalysis.suggestions?.length === 1, "Cached writing analysis was not reused");
  const repeatedAnalysis = await invoke("writing-assistant", { manuscript_id: targetId, action: "analyze" });
  check(repeatedAnalysis.reused === true && repeatedAnalysis.suggestions?.length === 1, "Saved writing analysis was not reused");

  const validation = await invoke("paper-validator", { manuscript_id: targetId, deterministic_only: true });
  const corpusMatch = validation.similarity_matches?.find((match) => match.source_type === "nova_corpus");
  check(corpusMatch, "NOVA corpus passage match was not returned");
  check(validation.similarity_report?.overall_similarity > 0, "First-party similarity score is not positive");
  check(validation.similarity_report?.methodology?.external_paid_api_required === false, "Report did not declare paid-provider independence");

  const feedback = await client.from("similarity_match_feedback").insert({
    match_id: corpusMatch.id,
    manuscript_id: targetId,
    reviewer_id: userId,
    verdict: "confirmed_overlap",
  }).select().single();
  check(!feedback.error && feedback.data?.verdict === "confirmed_overlap", "Match feedback could not be saved", feedback.error?.message);

  const shared = await client.rpc("set_manuscript_corpus_scope", { p_manuscript_id: sourceId, p_scope: "shared_opt_in" });
  check(!shared.error && shared.data?.corpus_scope === "shared_opt_in" && shared.data?.shared_corpus_consent_at, "Shared-corpus consent was not recorded", shared.error?.message);

  const excluded = await client.rpc("set_manuscript_corpus_scope", { p_manuscript_id: sourceId, p_scope: "excluded" });
  check(!excluded.error && excluded.data?.corpus_scope === "excluded", "Corpus opt-out failed", excluded.error?.message);
  const { data: removed } = await admin.from("similarity_corpus_documents").select("id").eq("manuscript_id", sourceId);
  check(removed?.length === 0, "Opted-out manuscript remained in the corpus");

  console.log(JSON.stringify({
    deterministic_only: true,
    external_paid_api_required: false,
    overall_similarity: validation.similarity_report.overall_similarity,
    nova_corpus_matches: validation.similarity_matches.filter((match) => match.source_type === "nova_corpus").length,
    feedback_saved: true,
    shared_consent_recorded: true,
    opt_out_deleted_index: true,
    cached_writing_analysis_reused: true,
    repeated_writing_analysis_reused: true,
    collaborator_scope_bypass_blocked: true,
  }, null, 2));
} finally {
  if (collaboratorId) await admin.auth.admin.deleteUser(collaboratorId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
