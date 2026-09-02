import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SERVICE_ROLE_KEY: serviceRole } = process.env;
if (!url || !publishable || !serviceRole) throw new Error("Supabase smoke-test environment is incomplete");
const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const client = createClient(url, publishable, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const email = `nova-open-research-${suffix}@example.com`;
const password = `Nova-${crypto.randomUUID()}-9!`;
let userId;

function check(value, message, detail) {
  if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

async function invoke(body) {
  const { data, error } = await client.functions.invoke("open-research", { body });
  let detail = data?.error || data?.detail || error?.message;
  if (error?.context && typeof error.context.json === "function") {
    try { const payload = await error.context.json(); detail = payload?.error || payload?.detail || detail; } catch { /* retain */ }
  }
  check(!error && !data?.error, `${body.action} failed`, detail);
  return data;
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Open Research Smoke" } });
  check(created.data.user && !created.error, "Test user could not be created", created.error?.message);
  userId = created.data.user.id;
  const signedIn = await client.auth.signInWithPassword({ email, password });
  check(!signedIn.error, "Test user sign-in failed", signedIn.error?.message);

  const projectId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const project = await client.from("projects").insert({ id: projectId, name: "Open Research E2E", description: "Temporary automated test", owner_id: userId });
  check(!project.error, "Project creation failed", project.error?.message);
  const run = await client.from("research_runs").insert({ id: runId, project_id: projectId, user_id: userId, query: "open science reproducibility", mode: "quick", status: "completed" });
  check(!run.error, "Run creation failed", run.error?.message);
  const paper = await client.from("papers").insert({
    run_id: runId,
    source: "crossref",
    source_id: "10.1016/s0021-9258(19)52451-6",
    title: "Protein measurement with the Folin phenol reagent",
    authors: ["Oliver H. Lowry", "Nira J. Rosebrough", "A. Lewis Farr", "Rose J. Randall"],
    year: 1951,
    doi: "10.1016/s0021-9258(19)52451-6",
    abstract: "A temporary record used to verify live open-access metadata enrichment.",
  }).select().single();
  check(paper.data && !paper.error, "Paper creation failed", paper.error?.message);

  const enrichment = await invoke({ action: "enrich_run", run_id: runId, include_full_text: true });
  console.log(JSON.stringify({ stage: "enrichment-response", full_text_available: enrichment.full_text_available, result: enrichment.results?.[0] }));
  check(enrichment.total === 1, "Enrichment did not process the paper");
  check(enrichment.full_text_available === 1, "Known CC-BY OpenAlex TEI full text was not retrieved");
  const enriched = await client.from("papers").select("openalex_id,oa_status,full_text_status,full_text_checked_at,enriched_metadata").eq("id", paper.data.id).single();
  check(!enriched.error && enriched.data.full_text_checked_at, "Enriched metadata was not persisted", enriched.error?.message);
  check(enriched.data.openalex_id || enriched.data.enriched_metadata?.is_oa, "OpenAlex/Unpaywall did not verify the known OA DOI");
  const adminFullText = await admin.from("paper_fulltexts").select("paper_id,retrieval_status,word_count").eq("run_id", runId);
  console.log(JSON.stringify({ stage: "fulltext-storage", admin_rows: adminFullText.data?.length ?? 0, admin_error: adminFullText.error?.message ?? null, enrichment_result: enrichment.results?.[0] }));

  const grants = await invoke({ action: "global_grant_search", project_id: projectId, query: "climate resilience" });
  check(grants.record?.action === "global_grant_search", "Grant discovery audit record missing");
  check(Array.isArray(grants.output?.global_funder_directory), "Global funder directory missing");
  check(Array.isArray(grants.output?.official_portals) && grants.output.official_portals.length >= 3, "Official portal coverage missing");

  const manuscript = await client.from("manuscripts").insert({
    project_id: projectId, owner_id: userId, research_run_id: runId,
    title: "Open research workflow",
    target_journal: "Verification Journal",
    abstract: "This workflow verifies that legally retrieved open full text is included in auditable local similarity screening.",
    content: `# Open research workflow

## Abstract
This workflow verifies that legally retrieved open full text is included in auditable local similarity screening. It does not claim comprehensive plagiarism clearance or journal acceptance.

## Introduction
Open research infrastructure should preserve provenance, identify evidence scope, and distinguish publisher metadata from machine-readable article content. The workflow records source URLs, licenses, retrieval status, content hashes, and timestamps so that every automated assessment can be inspected by a human reviewer.

## Methods
The test uses a known Creative Commons record with an OpenAlex machine-readable representation. NOVA retrieves the source through the authenticated content endpoint, stores the extracted text behind row-level security, and compares the manuscript against that corpus using normalized seven-word shingles. References are excluded from the score. The automated result remains decision support and is never described as a legal or ethical plagiarism verdict.

## Discussion
Coverage depends on lawful availability, upstream metadata, parsing quality, and the sources attached to the selected research run. Paywalled publisher archives and private student-paper repositories are not searched. Authors must independently verify citations, permissions, statistical claims, ethics requirements, and the current instructions of their selected journal.

## References
Lowry OH, Rosebrough NJ, Farr AL, Randall RJ. Protein measurement with the Folin phenol reagent. 1951.`,
  }).select().single();
  check(manuscript.data && !manuscript.error, "Manuscript creation failed", manuscript.error?.message);
  const guidelines = await client.from("manuscript_documents").insert({
    manuscript_id: manuscript.data.id,
    storage_path: `${manuscript.data.id}/journal-guide-smoke.txt`,
    filename: "journal-guide-smoke.txt",
    mime_type: "text/plain",
    size_bytes: 420,
    kind: "guidelines",
    extracted_text: "Research article titles must not exceed 20 words. The abstract must not exceed 250 words. Authors must include a Data Availability section and a Conflict of Interest section. No more than 4 tables and a maximum of 6 figures are permitted. References must use APA 7 style. Authors must disclose generative AI tools.",
    extraction_status: "complete",
    created_by: userId,
  });
  check(!guidelines.error, "Journal guideline record failed", guidelines.error?.message);
  const journal = await invoke({ action: "extract_journal_profile", manuscript_id: manuscript.data.id, deterministic_only: true });
  check(journal.profile?.rules?.abstract_max_words === 250, "Journal abstract limit extraction failed");
  check(journal.profile?.evidence?.length > 0, "Journal rule evidence was not persisted");
  const citation = await client.from("manuscript_citations").insert({
    manuscript_id: manuscript.data.id, paper_id: paper.data.id, citation_key: "testauthor2007open",
    csl_json: { id: "testauthor2007open", title: paper.data.title }, created_by: userId,
  });
  check(!citation.error, "Citation library RLS failed", citation.error?.message);
  const comment = await client.from("manuscript_comments").insert({
    manuscript_id: manuscript.data.id, content_sha256: "smoke-hash", selected_text: "versioned manuscript",
    start_offset: 25, end_offset: 45, body: "Verify this passage.", created_by: userId,
  });
  check(!comment.error, "Passage comment RLS failed", comment.error?.message);

  const corpusCheck = await client.from("manuscripts").select("research_run_id").eq("id", manuscript.data.id).single();
  const fullTextCheck = await client.from("paper_fulltexts").select("paper_id,retrieval_status").eq("run_id", runId);
  check(corpusCheck.data?.research_run_id === runId, "Manuscript lost its linked research run", corpusCheck.error?.message);
  check(fullTextCheck.data?.some((item) => item.paper_id === paper.data.id && item.retrieval_status === "available"), "Caller cannot read the stored full-text corpus", fullTextCheck.error?.message);

  const validation = await client.functions.invoke("paper-validator", { body: { manuscript_id: manuscript.data.id, deterministic_only: true } });
  console.log(JSON.stringify({ stage: "paper-validator-response", has_data: Boolean(validation.data), has_error: Boolean(validation.error), corpus_scope: validation.data?.similarity_report?.corpus_scope }));
  let validationDetail = validation.data?.error || validation.error?.message;
  if (validation.error?.context && typeof validation.error.context.json === "function") {
    try { const payload = await validation.error.context.json(); validationDetail = payload?.error || payload?.detail || validationDetail; } catch { /* retain */ }
  }
  check(!validation.error && !validation.data?.error, "Full-text-aware validation failed", validationDetail);
  check(validation.data.similarity_report?.corpus_scope?.linked_paper_fulltexts === 1, "Validator did not include retrieved full text in similarity corpus");

  console.log(JSON.stringify({ result: "PASS", checks: {
    openalex_unpaywall_enrichment: true,
    legal_fulltext_status_persisted: true,
    global_grant_discovery: true,
    citation_library: true,
    passage_comments: true,
    journal_rule_profile: true,
    fulltext_similarity_corpus: true,
  }, enrichment: { full_text_available: enrichment.full_text_available, metadata_only: enrichment.metadata_only, unavailable: enrichment.unavailable } }, null, 2));
} finally {
  await client.auth.signOut();
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`Cleanup failed for ${userId}: ${error.message}`);
  }
}
