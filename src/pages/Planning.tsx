import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ClipboardList,
  CheckCircle2,
  ArrowRight,
  Timer,
  Rocket,
  ChevronLeft,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRun } from "../context/RunContext";
import { fmtSeconds } from "../lib/format";
import type { PlanOutput, ResearchRun } from "../lib/types";
import {
  Button,
  Chip,
  ErrorBanner,
  ModeBadge,
  PageHeader,
  Spinner,
  StatusPill,
} from "../components/ui";

export function Planning() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { start, active, stages, refresh } = useRun();
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [plan, setPlan] = useState<PlanOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!runId) return;
    refresh(runId);
    let cancelled = false;
    (async () => {
      const { data: runData } = await supabase
        .from("research_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();
      if (!cancelled) setRun((runData as ResearchRun) ?? null);

      const { data: task } = await supabase
        .from("run_tasks")
        .select("output")
        .eq("run_id", runId)
        .eq("stage", "plan")
        .maybeSingle();
      if (!cancelled) {
        setPlan((task?.output as PlanOutput | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runId, refresh]);

  const handleApprove = async () => {
    if (!runId || starting) return;
    setStarting(true);
    setError(null);
    try {
      navigate(`/knowledge/${runId}`);
      void start(runId).finally(() => setStarting(false));
    } catch (e) {
      setError((e as Error).message || "Couldn't start the pipeline.");
      setStarting(false);
    }
  };

  const savePlan = async () => {
    if (!runId || !plan || saving) return;
    setSaving(true);
    setError(null);
    const cleaned: PlanOutput = {
      ...plan,
      objective: plan.objective.trim(),
      tasks: plan.tasks
        .map((task) => ({
          title: task.title.trim(),
          description: task.description.trim(),
        }))
        .filter((task) => task.title),
    };
    const { error: saveError } = await supabase
      .from("run_tasks")
      .update({ output: cleaned })
      .eq("run_id", runId)
      .eq("stage", "plan");
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setPlan(cleaned);
    setEditing(false);
  };

  const planStage = stages.find((s) => s.key === "plan");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <Link
        to="/dashboard"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-foreground/55 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft size={15} aria-hidden="true" /> Back to dashboard
      </Link>

      <PageHeader
        eyebrow="Planning Agent"
        title={run?.query ?? "Loading plan…"}
        subtitle="NOVA reviewed your question and drafted an execution plan. Approve it to kick off the autonomous pipeline."
        right={
          run ? (
            <>
              <ModeBadge mode={run.mode} />
              <StatusPill status={run.status} />
            </>
          ) : null
        }
      />

      {error ? <ErrorBanner className="mb-5">{error}</ErrorBanner> : null}

      {loading ? (
        <div className="space-y-3">
          <div className="glass-soft h-32 animate-pulse rounded-2xl" />
          <div className="glass-soft h-64 animate-pulse rounded-2xl" />
        </div>
      ) : plan ? (
        <div className="space-y-5">
          {/* Objective */}
          <section aria-label="Objective" className="glass-panel rounded-2xl p-6">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary">
              <ClipboardList size={14} aria-hidden="true" /> Objective
            </div>
            {editing ? (
              <textarea
                value={plan.objective}
                onChange={(event) => setPlan({ ...plan, objective: event.target.value })}
                aria-label="Research objective"
                rows={3}
                className="w-full resize-y rounded-xl border border-border bg-panel px-3 py-2 font-heading text-xl leading-snug text-foreground focus:border-primary focus:outline-2 focus:outline-ring"
              />
            ) : (
              <p className="font-heading text-xl leading-snug text-foreground">{plan.objective}</p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-foreground/55">
              <Chip tone="violet">
                <Timer size={11} aria-hidden="true" /> Est. {fmtSeconds(plan.estimated_time_seconds)}
              </Chip>
              <Chip tone="default">{plan.tasks.length} tasks</Chip>
            </div>
          </section>

          {/* Task breakdown */}
          <section aria-label="Plan breakdown" className="glass-soft rounded-2xl p-6">
            <h2 className="mb-4 font-heading text-lg text-foreground">Execution breakdown</h2>
            <ol className="space-y-3">
              {plan.tasks.map((t, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-panel font-mono text-xs text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <div className="space-y-2">
                        <input
                          value={t.title}
                          onChange={(event) => setPlan({
                            ...plan,
                            tasks: plan.tasks.map((task, taskIndex) =>
                              taskIndex === i ? { ...task, title: event.target.value } : task,
                            ),
                          })}
                          aria-label={`Task ${i + 1} title`}
                          className="w-full rounded-lg border border-border bg-panel px-3 py-2 font-medium text-foreground focus:border-primary focus:outline-2 focus:outline-ring"
                        />
                        <textarea
                          value={t.description}
                          onChange={(event) => setPlan({
                            ...plan,
                            tasks: plan.tasks.map((task, taskIndex) =>
                              taskIndex === i ? { ...task, description: event.target.value } : task,
                            ),
                          })}
                          aria-label={`Task ${i + 1} description`}
                          rows={2}
                          className="w-full resize-y rounded-lg border border-border bg-panel px-3 py-2 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-2 focus:outline-ring"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="font-medium capitalize text-foreground">{t.title}</div>
                        <div className="mt-0.5 text-sm leading-relaxed text-foreground/60">{t.description}</div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Approval */}
          <section aria-label="Approve plan" className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 font-heading text-lg text-foreground">
                {active ? (
                  <>
                    <Spinner size={17} className="text-primary" /> Pipeline running
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} className="text-success" aria-hidden="true" /> Ready to go
                  </>
                )}
              </div>
              <p className="mt-1 text-sm text-foreground/60">
                {active
                  ? "Agents are executing each stage now — you can watch them from the right rail."
                  : "Approve to search 5 sources, analyze the literature, find the gap, and build a hypothesis."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                    <X size={15} aria-hidden="true" /> Cancel
                  </Button>
                  <Button variant="secondary" onClick={savePlan} disabled={saving || !plan.objective.trim()}>
                    {saving ? <Spinner size={15} /> : <Save size={15} aria-hidden="true" />} Save plan
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setEditing(true)} disabled={active}>
                  <Pencil size={15} aria-hidden="true" /> Edit plan
                </Button>
              )}
              <Button size="lg" onClick={handleApprove} disabled={starting || active || planStage?.status !== "done"}>
                {starting || active ? <Spinner size={16} /> : <Rocket size={16} />}
                {starting ? "Launching…" : active ? "Running…" : "Approve & run"}
                {!starting && !active ? <ArrowRight size={16} /> : null}
              </Button>
            </div>
          </section>
        </div>
      ) : (
        <div className="glass-soft rounded-2xl p-6 text-sm text-foreground/60">
          This run has no plan yet. Head back to the dashboard and start a new research question.
        </div>
      )}
    </div>
  );
}
