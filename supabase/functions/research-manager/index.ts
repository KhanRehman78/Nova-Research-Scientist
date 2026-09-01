// NOVA research-manager — plans a research run and orchestrates the agent pipeline.
import { getAuthedClient, json, ok } from "../_shared/mod.ts";
import { llmJson } from "../_shared/llm.ts";

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["objective", "tasks", "estimated_time_seconds"],
  properties: {
    objective: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    estimated_time_seconds: { type: "number" },
  },
};

const STAGES = [
  "plan",
  "search",
  "paper-reader",
  "gap",
  "hypothesis",
  "experiment",
  "report",
];

const MODES = ["quick", "deep", "expert"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (e: any) {
    return json({ error: e.message }, e.status ?? 401);
  }
  const { supabase, user } = authed;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action ?? "plan";

  if (action === "plan") {
    const query = (body.query ?? "").trim();
    const mode = body.mode ?? "quick";
    const projectId = body.project_id;

    if (!query) return json({ error: "query is required" }, 400);
    if (!MODES.includes(mode)) return json({ error: "Invalid mode" }, 400);
    if (!projectId) return json({ error: "project_id is required" }, 400);

    // Create the run. RLS enforces that the user owns/joins this project.
    const { data: run, error: runErr } = await supabase
      .from("research_runs")
      .insert({
        project_id: projectId,
        user_id: user.id,
        query,
        mode,
        status: "planning",
        current_stage: "plan",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (runErr || !run) {
      return json({ error: runErr?.message ?? "Could not create run" }, 500);
    }

    // Seed task rows for every stage.
    await supabase.from("run_tasks").insert(
      STAGES.map((stage) => ({
        run_id: run.id,
        stage,
        status: "pending",
        input: {},
        updated_at: new Date().toISOString(),
      })),
    );

    let plan: any;
    try {
      plan = await llmJson({
        system:
          "You are a research director. Turn a natural-language research question into a concise, executable research plan. Write one clear objective, 4-7 concrete research tasks, and a realistic estimated duration in seconds for the chosen mode.",
        user: `Research question: ${query}\nMode: ${mode}`,
        schemaName: "research_plan",
        schema: PLAN_SCHEMA,
        temperature: 0.4,
      });
    } catch (e) {
      // Plan failure must not block the demo — fall back to a sensible default.
      plan = {
        objective: `Investigate: ${query}`,
        tasks: STAGES.slice(1).map((s) => ({
          title: s.replaceAll("-", " "),
          description: `Execute the ${s} stage for the query.`,
        })),
        estimated_time_seconds: 150,
      };
    }

    await supabase
      .from("run_tasks")
      .update({ status: "done", output: plan, updated_at: new Date().toISOString() })
      .eq("run_id", run.id)
      .eq("stage", "plan");

    return json({ run_id: run.id, plan });
  }

  if (action === "run") {
    const runId = body.run_id;
    if (!runId) return json({ error: "run_id is required" }, 400);

    const { data: run, error: runErr } = await supabase
      .from("research_runs")
      .select("id, query, mode, project_id")
      .eq("id", runId)
      .single();
    if (runErr || !run) return json({ error: "Run not found or forbidden" }, 404);

    await supabase
      .from("research_runs")
      .update({ status: "running", current_stage: "search", updated_at: new Date().toISOString() })
      .eq("id", runId);

    const authHeader = req.headers.get("authorization") ?? "";
    const stages = ["search-agent", "paper-reader", "reasoning-gap", "scientist-hypothesis", "report-writer"];
    const stageNames = ["search", "paper-reader", "gap", "hypothesis", "report"];
    const results: Record<string, any> = {};
    let failed = false;

    for (let i = 0; i < stages.length; i++) {
      const fn = stages[i];
      const stage = stageNames[i];
      await supabase
        .from("research_runs")
        .update({ current_stage: stage, updated_at: new Date().toISOString() })
        .eq("id", runId);
      try {
        const data = await callAgent(fn, runId, authHeader);
        results[stage] = data;
      } catch (e) {
        failed = true;
        results[stage] = { error: (e as Error)?.message };
        await supabase
          .from("run_tasks")
          .update({ status: "failed", error: (e as Error)?.message, updated_at: new Date().toISOString() })
          .eq("run_id", runId)
          .eq("stage", stage);
        break;
      }
    }

    const finalStatus = failed ? "failed" : "completed";
    await supabase
      .from("research_runs")
      .update({
        status: finalStatus,
        current_stage: "report",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return json({ run_id: runId, status: finalStatus, results });
  }

  return json({ error: "Unknown action (use 'plan' or 'run')" }, 400);
});

async function callAgent(name: string, runId: string, authHeader: string): Promise<any> {
  const base = Deno.env.get("SUPABASE_URL")!;
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    },
    body: JSON.stringify({ run_id: runId }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${name} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return data;
}
