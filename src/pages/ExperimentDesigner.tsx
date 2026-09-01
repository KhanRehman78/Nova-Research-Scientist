import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Beaker, Database, Cpu, Gauge, ArrowRight, Layers } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRunRow, useStageStatus } from "../lib/hooks";
import type { Experiment } from "../lib/types";
import {
  Button,
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from "../components/ui";

export function ExperimentDesigner() {
  const { runId } = useParams<{ runId: string }>();
  const { run } = useRunRow(runId);
  const { status, error } = useStageStatus(runId, "experiment");
  const [exp, setExp] = useState<Experiment | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("experiments")
        .select("*")
        .eq("run_id", runId)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setExp((data as Experiment | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [runId, status]);

  const layers = exp?.architecture_json?.layers ?? [];
  const metrics = exp?.metrics_json?.metrics ?? [];

  const generating = status === "pending" || status === "running" || (status == null && !exp);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Interface 7 · Experiment Designer"
        title="Blueprint for the experiment"
        subtitle={
          run
            ? `A concrete protocol to validate the hypothesis for “${run.query.slice(0, 60)}${run.query.length > 60 ? "…" : ""}”.`
            : "Drafting the experimental protocol."
        }
        right={<Chip tone="violet">experiment design</Chip>}
      />

      {error ? <ErrorBanner className="mb-5">Experiment design failed: {error}</ErrorBanner> : null}

      {generating ? (
        <div className="glass-panel rounded-3xl p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} className="text-secondary" />
            <div>
              <div className="font-heading text-lg text-foreground">Drafting the protocol…</div>
              <div className="text-sm text-foreground/55">Selecting the dataset, architecture, and evaluation metrics.</div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-11/12 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-3/4 animate-pulse rounded-full bg-border/50" />
          </div>
        </div>
      ) : !exp ? (
        <EmptyState
          icon={Beaker}
          title="No experiment designed yet"
          body="The experiment is drafted together with the hypothesis. Run the pipeline from Planning to generate it."
        />
      ) : (
        <div className="space-y-6">
          {/* Core specs */}
          <section aria-label="Core specs" className="grid gap-4 sm:grid-cols-2">
            <div className="glass-soft rounded-3xl p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-foreground/50">
                <Database size={14} className="text-primary" aria-hidden="true" /> Recommended dataset
              </div>
              <p className="font-heading text-lg leading-snug text-foreground">{exp.dataset || "—"}</p>
            </div>
            <div className="glass-soft rounded-3xl p-5">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-foreground/50">
                <Cpu size={14} className="text-primary" aria-hidden="true" /> Algorithm
              </div>
              <p className="font-heading text-lg leading-snug text-foreground">{exp.algorithm || "—"}</p>
            </div>
          </section>

          {/* Architecture layers */}
          <section aria-label="Architecture" className="glass-soft rounded-3xl p-6">
            <div className="mb-4 flex items-center gap-2 font-heading text-lg text-foreground">
              <Layers size={18} className="text-secondary" aria-hidden="true" /> Architecture
            </div>
            {layers.length ? (
              <ol className="relative space-y-4 border-l border-border pl-6">
                {layers.map((l, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[30px] flex h-4 w-4 items-center justify-center rounded-full border border-border bg-panel text-[9px] text-primary">
                      {i + 1}
                    </span>
                    <div className="rounded-2xl border border-border bg-panel p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{l.name}</span>
                        <Chip tone="primary">{l.type}</Chip>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground/65">{l.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-foreground/55">No architecture layers specified.</p>
            )}
          </section>

          {/* Metrics */}
          <section aria-label="Evaluation metrics" className="glass-soft rounded-3xl p-6">
            <div className="mb-3 flex items-center gap-2 font-heading text-lg text-foreground">
              <Gauge size={18} className="text-success" aria-hidden="true" /> Evaluation metrics
            </div>
            {metrics.length ? (
              <div className="flex flex-wrap gap-2">
                {metrics.map((m) => (
                  <Chip key={m} tone="success">{m}</Chip>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/55">No metrics specified.</p>
            )}
          </section>

          <div className="flex justify-end">
            <Link to={`/report/${runId}`}>
              <Button>
                Generate the research proposal <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
