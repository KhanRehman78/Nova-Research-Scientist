// Shared OpenAI helper for NOVA Edge Functions
import OpenAI from "npm:openai@4";

export function openaiClient(): OpenAI {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY secret is not configured");
  return new OpenAI({ apiKey: key, timeout: 30_000, maxRetries: 0 });
}

/**
 * Runs a chat completion that returns strict JSON matching `schema`.
 * Uses the OpenAI structured-output JSON schema mode.
 */
export async function llmJson(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}): Promise<any> {
  const client = openaiClient();
  const model = opts.model ??
    Deno.env.get("OPENAI_MODEL") ??
    "gpt-5.6-luna";

  const configuredAttempts = Number(Deno.env.get("OPENAI_LLM_ATTEMPTS") ?? "1");
  const attempts = Number.isFinite(configuredAttempts) ? Math.min(2, Math.max(1, Math.trunc(configuredAttempts))) : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const request: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: opts.schemaName,
            strict: true,
            schema: opts.schema,
          },
        },
        max_completion_tokens: opts.maxOutputTokens ?? 4_000,
      };

      // GPT-5-family reasoning models currently accept only their default
      // temperature. Keep custom sampling for older models that support it.
      if (!/^gpt-5(?:\.|-|$)/i.test(model)) {
        request.temperature = opts.temperature ?? 0.3;
      } else {
        request.reasoning_effort = opts.reasoningEffort ??
          (Deno.env.get("OPENAI_REASONING_EFFORT") as "minimal" | "low" | "medium" | "high" | undefined) ??
          "low";
      }

      const completion = await client.chat.completions.create(request as any);

      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty LLM response");
      try {
        return JSON.parse(content);
      } catch {
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        return JSON.parse(cleaned);
      }
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
