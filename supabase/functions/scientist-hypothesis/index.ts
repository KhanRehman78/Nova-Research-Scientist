// NOVA scientist-hypothesis — generates a scored hypothesis + experiment design.
import { getAuthedClient, json, ok } from "../_shared/mod.ts";
import { llmJson } from "../_shared/llm.ts";

const HYPOTHESIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "hypothesis",
    "objectives",
    "expected_contribution",
    "confidence",
    "novelty",
    "experiment",
  ],
  properties: {
    title: { type: "string" },
    hypothesis: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    expected_contribution: { type: "string" },
    confidence: { type: "number" },
    novelty: { type: "number" },
    experiment: {
      type: "object",
      additionalProperties: false,
      required: ["dataset", "algorithm", "layers", "metrics"],
      properties: {
        dataset: { type: "string" },
        algorithm: { type: "string" },
        layers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "type", "detail"],
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              detail: { type: "string" },
            },
          },
        },
        metrics: { type: "array", items: { type: "string" } },
      },
    },
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
    .update({ current_stage: "hypothesis" })
    .eq("id", runId);

  const { data: task } = await supabase
    .from("run_tasks")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "hypothesis")
    .maybeSingle();
  const taskId = task?.id ?? crypto.randomUUID();
  await supabase.from("run_tasks").upsert({
    id: taskId,
    run_id: runId,
    stage: "hypothesis",
    status: "running",
    input: { query: run.query },
    error: null,
    updated_at: new Date().toISOString(),
  });

  const { data: gaps } = await supabase
    .from("gaps")
    .select("*")
    .eq("run_id", runId)
    .limit(1);
  const gap = gaps?.[0];

  const { data: matrix } = await supabase
    .from("literature_matrix")
    .select("method, dataset, result, problem")
    .eq("run_id", runId)
    .limit(25);

  const matrixText = (matrix ?? []).map((m: any) =>
    `- method: ${m.method || "—"} | dataset: ${m.dataset || "—"} | result: ${m.result || "—"} | problem: ${m.problem || "—"}`
  ).join("\n");

  let out: any;
  try {
    out = await llmJson({
      system:
        "You are a principal research scientist. Given a research query, a detected gap, and a literature matrix, formulate ONE novel, testable hypothesis and a concrete experiment design. The hypothesis must directly address the gap. Provide 2-4 specific objectives, the expected contribution, and confidence + novelty scores as numbers between 0 and 1. The experiment needs a recommended dataset, an algorithm name, 3-6 architecture layers (name/type/detail), and 3-6 evaluation metrics.",
      user:
        `Research query: ${run.query}\n\nGap title: ${gap?.title ?? "n/a"}\nGap statement: ${gap?.statement ?? "n/a"}\nOpportunity: ${gap?.opportunity ?? "n/a"}\n\nLiterature matrix:\n${matrixText || "(no matrix)"}`,
      schemaName: "research_hypothesis",
      schema: HYPOTHESIS_SCHEMA,
      temperature: 0.6,
    });
  } catch (e) {
    console.error("hypothesis llm failed", e);
    await supabase
      .from("run_tasks")
      .update({
        status: "failed",
        error: (e as Error)?.message ?? "LLM failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return json({ error: "Hypothesis generation failed", detail: (e as Error)?.message }, 500);
  }

  await supabase.from("hypotheses").delete().eq("run_id", runId);
  const { data: savedHyp, error: hypErr } = await supabase
    .from("hypotheses")
    .insert({
      run_id: runId,
      title: out.title,
      hypothesis: out.hypothesis,
      objectives: out.objectives ?? [],
      expected_contribution: out.expected_contribution,
      confidence: out.confidence ?? 0,
      novelty: out.novelty ?? 0,
    })
    .select()
    .single();
  if (hypErr) {
    await supabase
      .from("run_tasks")
      .update({ status: "failed", error: hypErr.message, updated_at: new Date().toISOString() })
      .eq("id", taskId);
    return json({ error: hypErr.message }, 500);
  }

  const exp = out.experiment ?? {};
  await supabase.from("experiments").delete().eq("run_id", runId);
  const { data: savedExp, error: expErr } = await supabase
    .from("experiments")
    .insert({
      run_id: runId,
      dataset: exp.dataset ?? "",
      algorithm: exp.algorithm ?? "",
      architecture_json: { layers: exp.layers ?? [] },
      metrics_json: { metrics: exp.metrics ?? [] },
    })
    .select()
    .single();
  if (expErr) {
    console.error("experiment save failed", expErr);
  }

  await supabase
    .from("run_tasks")
    .update({
      status: "done",
      output: { hypothesis_id: savedHyp.id },
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  // Mark the experiment task row as done too (for UI progress).
  const { data: expTask } = await supabase
    .from("run_tasks")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "experiment")
    .maybeSingle();
  await supabase.from("run_tasks").upsert({
    id: expTask?.id ?? crypto.randomUUID(),
    run_id: runId,
    stage: "experiment",
    status: "done",
    input: { query: run.query },
    output: { experiment_id: savedExp?.id ?? null },
    error: null,
    updated_at: new Date().toISOString(),
  });

  return json({ run_id: runId, hypothesis: savedHyp, experiment: savedExp });
});
