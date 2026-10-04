// NOVA reasoning-gap — detects research gaps from papers + literature matrix.
import { getAuthedClient, json, ok, rateLimit, truncate } from "../_shared/mod.ts";
import { llmJson } from "../_shared/llm.ts";

const GAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "statement",
    "existing_coverage",
    "opportunity",
    "clusters",
    "missing_topics",
  ],
  properties: {
    title: { type: "string" },
    statement: { type: "string" },
    existing_coverage: { type: "string" },
    opportunity: { type: "string" },
    clusters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "coverage_score", "opportunity_score"],
        properties: {
          topic: { type: "string" },
          coverage_score: { type: "number" },
          opportunity_score: { type: "number" },
        },
      },
    },
    missing_topics: { type: "array", items: { type: "string" } },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (e: any) {
    return json({ error: e.message }, e.status ?? 401);
  }
  const { supabase } = authed;
  const limited = await rateLimit(supabase, "reasoning-gap", 30);
  if (limited) return limited;

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
    .update({ current_stage: "gap" })
    .eq("id", runId);

  const { data: task } = await supabase
    .from("run_tasks")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "gap")
    .maybeSingle();
  const taskId = task?.id ?? crypto.randomUUID();
  await supabase.from("run_tasks").upsert({
    id: taskId,
    run_id: runId,
    stage: "gap",
    status: "running",
    input: { query: run.query },
    error: null,
    updated_at: new Date().toISOString(),
  });

  const { data: papers } = await supabase
    .from("papers")
    .select("id, title, abstract, year, citation_count")
    .eq("run_id", runId)
    .order("citation_count", { ascending: false })
    .limit(40);

  const { data: matrix } = await supabase
    .from("literature_matrix")
    .select("paper_id, method, dataset, result, problem")
    .eq("run_id", runId);

  const paperText = (papers ?? []).slice(0, 20).map((p: any, i: number) =>
    `${i + 1}. ${p.title} (${p.year ?? "n/a"}): ${truncate(p.abstract, 500)}`
  ).join("\n");
  const matrixText = (matrix ?? []).map((m: any) =>
    `- method: ${m.method || "—"} | dataset: ${m.dataset || "—"} | result: ${m.result || "—"} | problem: ${m.problem || "—"}`
  ).join("\n");

  let gap: any;
  try {
    gap = await llmJson({
      system:
        "You are a senior research strategist. Given a set of papers and an extracted literature matrix, identify the most promising research gap. Produce a clear gap statement, describe what is already covered, and the specific opportunity for a novel contribution. Also produce 4-7 thematic clusters with a coverage score (0-1, how saturated the area is) and an opportunity score (0-1, how promising the opening is), plus 3-6 missing topics no one has addressed. Scores must be numbers between 0 and 1.",
      user:
        `Research query: ${run.query}\n\nPapers:\n${paperText}\n\nLiterature matrix:\n${matrixText || "(no matrix)"}`,
      schemaName: "research_gap",
      schema: GAP_SCHEMA,
      temperature: 0.5,
    });
  } catch (e) {
    console.error("gap llm failed", e);
    await supabase
      .from("run_tasks")
      .update({
        status: "failed",
        error: (e as Error)?.message ?? "LLM failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return json({ error: "Gap detection failed", detail: (e as Error)?.message }, 500);
  }

  const gapMap = {
    clusters: gap.clusters ?? [],
    missing_topics: gap.missing_topics ?? [],
  };

  await supabase.from("gaps").delete().eq("run_id", runId);
  const { data: savedGap, error: saveErr } = await supabase
    .from("gaps")
    .insert({
      run_id: runId,
      title: gap.title,
      statement: gap.statement,
      existing_coverage: gap.existing_coverage,
      opportunity: gap.opportunity,
      gap_map_json: gapMap,
    })
    .select()
    .single();

  if (saveErr) {
    await supabase
      .from("run_tasks")
      .update({
        status: "failed",
        error: saveErr.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return json({ error: saveErr.message }, 500);
  }

  await supabase
    .from("run_tasks")
    .update({
      status: "done",
      output: { gap_id: savedGap.id, title: gap.title },
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  return json({ run_id: runId, gap: savedGap });
});
