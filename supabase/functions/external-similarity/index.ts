// NOVA External Similarity — authenticated, version-bound Copyleaks scans.
// Provider credentials never leave the Edge Function environment.
import { fetchWithRetry, getAuthedClient, json, ok, rateLimit, serviceClient, truncate } from "../_shared/mod.ts";

const PROVIDER = "copyleaks";
const LOGIN_URL = "https://id.copyleaks.com/v3/account/login/api";
const SUBMIT_URL = "https://api.copyleaks.com/v3/scans/submit/file";
const DISCLAIMER = "Copyleaks similarity identifies text overlap in its configured comparison sources. It is not proof of plagiarism, authorship, misconduct, or publication acceptance. Quotes, citations, methods language, and standard terminology still require qualified human review.";

type RequestBody = {
  action?: "start" | "status";
  manuscript_id?: string;
  scan_id?: string;
  consent?: boolean;
  sandbox?: boolean;
};

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function utf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function safeFilename(title: string): string {
  const base = title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return `${base || "nova-manuscript"}.txt`;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (error: any) {
    return json({ error: error.message }, error.status ?? 401);
  }
  const { supabase, user } = authed;
  const limited = await rateLimit(supabase, "external-similarity", 6);
  if (limited) return limited;

  let body: RequestBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.manuscript_id) return json({ error: "manuscript_id is required" }, 400);

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select("id,title,content")
    .eq("id", body.manuscript_id)
    .single();
  if (manuscriptError || !manuscript) return json({ error: "Manuscript not found or forbidden" }, 404);

  const content = String(manuscript.content ?? "");
  const contentHash = await sha256(content);
  const action = body.action ?? "status";

  if (action === "status") {
    let query = supabase.from("external_similarity_scans").select("*")
      .eq("manuscript_id", manuscript.id).eq("provider", PROVIDER);
    if (body.scan_id) query = query.eq("id", body.scan_id);
    const { data, error } = await query.order("requested_at", { ascending: false }).limit(1);
    const scan = data?.[0];
    if (error || !scan) return json({ error: "No Copyleaks scan was found" }, 404);
    return json({ scan, current_version: scan.content_sha256 === contentHash });
  }
  if (action !== "start") return json({ error: "Unsupported action" }, 400);
  if (body.consent !== true) return json({ error: "Explicit consent is required before sending manuscript text to Copyleaks" }, 400);
  if (content.trim().length < 250) return json({ error: "Add at least 250 characters before external screening" }, 400);
  if (content.length > 200_000) return json({ error: "External similarity screening supports at most 200,000 characters" }, 413);

  const sandbox = body.sandbox === true;
  const { data: existing } = await supabase
    .from("external_similarity_scans")
    .select("*")
    .eq("manuscript_id", manuscript.id)
    .eq("provider", PROVIDER)
    .eq("content_sha256", contentHash)
    .eq("sandbox", sandbox)
    .maybeSingle();
  if (existing && existing.status !== "error") {
    return json({ scan: existing, reused: true, current_version: true });
  }

  const webhookSecret = Deno.env.get("COPYLEAKS_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!webhookSecret || !supabaseUrl) return json({ error: "Copyleaks webhook is not configured" }, 503);

  const scanId = crypto.randomUUID();
  const webhook = `${supabaseUrl}/functions/v1/copyleaks-webhook?event={STATUS}&scan_id=${encodeURIComponent(scanId)}`;
  const row = {
    manuscript_id: manuscript.id,
    requested_by: user.id,
    provider: PROVIDER,
    content_sha256: contentHash,
    provider_report_id: scanId,
    status: "scheduled",
    total_words: countWords(content),
    sources: [],
    provider_metadata: { configuration: "maximum_coverage", manuscript_title: truncate(String(manuscript.title || ""), 180) },
    disclaimer: DISCLAIMER,
    sandbox,
  };
  const admin = serviceClient();
  const write = existing
    ? admin.from("external_similarity_scans").update(row).eq("id", existing.id).select().single()
    : admin.from("external_similarity_scans").insert(row).select().single();
  const { data: saved, error: saveError } = await write;
  if (saveError || !saved) return json({ error: "Copyleaks scan record could not be created" }, 500);

  try {
    const token = await copyleaksToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const response = await fetch(`${SUBMIT_URL}/${encodeURIComponent(scanId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        base64: utf8Base64(content),
        filename: safeFilename(String(manuscript.title || "NOVA manuscript")),
        properties: {
          action: 0,
          sandbox,
          developerPayload: saved.id,
          expiration: 1,
          sensitivityLevel: 5,
          scanMethodAlgorithm: 0,
          cheatDetection: true,
          webhooks: {
            status: webhook,
            statusHeaders: [["x-nova-webhook-secret", webhookSecret]],
          },
          filters: {
            identicalEnabled: true,
            minorChangesEnabled: true,
            relatedMeaningEnabled: true,
            minCopiedWords: 5,
            safeSearch: true,
          },
          scanning: {
            internet: true,
            // Copyleaks requires Shared Data Hub indexing when that corpus is
            // enabled. NOVA deliberately uses web-only scanning so private
            // research drafts are never added to the provider database.
            copyleaksDb: { includeMySubmissions: false, includeOthersSubmissions: false },
          },
          indexing: { copyleaksDb: false, repositories: [] },
          exclude: { quotes: true, citations: true, references: true, tableOfContents: true },
          pdf: { create: false },
        },
      }),
    });
    clearTimeout(timeout);
    const providerText = await response.text();
    if (!response.ok) throw new Error(`Copyleaks rejected the scan (${response.status}): ${truncate(providerText, 400)}`);
    const { data: active } = await admin.from("external_similarity_scans")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", saved.id).select().single();
    return json({ scan: active ?? saved, reused: false, current_version: true }, 202);
  } catch (error) {
    const detail = truncate((error as Error).message, 400);
    await admin.from("external_similarity_scans").update({ status: "error", error_message: detail }).eq("id", saved.id);
    return json({ error: "Copyleaks scan could not be started", detail }, 502);
  }
});
