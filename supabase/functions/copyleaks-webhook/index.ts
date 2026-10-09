// Public Copyleaks callback endpoint. Requests are authenticated with a
// high-entropy secret supplied as a provider custom header or callback token.
import { fetchWithRetry, json, serviceClient, truncate } from "../_shared/mod.ts";

const LOGIN_URL = "https://id.copyleaks.com/v3/account/login/api";
const API_URL = "https://api.copyleaks.com";

type SourceSummary = {
  provider_result_id: string;
  rank: number;
  title: string;
  url: string | null;
  similarity: number | null;
  matched_words: number | null;
  kind: string;
};

function secureEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeUrl(value: unknown): string | null {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function flattenSources(results: Record<string, any> = {}): SourceSummary[] {
  const groups = ["internet", "database", "batch", "repositories"];
  const all = groups.flatMap((kind) => (Array.isArray(results[kind]) ? results[kind].map((item: any) => ({ ...item, kind })) : []));
  return all.slice(0, 200).map((item: any, index) => ({
    provider_result_id: String(item.id ?? ""),
    rank: index + 1,
    title: truncate(String(item.title || item.metadata?.filename || `Matched source ${index + 1}`), 300),
    url: safeUrl(item.url || item.metadata?.finalUrl || item.metadata?.canonicalUrl),
    similarity: null,
    matched_words: numberOrNull(item.matchedWords),
    kind: String(item.kind || "unknown"),
  })).filter((item) => item.provider_result_id);
}

async function copyleaksToken(): Promise<string> {
  const email = Deno.env.get("COPYLEAKS_EMAIL");
  const key = Deno.env.get("COPYLEAKS_API_KEY");
  if (!email || !key) throw new Error("Copyleaks is not configured");
  const response = await fetchWithRetry(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, key }),
  }, 2, 15_000);
  const payload = await response.json();
  if (!payload?.access_token) throw new Error("Copyleaks authentication did not return an access token");
  return String(payload.access_token);
}

