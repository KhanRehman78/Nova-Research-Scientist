// Shared helpers for NOVA Edge Functions (Deno edge runtime)
import { createClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export function ok(): Response {
  return new Response("ok", { status: 200, headers: corsHeaders });
}

export function textError(message: string, status = 400): Response {
  return new Response(message, { status, headers: corsHeaders });
}

export type Authed = {
  // Database types are generated at deployment in Supabase projects. Keeping
  // the shared client unparameterized here avoids coupling every Edge Function
  // to a checked-in generated schema while preserving runtime RLS enforcement.
  supabase: any;
  user: { id: string };
};

/** Privileged client for trusted writes after caller authorization succeeds. */
export function serviceClient(): any {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("Supabase service role is not configured");
  return createClient(url, serviceRole, { auth: { persistSession: false } });
}

/**
 * Creates a Supabase client bound to the caller's JWT and verifies it.
 * This gives us per-user RLS enforcement inside the Edge Function.
 */
export async function getAuthedClient(req: Request): Promise<Authed> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = req.headers.get("authorization");

  if (!auth) {
    throw Object.assign(new Error("Missing Authorization header"), { status: 401 });
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw Object.assign(new Error("Invalid or expired token"), { status: 401 });
  }

  return { supabase, user: { id: user.id } };
}

/** GET a URL with a timeout and a couple of retries (exponential backoff). */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  attempts = 2,
  timeoutMs = 10_000,
): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: ctrl.signal,
        headers: {
          "User-Agent": "NOVA-Research-Engine/1.0 (mailto:hello@tecodify.com)",
          ...(options.headers ?? {}),
        },
      });
      if (res.status === 429) {
        lastError = new Error(`rate limited (${res.status})`);
        await sleep(1000 * (i + 1));
        continue;
      }
      if (res.status >= 500) {
        lastError = new Error(`upstream server error (${res.status})`);
        if (i < attempts - 1) {
          await sleep(500 * (i + 1));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        throw new Error(`upstream request failed (${res.status})`);
      }
      return res;
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) await sleep(500 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/** Rebuild OpenAlex abstract from its inverted index. */
export function abstractFromInvertedIndex(
  inv: Record<string, number[]> | undefined,
): string {
  if (!inv) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inv)) {
    for (const pos of positions) words[pos] = word;
  }
  return words.join(" ").trim();
}

export function normalizeTitle(t: string): string {
  return (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function firstDefined<T>(...vals: (T | undefined | null)[]): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
