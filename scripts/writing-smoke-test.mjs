import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `nova-writing-smoke-${suffix}@example.com`;
const password = `Nova-${crypto.randomUUID()}-9!`;
let userId;

const check = (condition, message, detail) => {
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
};

const sha256 = async (value) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const invoke = async (name, body) => {
  const started = Date.now();
  const { data, error } = await client.functions.invoke(name, { body });
  const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  if (error || data?.error) {
    let detail = data?.detail || data?.error || error?.message;
    if (error?.context && typeof error.context.json === "function") {
      try {
        const payload = await error.context.json();
        detail = payload?.detail || payload?.error || detail;
      } catch { /* retain SDK error */ }
    }
    throw new Error(`${name} failed after ${seconds}s: ${detail}`);
  }
  console.log(JSON.stringify({ stage: name, seconds, ok: true }));
  return data;
};

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "NOVA Writing Smoke Test", role: "student" },
  });
  check(created.user && !createError, "Could not create smoke user", createError?.message);
  userId = created.user.id;
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  check(!signInError, "Could not sign in smoke user", signInError?.message);

  const projectId = crypto.randomUUID();
  const { error: projectError } = await client.from("projects").insert({ id: projectId, name: "Writing E2E", description: "Temporary", owner_id: userId });
  check(!projectError, "Project RLS failed", projectError?.message);

  const runId = crypto.randomUUID();
  const { error: runError } = await client.from("research_runs").insert({
    id: runId,
    project_id: projectId,
    user_id: userId,
    query: "Transparent evaluation of clinical prediction models",
    mode: "quick",
    status: "completed",
    current_stage: "report",
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  });
  check(!runError, "Synthetic linked run failed", runError?.message);
  const { error: paperError } = await client.from("papers").insert({
    run_id: runId,
    source: "Crossref",
    source_id: "10.1038/s41591-020-1031-7",
    title: "Transparency and reproducibility in artificial intelligence",
    authors: ["Test Source Author"],
    year: 2020,
    doi: "10.1038/s41591-020-1031-7",
    abstract: "A source record used only for temporary end-to-end verification.",
    url: "https://doi.org/10.1038/s41591-020-1031-7",
  });
  check(!paperError, "Synthetic source failed", paperError?.message);
  const { error: reportError } = await client.from("reports").insert({
    run_id: runId,
    title: "Transparent clinical prediction evaluation",
    abstract: "A proposed evaluation framework for transparent clinical prediction models.",
    sections_json: { sections: [
      { heading: "Introduction", body: "Clinical prediction models require transparent evaluation." },
      { heading: "Methods", body: "The proposed study will compare calibration, discrimination and subgroup performance." },
    ] },
  });
  check(!reportError, "Synthetic report failed", reportError?.message);

  const humanContent = `# Transparent Clinical Prediction Evaluation

## Abstract

This paper proposes a structured evaluation framework for clinical prediction models. The work is a protocol and does not claim completed experiments or observed outcomes.

## Introduction

Clinical prediction systems can influence consequential care decisions. Transparent reporting, calibrated uncertainty, subgroup analysis, and reproducible evaluation are therefore essential. The proposed framework separates model development from independent evaluation and documents every prespecified outcome.

## Methods

The planned study will use a held-out temporal cohort. Primary evaluation will include discrimination, calibration error, and decision-curve analysis. Subgroup results will be reported with uncertainty intervals. Missing data handling, exclusion criteria, and analysis code will be documented before outcome analysis.

## Discussion

This protocol is designed to reduce optimistic performance estimates and make limitations visible. It does not establish clinical effectiveness. External validation, clinical safety review, data-governance approval, and prospective evaluation remain necessary before deployment.

## Ethics

The study team must obtain the applicable institutional approvals before accessing patient data. No approval is claimed in this protocol draft.

## References

Transparency and reproducibility in artificial intelligence. https://doi.org/10.1038/s41591-020-1031-7
`;

  const { data: inserted, error: manuscriptError } = await client.from("manuscripts").insert({
    project_id: projectId,
    owner_id: userId,
    research_run_id: runId,
    title: "Transparent Clinical Prediction Evaluation",
    target_journal: "Nature Medicine",
    article_type: "research_article",
    citation_style: "vancouver",
    writing_mode: "human_authored",
    content: humanContent,
    last_edit_source: "human",
    last_change_summary: "Smoke-test author draft",
  }).select().single();
  check(inserted && !manuscriptError, "Manuscript insert/trigger failed", manuscriptError?.message);
  const manuscriptId = inserted.id;

  const { error: bypassError } = await client.from("manuscripts").update({
    status: "submission_ready",
    validation_completed_at: new Date().toISOString(),
    last_validated_sha256: await sha256(humanContent),
  }).eq("id", manuscriptId);
  check(Boolean(bypassError), "Client was able to bypass protected readiness fields");

  const { data: initialVersions, error: versionError } = await client.from("manuscript_versions").select("*").eq("manuscript_id", manuscriptId);
  check(!versionError && initialVersions?.length === 1, "Initial immutable version missing", versionError?.message);
  check(initialVersions[0].source === "human", "Initial version source is incorrect");

  const humanReview = await invoke("writing-assistant", { action: "analyze", manuscript_id: manuscriptId });
  check(humanReview.mode === "human_authored", "Human mode not honored");
  check((humanReview.suggestions ?? []).every((suggestion) => suggestion.suggested_text === ""), "Human mode returned insertable AI text");

  const { error: aiModeError } = await client.from("manuscripts").update({ writing_mode: "ai_assisted" }).eq("id", manuscriptId);
  check(!aiModeError, "Could not enable AI-assisted mode", aiModeError?.message);
  const draft = await invoke("writing-assistant", { action: "draft_from_research", manuscript_id: manuscriptId });
  check(draft.manuscript?.content?.length >= 500, "Grounded draft was incomplete");
  check(draft.manuscript?.ai_disclosure, "AI disclosure was not recorded");

  const { data: draftVersions } = await client.from("manuscript_versions").select("source").eq("manuscript_id", manuscriptId).order("version_number");
  check(draftVersions?.some((version) => version.source === "ai_generated"), "AI-generated provenance version missing");

  const sourcePath = `${manuscriptId}/${crypto.randomUUID()}-source.txt`;
  const sourceBlob = new Blob(["Temporary source evidence for RLS and storage verification."], { type: "text/plain" });
  const { error: uploadError } = await client.storage.from("manuscripts").upload(sourcePath, sourceBlob);
  check(!uploadError, "Private storage upload failed", uploadError?.message);
  const { data: document, error: documentError } = await client.from("manuscript_documents").insert({
    manuscript_id: manuscriptId,
    storage_path: sourcePath,
    filename: "source.txt",
    mime_type: "text/plain",
    size_bytes: sourceBlob.size,
    kind: "source",
    extracted_text: await sourceBlob.text(),
    extraction_status: "complete",
    metadata: { smoke_test: true },
    created_by: userId,
  }).select().single();
  check(document && !documentError, "Document metadata RLS failed", documentError?.message);
  const { data: signed, error: signedError } = await client.storage.from("manuscripts").createSignedUrl(sourcePath, 60);
  check(signed?.signedUrl && !signedError, "Private signed download failed", signedError?.message);

  const validation = await invoke("paper-validator", { manuscript_id: manuscriptId });
  check(validation.findings?.length > 0, "Validator produced no findings");
  check(validation.readiness?.gates?.length === 6, "Readiness gate set is incomplete");
  check(validation.doi_checks?.some((item) => item.doi === "10.1038/s41591-020-1031-7"), "DOI verification did not run");
  const { error: forgedFindingError } = await client.from("validation_findings").insert({
    manuscript_id: manuscriptId,
    category: "provenance",
    severity: "pass",
    title: "Forged client finding",
    description: "This row must not be accepted.",
    recommendation: "",
    evidence: {},
    status: "open",
    content_sha256: await sha256(validation.manuscript.content),
  });
  check(Boolean(forgedFindingError), "Client was able to forge a validation finding");

  const currentContent = validation.manuscript.content;
  const contentHash = await sha256(currentContent);
  check(validation.manuscript.last_validated_sha256 === contentHash, "Validated content hash mismatch");
  const blockingFindings = validation.findings.filter((finding) => ["blocking", "human_review"].includes(finding.severity));
  for (const finding of blockingFindings) {
    const { error: resolveError } = await client.rpc("resolve_validation_finding", { p_finding_id: finding.id, p_status: "resolved" });
    check(!resolveError, "Could not resolve human-review finding", resolveError?.message);
  }
  const { error: signoffError } = await client.from("author_signoffs").upsert({
    manuscript_id: manuscriptId,
    profile_id: userId,
    role: "author",
    approved: true,
    statement: "Temporary end-to-end author attestation.",
    content_sha256: contentHash,
    approved_at: new Date().toISOString(),
  }, { onConflict: "manuscript_id,profile_id" });
  check(!signoffError, "Author sign-off failed", signoffError?.message);
  const { data: finalized, error: finalizeError } = await client.rpc("finalize_manuscript", { p_manuscript_id: manuscriptId });
  check(finalized?.status === "submission_ready" && !finalizeError, "Server readiness gate failed", finalizeError?.message);

  console.log(JSON.stringify({
    result: "PASS",
    manuscript: {
      status: finalized.status,
      versions: draftVersions?.length,
      suggestions: humanReview.suggestions?.length ?? 0,
      findings: validation.findings.length,
      gates: validation.readiness.gates.map((gate) => `${gate.key}:${gate.status}`),
      private_document: document.filename,
    },
  }, null, 2));
} finally {
  await client.auth.signOut();
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`Smoke-user cleanup failed: ${error.message}`);
    else console.log("Temporary writing smoke user and cascaded data removed.");
  }
}
