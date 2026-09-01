import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { FlaskConical, Check, ArrowRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRunRow, useStageStatus } from "../lib/hooks";
import { truncate, pct } from "../lib/format";
import type { Hypothesis } from "../lib/types";
import {
  Button,
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  ScoreBar,
  Spinner,
} from "../components/ui";

export function HypothesisStudio() {
  const { runId } = useParams<{ runId: string }>();
  const { run } = useRunRow(runId);
  const { status, error } = useStageStatus(runId, "hypothesis");
  const [hyp, setHyp] = useState<Hypothesis | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("hypotheses")
        .select("*")
        .eq("run_id", runId)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setHyp((data as Hypothesis | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [runId, status]);

  const generating = status === "pending" || status === "running" || (status == null && !hyp);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Interface 6 · Hypothesis Studio"
        title="A testable hypothesis"
        subtitle={
          run
            ? `Formulated to directly attack the detected gap in “${truncate(run.query, 60)}”.`
            : "Formulating the hypothesis."
        }
        right={<Chip tone="violet">hypothesis · experiment</Chip>}
      />

      {error ? <ErrorBanner className="mb-5">Hypothesis generation failed: {error}</ErrorBanner> : null}

      {generating ? (
        <div className="glass-panel rounded-3xl p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} className="text-secondary" />
            <div>
              <div className="font-heading text-lg text-foreground">Synthesizing a hypothesis…</div>
              <div className="text-sm text-foreground/55">
                The scientist agent is weaving the gap and literature matrix into a novel, testable claim.
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-2 w-3/4 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-5/6 animate-pulse rounded-full bg-border/50" />
          </div>
        </div>
      ) : !hyp ? (
        <EmptyState
          icon={FlaskConical}
          title="No hypothesis yet"
          body="This stage runs right after the gap is found. Launch the pipeline from Planning to generate it."
        />
      ) : (
        <div className="space-y-6">
          <section aria-label="Hypothesis" className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-secondary">
              <FlaskConical size={14} aria-hidden="true" /> Proposed hypothesis
            </div>
            <h2 className="font-heading text-2xl leading-snug text-foreground">{hyp.title}</h2>
            <p className="mt-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-lg leading-relaxed text-foreground">
              {hyp.hypothesis}
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <ScoreBar label="Confidence" value={hyp.confidence} color="var(--color-primary)" right={pct(hyp.confidence)} />
              <ScoreBar label="Novelty" value={hyp.novelty} color="var(--color-secondary)" right={pct(hyp.novelty)} />
            </div>
          </section>

          <section aria-label="Objectives" className="glass-soft rounded-3xl p-6">
            <h3 className="mb-4 font-heading text-lg text-foreground">Research objectives</h3>
            <ol className="space-y-3">
              {hyp.objectives.map((o, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-secondary">
                    <Check size={13} aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-relaxed text-foreground/80">{o}</span>
                </li>
              ))}
            </ol>
          </section>

          {hyp.expected_contribution ? (
            <section aria-label="Expected contribution" className="glass-soft rounded-3xl p-6">
              <h3 className="mb-2 font-heading text-lg text-foreground">Expected contribution</h3>
              <p className="text-sm leading-relaxed text-foreground/70">{hyp.expected_contribution}</p>
            </section>
          ) : null}

          <div className="flex justify-end">
            <Link to={`/experiment/${runId}`}>
              <Button>
                Design the experiment <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
