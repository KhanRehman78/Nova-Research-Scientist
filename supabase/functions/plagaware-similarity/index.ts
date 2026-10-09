// NOVA PlagAware similarity — authenticated, version-bound second-opinion scan.
// Provider results remain separate from Copyleaks and NOVA first-party scores.
import { fetchWithRetry, getAuthedClient, json, ok, rateLimit, serviceClient, truncate } from "../_shared/mod.ts";

const PROVIDER = "plagaware";
const SUBMIT_URL = "https://www.plagaware.com/service/api";
const STATUS_URL = "https://www.plagaware.com/api/";
const DISCLAIMER = "PlagAware similarity identifies overlap in its comparison corpus. It is an independent second opinion, not proof of plagiarism, authorship, misconduct, or publication acceptance. Every match requires contextual human review.";

type RequestBody = {
  action?: "start" | "status";
  manuscript_id?: string;
  scan_id?: string;
  consent?: boolean;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function screeningText(content: string): string {
  return content
    .replace(/\n#{1,6}\s+(?:references|bibliography|works cited)\s*\n[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

async function providerPayload(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : { value: parsed };
  } catch {
    const message = text.replace(/^\s*Error:\s*/i, "").trim();
    if (message) throw new Error(`PlagAware: ${truncate(message, 180)}`);
    throw new Error("PlagAware returned an empty or unreadable response");
  }
}

function firstValue(payload: Record<string, any>, ...keys: string[]): any {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null && payload[key] !== "") return payload[key];
  }
  return null;
}