function lineAt(content: string, offset: number): number {
  return content.slice(0, Math.max(0, offset)).split("\n").length;
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function resultRows(payload: Record<string, any>, scan: any, manuscriptContent: string, source: SourceSummary | undefined) {
  const comparison = payload?.text?.comparison ?? {};
  const sourceText = String(payload?.text?.value ?? "");
  const providerResultId = String(payload?.resultId ?? payload?.id ?? source?.provider_result_id ?? "");
  const definitions = [
    ["identical", "exact"],
    ["minorChanges", "minor_change"],
    ["relatedMeaning", "paraphrased"],
  ] as const;
  const rows: Record<string, unknown>[] = [];
  for (const [providerType, matchType] of definitions) {
    const suspected = comparison?.[providerType]?.suspected?.chars ?? {};
    const origin = comparison?.[providerType]?.source?.chars ?? {};
    const starts = Array.isArray(suspected.starts) ? suspected.starts : [];
    const lengths = Array.isArray(suspected.lengths) ? suspected.lengths : [];
    const sourceStarts = Array.isArray(origin.starts) ? origin.starts : [];
    const sourceLengths = Array.isArray(origin.lengths) ? origin.lengths : [];
    for (let index = 0; index < starts.length; index += 1) {
      const start = Math.max(0, Number(starts[index]) || 0);
      const end = Math.min(manuscriptContent.length, start + Math.max(0, Number(lengths[index]) || 0));
      if (end <= start) continue;
      const sourceStart = Math.max(0, Number(sourceStarts[index]) || 0);
      const sourceEnd = Math.min(sourceText.length, sourceStart + Math.max(0, Number(sourceLengths[index]) || 0));
      const matchedText = manuscriptContent.slice(start, end);
      rows.push({
        scan_id: scan.id,
        manuscript_id: scan.manuscript_id,
        provider_result_id: providerResultId,
        source_rank: source?.rank ?? 0,
        source_title: source?.title ?? "Copyleaks matched source",
        source_url: source?.url ?? null,
        match_type: matchType,
        start_offset: start,
        end_offset: end,
        line_start: lineAt(manuscriptContent, start),
        line_end: lineAt(manuscriptContent, end),
        matched_text: truncate(matchedText, 4_000),
        source_excerpt: truncate(sourceText.slice(sourceStart, sourceEnd), 4_000),
        matched_words: wordCount(matchedText),
      });
    }
  }
  return { providerResultId, rows };
}

async function purgeScan(token: string, providerScanId: string): Promise<boolean> {
  try {
    await fetchWithRetry(`${API_URL}/v3.1/scans/delete`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scans: [{ id: providerScanId }], purge: true }),
    }, 2, 15_000);
    return true;
  } catch (error) {
    console.error("Copyleaks purge failed", providerScanId, (error as Error).message);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = new URL(req.url);
  const expectedSecret = Deno.env.get("COPYLEAKS_WEBHOOK_SECRET") ?? "";
  const suppliedSecret = req.headers.get("x-nova-webhook-secret") ?? url.searchParams.get("token") ?? "";
  if (!expectedSecret || !secureEqual(expectedSecret, suppliedSecret)) return json({ error: "Unauthorized webhook" }, 401);

  let payload: Record<string, any>;
  try { payload = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const event = (url.searchParams.get("event") ?? "").toLowerCase();
  const providerScanId = url.searchParams.get("scan_id") || payload?.scannedDocument?.scanId || "";
  if (!providerScanId) return json({ error: "scan_id is required" }, 400);

  const admin = serviceClient();
  const { data: scan } = await admin.from("external_similarity_scans").select("*")
    .eq("provider", "copyleaks").eq("provider_report_id", providerScanId).maybeSingle();
  if (!scan) return json({ error: "Unknown scan" }, 404);

  if (event === "error") {
    const message = payload?.notifications?.alerts?.[0]?.message || payload?.error?.message || "Copyleaks reported a scan error";
    await admin.from("external_similarity_scans").update({ status: "error", error_message: truncate(String(message), 500) }).eq("id", scan.id);
    return json({ received: true });
  }

  if (event === "completed") {
    const sources = flattenSources(payload.results);
    const score = payload?.results?.score ?? {};
    const matchedWords = (numberOrNull(score.identicalWords) ?? 0) + (numberOrNull(score.minorChangedWords) ?? 0) + (numberOrNull(score.relatedMeaningWords) ?? 0);
    const summary = {
      status: sources.length ? "exporting" : "completed",
      overall_similarity: numberOrNull(score.aggregatedScore),
      total_words: numberOrNull(payload?.scannedDocument?.totalWords) ?? scan.total_words,
      matched_words: matchedWords,
      identical_words: numberOrNull(score.identicalWords),
      minor_changed_words: numberOrNull(score.minorChangedWords),
      related_meaning_words: numberOrNull(score.relatedMeaningWords),
      credits_used: numberOrNull(payload?.scannedDocument?.credits),
      sources,
      provider_metadata: {
        ...(scan.provider_metadata ?? {}),
        total_excluded: numberOrNull(payload?.scannedDocument?.totalExcluded),
        detected_language: payload?.scannedDocument?.detectedLanguage ?? null,
        notifications: payload?.notifications?.alerts ?? [],
      },
      error_message: null,
      completed_at: sources.length ? null : new Date().toISOString(),
    };
    await admin.from("external_similarity_scans").update(summary).eq("id", scan.id);

    const token = await copyleaksToken();
    if (!sources.length) {
      const purged = await purgeScan(token, providerScanId);
      if (purged) await admin.from("external_similarity_scans").update({ purged_at: new Date().toISOString() }).eq("id", scan.id);
      return json({ received: true });
    }

    const callbackBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/copyleaks-webhook`;
    const exportId = crypto.randomUUID();
    const secret = expectedSecret;
    const exportBody = {
      completionWebhook: `${callbackBase}?event=export-completed&scan_id=${encodeURIComponent(providerScanId)}&token=${encodeURIComponent(secret)}`,
      maxRetries: 3,
      developerPayload: scan.id,
      results: sources.map((source) => ({
        id: source.provider_result_id,
        endpoint: `${callbackBase}?event=result&scan_id=${encodeURIComponent(providerScanId)}&result_id=${encodeURIComponent(source.provider_result_id)}`,
        verb: "POST",
        headers: [["x-nova-webhook-secret", secret]],
      })),
    };
    try {
      await fetchWithRetry(`${API_URL}/v3/downloads/${encodeURIComponent(providerScanId)}/export/${encodeURIComponent(exportId)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(exportBody),
      }, 2, 20_000);
      return json({ received: true });
    } catch (error) {
      await admin.from("external_similarity_scans").update({ status: "error", error_message: "Detailed Copyleaks result export failed" }).eq("id", scan.id);
      console.error("Copyleaks export failed", providerScanId, (error as Error).message);
      return json({ error: "Export could not be started" }, 502);
    }
  }

  if (event === "result") {
    const resultId = url.searchParams.get("result_id") ?? String(payload?.resultId ?? payload?.id ?? "");
    const source = (scan.sources as SourceSummary[] | null)?.find((item) => item.provider_result_id === resultId);
    const { data: manuscript } = await admin.from("manuscripts").select("content").eq("id", scan.manuscript_id).single();
    let content = String(manuscript?.content ?? "");
    const currentHash = content ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)) : null;
    const currentHex = currentHash ? Array.from(new Uint8Array(currentHash)).map((byte) => byte.toString(16).padStart(2, "0")).join("") : "";
    if (currentHex !== scan.content_sha256) {
      const { data: version } = await admin.from("manuscript_versions").select("content")
        .eq("manuscript_id", scan.manuscript_id).eq("content_sha256", scan.content_sha256)
        .order("version_number", { ascending: false }).limit(1).maybeSingle();
      content = String(version?.content ?? "");
    }
    if (!content) return json({ error: "Version-bound manuscript content is unavailable" }, 409);
    const parsed = resultRows({ ...payload, resultId }, scan, content, source);
    await admin.from("external_similarity_matches").delete().eq("scan_id", scan.id).eq("provider_result_id", parsed.providerResultId);
    if (parsed.rows.length) {
      const { error } = await admin.from("external_similarity_matches").insert(parsed.rows);
      if (error) return json({ error: "Detailed ranges could not be stored" }, 500);
    }
    return json({ received: true, ranges: parsed.rows.length });
  }

  if (event === "export-completed") {
    const healthy = payload?.completed === true && (!Array.isArray(payload?.tasks) || payload.tasks.every((task: any) => task?.isHealthy !== false && Number(task?.httpStatusCode ?? 200) >= 200 && Number(task?.httpStatusCode ?? 200) < 300));
    if (!healthy) {
      await admin.from("external_similarity_scans").update({ status: "error", error_message: "Copyleaks detailed export did not complete successfully" }).eq("id", scan.id);
      return json({ received: true });
    }
    const token = await copyleaksToken();
    const purged = await purgeScan(token, providerScanId);
    await admin.from("external_similarity_scans").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      purged_at: purged ? new Date().toISOString() : null,
    }).eq("id", scan.id);
    return json({ received: true });
  }

  return json({ received: true });
});
