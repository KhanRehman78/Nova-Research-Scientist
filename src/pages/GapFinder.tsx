import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Target, Lightbulb, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRunRow, useStageStatus } from "../lib/hooks";
import { truncate } from "../lib/format";
import type { Gap } from "../lib/types";
import {
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  ScoreBar,
  Spinner,
} from "../components/ui";

export function GapFinder() {
  const { runId } = useParams<{ runId: string }>();
  const { run } = useRunRow(runId);
  const { status, error } = useStageStatus(runId, "gap");
  const [gap, setGap] = useState<Gap | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("gaps")
        .select("*")
        .eq("run_id", runId)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setGap((data as Gap | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [runId, status]);

  const reasoning = status === "pending" || status === "running" || (status == null && !gap);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Interface 5 · Research Gap Finder"
        title="Where the literature is thin"
        subtitle={
          run
            ? `NOVA cross-referenced “${truncate(run.query, 70)}” against the corpus and its matrix to locate the most promising opening.`
            : "Detecting the research gap."
        }
        right={<Chip tone="violet">gap analysis</Chip>}
      />

      {error ? <ErrorBanner className="mb-5">Gap detection failed: {error}</ErrorBanner> : null}

      {reasoning ? (
        <div className="glass-panel rounded-3xl p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} className="text-secondary" />
            <div>
              <div className="font-heading text-lg text-foreground">Reasoning over the literature…</div>
              <div className="text-sm text-foreground/55">
                Weighing coverage vs. opportunity across thematic clusters to find the gap worth filling.
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
              <div className="h-2 w-11/12 animate-pulse rounded-full bg-border/50" />
            </div>
            <div className="space-y-2">
              <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
              <div className="h-2 w-4/5 animate-pulse rounded-full bg-border/50" />
            </div>
          </div>
        </div>
      ) : !gap ? (
        <EmptyState
          icon={Target}
          title="No gap analysis yet"
          body="Run the pipeline from Planning to detect the research gap automatically after the literature matrix is built."
        />
      ) : (
        <div className="space-y-6">
          {/* Gap statement */}
          <section aria-label="Gap statement" className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-secondary">
              <Target size={14} aria-hidden="true" /> Detected gap
            </div>
            <h2 className="font-heading text-2xl leading-snug text-foreground">{gap.title}</h2>
            <p className="mt-3 text-base leading-relaxed text-foreground/80">{gap.statement}</p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground/50">
                  <CheckCircle2 size={13} aria-hidden="true" /> What's already covered
                </div>
                <p className="text-sm leading-relaxed text-foreground/70">{gap.existing_coverage || "—"}</p>
              </div>
              <div className="rounded-2xl border border-border bg-panel p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-foreground/50">
                  <Sparkles size={13} className="text-primary" aria-hidden="true" /> The opportunity
                </div>
                <p className="text-sm leading-relaxed text-foreground/70">{gap.opportunity || "—"}</p>
              </div>
            </div>
          </section>

          {/* Cluster scores */}
          <section aria-label="Thematic clusters" className="glass-soft rounded-3xl p-6">
            <h3 className="mb-4 font-heading text-lg text-foreground">Thematic cluster map</h3>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {(gap.gap_map_json?.clusters ?? []).map((c) => (
                <div key={c.topic} className="rounded-2xl border border-border bg-panel p-4">
                  <div className="mb-3 font-medium text-foreground">{c.topic}</div>
                  <div className="space-y-3">
                    <ScoreBar label="Coverage (saturated?)" value={c.coverage_score} color="var(--color-warning)" />
                    <ScoreBar label="Opportunity (promising?)" value={c.opportunity_score} color="var(--color-success)" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Missing topics */}
          <section aria-label="Missing topics" className="glass-soft rounded-3xl p-6">
            <div className="mb-3 flex items-center gap-2 font-heading text-lg text-foreground">
              <Lightbulb size={18} className="text-primary" aria-hidden="true" /> Missing topics
            </div>
            {gap.gap_map_json?.missing_topics?.length ? (
              <div className="flex flex-wrap gap-2">
                {gap.gap_map_json.missing_topics.map((t) => (
                  <Chip key={t} tone="primary">{t}</Chip>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/55">No missing topics surfaced this run.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