function numeric(value: unknown): number | null {
  const number = Number(String(value ?? "").replace("%", "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function safeUrl(value: unknown, providerOnly = false): string | null {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (providerOnly && (url.protocol !== "https:" || !/(^|\.)plagaware\.com$/i.test(url.hostname))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeStatus(value: unknown): "scheduled" | "active" | "completed" | "error" {
  const status = String(value ?? "scheduled").toLowerCase();
  if (["ok", "complete", "completed", "done", "finished", "success"].includes(status)) return "completed";
  if (["error", "failed", "failure", "cancelled", "canceled"].includes(status)) return "error";
  if (["active", "processing", "running", "started"].includes(status)) return "active";
  return "scheduled";
}

function normalizeSources(payload: Record<string, any>): Record<string, unknown>[] {
  const value = firstValue(payload, "Sources", "sources");
  const entries = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  return entries.slice(0, 100).map((source: any, index) => ({
    rank: index + 1,
    title: truncate(String(firstValue(source ?? {}, "Name", "Title", "name", "title") ?? `Matched source ${index + 1}`), 300),
    url: safeUrl(firstValue(source ?? {}, "SourceUrl", "sourceUrl", "source_url", "Url", "URL", "url", "Link", "link")),
    similarity: numeric(firstValue(source ?? {}, "ResultPercent", "Percent", "Similarity", "resultPercent", "percent")),
    matched_words: numeric(firstValue(source ?? {}, "PlagWords", "MatchedWords", "plagWords", "matchedWords")),
  }));
}

function publicMetadata(payload: Record<string, any>): Record<string, unknown> {
  return {
    name: truncate(String(firstValue(payload, "Name", "name") ?? ""), 300),
    language: truncate(String(firstValue(payload, "Lang", "Language", "lang", "language") ?? ""), 40),
    provider_status: truncate(String(firstValue(payload, "Status", "status") ?? ""), 60),
    scheduled: firstValue(payload, "Scheduled", "scheduled"),
    started: firstValue(payload, "Started", "started"),
    completed: firstValue(payload, "Completed", "completed"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let authed;
  try { authed = await getAuthedClient(req); }
  catch (error: any) { return json({ error: error.message }, error.status ?? 401); }
  const { supabase, user } = authed;
  const limited = await rateLimit(supabase, "plagaware-similarity", 4);
  if (limited) return limited;

  let body: RequestBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.manuscript_id) return json({ error: "manuscript_id is required" }, 400);

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts").select("id,title,content").eq("id", body.manuscript_id).single();
  if (manuscriptError || !manuscript) return json({ error: "Manuscript not found or forbidden" }, 404);

  const content = String(manuscript.content ?? "");
  const contentHash = await sha256(content);
  const userCode = Deno.env.get("PLAGAWARE_USER_CODE");
  if (!userCode) return json({ error: "PlagAware is not configured" }, 503);
  const admin = serviceClient();
  const action = body.action ?? "status";

  if (action === "start") {
    if (body.consent !== true) return json({ error: "Explicit consent is required before sending manuscript text to PlagAware" }, 400);
    const text = screeningText(content);
    if (text.length < 250) return json({ error: "Add at least 250 characters outside the references section before external screening" }, 400);
    if (text.length > 200_000) return json({ error: "External similarity screening supports at most 200,000 characters" }, 413);

    const { data: existing } = await supabase.from("external_similarity_scans").select("*")
      .eq("manuscript_id", manuscript.id).eq("provider", PROVIDER).eq("content_sha256", contentHash).eq("sandbox", false).maybeSingle();
    if (existing && existing.status !== "error") return json({ scan: existing, reused: true, current_version: true });

    let payload: Record<string, any>;
    try {
      const response = await fetchWithRetry(SUBMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          UserCode: userCode,
          TestText: text,
          ReportName: truncate(String(manuscript.title || "NOVA manuscript"), 180),
          ReportComment: `NOVA version ${contentHash.slice(0, 12)}`,
        }).toString(),
      }, 2, 20_000);
      payload = await providerPayload(response);
    } catch (error) {
      const detail = (error as Error).message;
      const noCredits = /not enough scan credits/i.test(detail);
      return json({
        error: noCredits ? "PlagAware account has no ScanCredits" : "PlagAware scan could not be started",
        detail: noCredits ? "The PlagAware credential is valid, but ScanCredits are required before a live scan can start." : detail,
      }, noCredits ? 402 : 502);
    }

    const reportId = firstValue(payload, "Id", "ID", "id", "ReportId", "reportId");
    if (!reportId) return json({ error: "PlagAware did not return a report identifier" }, 502);
    const status = normalizeStatus(firstValue(payload, "Status", "status"));
    const row = {
      manuscript_id: manuscript.id,
      requested_by: user.id,
      provider: PROVIDER,
      content_sha256: contentHash,
      provider_report_id: String(reportId),
      status,
      total_words: numeric(firstValue(payload, "Words", "TotalWords", "words", "totalWords")) ?? countWords(text),
      sources: normalizeSources(payload),
      provider_metadata: publicMetadata(payload),
      error_message: status === "error" ? truncate(String(firstValue(payload, "Error", "Message", "error", "message") ?? "Provider reported an error"), 500) : null,
      disclaimer: DISCLAIMER,
      sandbox: false,
      started_at: status === "active" ? new Date().toISOString() : null,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    };
    const write = existing
      ? admin.from("external_similarity_scans").update(row).eq("id", existing.id).select().single()
      : admin.from("external_similarity_scans").insert(row).select().single();
    const { data: scan, error } = await write;
    if (error || !scan) return json({ error: "PlagAware scan record could not be stored", detail: error?.message }, 500);
    return json({ scan, reused: false, current_version: true }, 202);
  }

  if (action !== "status") return json({ error: "Unsupported action" }, 400);
  let query = supabase.from("external_similarity_scans").select("*")
    .eq("manuscript_id", manuscript.id).eq("provider", PROVIDER);
  if (body.scan_id) query = query.eq("id", body.scan_id);
  const { data: scans, error: scanError } = await query.order("requested_at", { ascending: false }).limit(1);
  const scan = scans?.[0];
  if (scanError || !scan) return json({ error: "No PlagAware scan was found" }, 404);
  if (["completed", "error"].includes(scan.status)) return json({ scan, current_version: scan.content_sha256 === contentHash });

  let payload: Record<string, any>;
  try {
    const response = await fetchWithRetry(STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ cmd: "GetReportMetadata", reportId: scan.provider_report_id, UserCode: userCode }).toString(),
    }, 2, 15_000);
    payload = await providerPayload(response);
  } catch (error) {
    return json({ error: "PlagAware status could not be refreshed", detail: (error as Error).message, scan }, 502);
  }

  const status = normalizeStatus(firstValue(payload, "Status", "status"));
  const { data: saved, error: updateError } = await admin.from("external_similarity_scans").update({
    status,
    overall_similarity: numeric(firstValue(payload, "ResultPercent", "resultPercent", "result_percent")),
    total_words: numeric(firstValue(payload, "TotalWords", "Words", "totalWords", "words")) ?? scan.total_words,
    matched_words: numeric(firstValue(payload, "PlagWords", "MatchedWords", "plagWords", "matchedWords")),
    credits_used: numeric(firstValue(payload, "Credits", "credits")),
    sources: normalizeSources(payload),
    report_html_url: safeUrl(firstValue(payload, "HtmlLink", "HTMLLink", "htmlLink", "html_link"), true),
    report_pdf_url: safeUrl(firstValue(payload, "PdfLink", "PDFLink", "pdfLink", "pdf_link"), true),
    provider_metadata: publicMetadata(payload),
    error_message: status === "error" ? truncate(String(firstValue(payload, "Error", "Message", "error", "message") ?? "Provider reported an error"), 500) : null,
    started_at: scan.started_at ?? (status === "active" || status === "completed" ? new Date().toISOString() : null),
    completed_at: status === "completed" ? new Date().toISOString() : null,
  }).eq("id", scan.id).select().single();
  if (updateError || !saved) return json({ error: "PlagAware scan status could not be stored", detail: updateError?.message }, 500);
  return json({ scan: saved, current_version: saved.content_sha256 === contentHash });
});
