// NOVA paper-reader — extracts methods/datasets/results/limitations into the literature matrix.
import {
  getAuthedClient,
  json,
  ok,
  truncate,
} from "../_shared/mod.ts";
import { llmJson } from "../_shared/llm.ts";

const PAPER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["papers"],
  properties: {
    papers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "method", "dataset", "result", "problem"],
        properties: {
          id: { type: "string" },
          method: { type: "string" },
          dataset: { type: "string" },
          result: { type: "string" },
          problem: { type: "string" },
        },
      },
    },
  },
};

const MODE_LIMITS: Record<string, number> = { quick: 20, deep: 60, expert: 60 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (e: any) {
    return json({ error: e.message }, e.status ?? 401);
  }
  const { supabase } = authed;

  let body: { run_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const runId = body.run_id;
  if (!runId) return json({ error: "run_id is required" }, 400);

  const { data: run, error: runErr } = await supabase
    .from("research_runs")
    .select("id, query, mode")
    .eq("id", runId)
    .single();
  if (runErr || !run) return json({ error: "Run not found or forbidden" }, 404);

  await supabase
    .from("research_runs")
    .update({ current_stage: "paper-reader" })
    .eq("id", runId);

  const { data: task } = await supabase
    .from("run_tasks")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "paper-reader")
    .maybeSingle();
  const taskId = task?.id ?? crypto.randomUUID();
  await supabase.from("run_tasks").upsert({
    id: taskId,
    run_id: runId,
    stage: "paper-reader",
    status: "running",
    input: { mode: run.mode },
    error: null,
    updated_at: new Date().toISOString(),
  });

  const limit = MODE_LIMITS[run.mode] ?? 20;
  const { data: papers, error: papersErr } = await supabase
    .from("papers")
    .select("id, title, abstract, year")
    .eq("run_id", runId)
    .order("citation_count", { ascending: false })
    .limit(limit);
  if (papersErr) {
    return json({ error: papersErr.message }, 500);
  }

  const rows: { paper_id: string; method: string; dataset: string; result: string; problem: string }[] = [];

  if ((papers ?? []).length > 0) {
    const BATCH = 8;
    for (let i = 0; i < papers!.length; i += BATCH) {
      const batch = papers!.slice(i, i + BATCH);
      const payload = batch.map((p: any) => ({
        id: p.id,
        title: p.title,
        abstract: truncate(p.abstract, 1200),
        year: p.year,
      }));

      let out: any;
      try {
        out = await llmJson({
          system:
            "You are a meticulous research paper analyst. For each paper, extract four fields from the title+abstract: the method/approach used, the dataset used, the key result/finding, and the problem/limitation the paper addresses or leaves open. Be specific and factual. If a field is not stated in the abstract, return an empty string. Return ONLY the requested JSON.",
          user: JSON.stringify(payload),
          schemaName: "paper_analysis",
          schema: PAPER_SCHEMA,
          temperature: 0.1,
        });
      } catch (e) {
        console.error("llm batch failed", e);
        await supabase
          .from("run_tasks")
          .update({
            status: "failed",
            error: (e as Error)?.message ?? "LLM failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", taskId);
        return json({ error: "Paper analysis failed", detail: (e as Error)?.message }, 500);
      }

      const byId = new Map(batch.map((p: any) => [p.id, p]));
      for (const item of out.papers ?? []) {
        if (!byId.has(item.id)) continue;
        rows.push({
          paper_id: item.id,
          method: item.method ?? "",
          dataset: item.dataset ?? "",
          result: item.result ?? "",
          problem: item.problem ?? "",
        });
      }
    }
  }

  // Refresh matrix for this run.
  await supabase.from("literature_matrix").delete().eq("run_id", runId);
  if (rows.length > 0) {
    await supabase.from("literature_matrix").insert(
      rows.map((r) => ({ run_id: runId, ...r, extracted_at: new Date().toISOString() })),
    );
  }

  const summary = { analyzed: rows.length, total_papers: (papers ?? []).length };
  await supabase
    .from("run_tasks")
    .update({
      status: "done",
      output: summary,
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  return json({ run_id: runId, ...summary });
});
