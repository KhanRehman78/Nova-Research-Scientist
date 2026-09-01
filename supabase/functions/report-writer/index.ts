// NOVA report-writer — assembles all pipeline outputs into a structured research proposal.
import { getAuthedClient, json, ok } from "../_shared/mod.ts";
import { llmJson } from "../_shared/llm.ts";

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "abstract", "sections"],
  properties: {
    title: { type: "string" },
    abstract: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
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
    .update({ current_stage: "report" })
    .eq("id", runId);

  const { data: task } = await supabase
    .from("run_tasks")
    .select("id")
    .eq("run_id", runId)
    .eq("stage", "report")
    .maybeSingle();
  const taskId = task?.id ?? crypto.randomUUID();
  await supabase.from("run_tasks").upsert({
    id: taskId,
    run_id: runId,
    stage: "report",
    status: "running",
    input: { query: run.query },
    error: null,
    updated_at: new Date().toISOString(),
  });

  const [papers, matrix, gaps, hyps, exps] = await Promise.all([
    supabase.from("papers").select("title, authors, year, citation_count").eq("run_id", runId).order("citation_count", { ascending: false }).limit(20),
    supabase.from("literature_matrix").select("method, dataset, result, problem").eq("run_id", runId).limit(20),
    supabase.from("gaps").select("*").eq("run_id", runId).limit(1),
    supabase.from("hypotheses").select("*").eq("run_id", runId).limit(1),
    supabase.from("experiments").select("*").eq("run_id", runId).limit(1),
  ]);

  const papersText = (papers.data ?? []).map((p: any, i: number) =>
    `${i + 1}. ${p.title} (${p.year ?? "n/a"})`
  ).join("\n");
  const matrixText = (matrix.data ?? []).map((m: any) =>
    `- ${m.method || "—"} | ${m.dataset || "—"} | ${m.result || "—"} | ${m.problem || "—"}`
  ).join("\n");
  const gap = gaps.data?.[0];
  const hyp = hyps.data?.[0];
  const exp = exps.data?.[0];

  let out: any;
  try {
    out = await llmJson({
      system:
        "You are an expert scientific writer. Assemble a coherent, well-structured research proposal from the provided materials. Write 6-9 sections with meaningful headings (e.g. Introduction & Motivation, Literature Review, Research Gap, Proposed Hypothesis, Experiment Design, Expected Contributions & Risks, Timeline). Each section body must be 2-4 paragraphs of substantive prose, not bullet fragments. Keep everything grounded in the provided materials.",
      user:
        `Research query: ${run.query}\nMode: ${run.mode}\n\nKey papers:\n${papersText}\n\nLiterature matrix:\n${matrixText || "(none)"}\n\nGap:\n${gap?.statement ?? "n/a"}\nOpportunity: ${gap?.opportunity ?? "n/a"}\n\nHypothesis:\n${hyp?.hypothesis ?? "n/a"}\nConfidence: ${hyp?.confidence ?? "?"} / Novelty: ${hyp?.novelty ?? "?"}\nObjectives: ${JSON.stringify(hyp?.objectives ?? [])}\n\nExperiment:\nDataset: ${exp?.dataset ?? "n/a"}\nAlgorithm: ${exp?.algorithm ?? "n/a"}\nArchitecture: ${JSON.stringify(exp?.architecture_json ?? {})}\nMetrics: ${JSON.stringify(exp?.metrics_json ?? {})}`,
      schemaName: "research_report",
      schema: REPORT_SCHEMA,
      temperature: 0.5,
    });
  } catch (e) {
    console.error("report llm failed", e);
    await supabase
      .from("run_tasks")
      .update({
        status: "failed",
        error: (e as Error)?.message ?? "LLM failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    return json({ error: "Report generation failed", detail: (e as Error)?.message }, 500);
  }

  await supabase.from("reports").delete().eq("run_id", runId);
  const { data: savedReport, error: saveErr } = await supabase
    .from("reports")
    .insert({
      run_id: runId,
      title: out.title,
      abstract: out.abstract,
      sections_json: { sections: out.sections ?? [] },
    })
    .select()
    .single();
  if (saveErr) {
    await supabase
      .from("run_tasks")
      .update({ status: "failed", error: saveErr.message, updated_at: new Date().toISOString() })
      .eq("id", taskId);
    return json({ error: saveErr.message }, 500);
  }

  await supabase
    .from("run_tasks")
    .update({
      status: "done",
      output: { report_id: savedReport.id },
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  await supabase
    .from("research_runs")
    .update({
      status: "completed",
      current_stage: "report",
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return json({ run_id: runId, report: savedReport });
});
