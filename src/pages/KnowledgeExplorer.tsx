import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Network, ExternalLink, Layers, CalendarDays } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRunRow, useStageStatus } from "../lib/hooks";
import { KnowledgeGraph } from "../components/KnowledgeGraph";
import { SOURCES } from "../lib/constants";
import { fmtNum, truncate } from "../lib/format";
import type { Paper, SearchSummary } from "../lib/types";
import {
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  SourceBadge,
  Spinner,
  StatCard,
} from "../components/ui";

export function KnowledgeExplorer() {
  const { runId } = useParams<{ runId: string }>();
  const { run } = useRunRow(runId);
  const { status, output, error } = useStageStatus(runId, "search");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("papers")
        .select("*")
        .eq("run_id", runId)
        .order("citation_count", { ascending: false })
        .limit(200);
      if (!cancelled) setPapers((data as Paper[]) ?? []);
    })();
    return () => { cancelled = true; };
  }, [runId, status]);

  const summary = (output ?? null) as SearchSummary | null;
  const avgYear = useMemo(() => {
    const ys = papers.map((p) => p.year).filter((y): y is number => !!y);
    return ys.length ? Math.round(ys.reduce((a, b) => a + b, 0) / ys.length) : null;
  }, [papers]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searching = status === "pending" || status === "running" || (status == null && papers.length === 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Interface 3 · Knowledge Explorer"
        title="Visual knowledge map"
        subtitle={
          run
            ? `“${run.query}” — papers pulled live from 5 academic sources, clustered by source.`
            : "Mapping the literature landscape."
        }
        right={<Chip tone={status === "done" ? "success" : "primary"}>{papers.length} papers</Chip>}
      />

      {error ? <ErrorBanner className="mb-5">The search stage failed: {error}</ErrorBanner> : null}

      {/* Stats row */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Papers retrieved" value={papers.length} sub="after de-duplication" icon={Network} />
        <StatCard
          label="Sources"
          value={Object.keys(SOURCES).length}
          sub="arXiv · S2 · PubMed · OpenAlex · Crossref"
          icon={Layers}
          accent="text-secondary"
        />
        <StatCard label="Avg. year" value={avgYear ?? "—"} sub="of retrieved corpus" icon={CalendarDays} accent="text-success" />
      </div>

      {searching ? (
        <div className="glass-panel rounded-3xl p-8">
          <div className="mb-6 flex items-center gap-3">
            <Spinner size={20} className="text-primary" />
            <div>
              <div className="font-heading text-lg text-foreground">Scanning the literature…</div>
              <div className="text-sm text-foreground/55">
                Querying arXiv, Semantic Scholar, PubMed, OpenAlex and Crossref in parallel.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.values(SOURCES).map((s) => (
              <span key={s.label} className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-sm" style={{ color: s.color }}>
                <span className="h-2 w-2 animate-pulse-soft rounded-full" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </span>
            ))}
          </div>
          {summary?.sources?.length ? (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-xs uppercase tracking-widest text-foreground/50">Source status</div>
              <div className="flex flex-wrap gap-2">
                {summary.sources.map((s) => (
                  <SourceBadge key={s.source} source={s.source} count={s.count} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : papers.length === 0 ? (
        <EmptyState
          icon={Network}
          title="Nothing surfaced yet"
          body="The search came back empty — try a more specific query, or re-run research from the dashboard."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          {/* Graph */}
          <section aria-label="Knowledge map" className="glass-panel rounded-3xl p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 pt-2">
              <h2 className="font-heading text-lg text-foreground">Knowledge map</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(SOURCES).map(([key]) => (
                  <SourceBadge key={key} source={key} />
                ))}
              </div>
            </div>
            <KnowledgeGraph papers={papers} query={run?.query ?? "research question"} />
            <p className="px-2 pb-1 text-center text-xs text-foreground/40">
              Node size ∝ citation count · hover any node for details
            </p>
          </section>

          {/* Paper list */}
          <section aria-label="Paper cards" className="min-w-0">
            <h2 className="mb-3 font-heading text-lg text-foreground">Top papers</h2>
            <ul className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
              {papers.map((p) => {
                const isOpen = expanded.has(p.id);
                return (
                  <li key={p.id} className="glass-soft rounded-2xl p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <SourceBadge source={p.source} />
                      <span className="font-mono text-xs text-foreground/50">{p.year ?? "n/a"}</span>
                      <span className="font-mono text-xs text-foreground/50">· {fmtNum(p.citation_count)} cites</span>
                    </div>
                    <h3 className="font-heading text-base leading-snug text-foreground">{p.title}</h3>
                    {p.authors?.length ? (
                      <p className="mt-1 truncate text-xs text-foreground/50">
                        {p.authors.slice(0, 4).join(", ")}
                        {p.authors.length > 4 ? ` +${p.authors.length - 4}` : ""}
                      </p>
                    ) : null}
                    {p.abstract ? (
                      <p className="mt-2 text-sm leading-relaxed text-foreground/65">
                        {isOpen ? p.abstract : truncate(p.abstract, 220)}
                        {p.abstract.length > 220 ? (
                          <button
                            onClick={() => toggleExpand(p.id)}
                            className="ml-1 cursor-pointer text-primary hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {isOpen ? "less" : "more"}
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                    {(p.url || p.doi || p.open_access_pdf) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {p.url ? (
                          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-ring">
                            <ExternalLink size={12} aria-hidden="true" /> Paper
                          </a>
                        ) : null}
                        {p.doi ? (
                          <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-foreground/55 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
                            <ExternalLink size={12} aria-hidden="true" /> DOI
                          </a>
                        ) : null}
                        {p.open_access_pdf ? (
                          <a href={p.open_access_pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-success hover:text-success/80 focus-visible:outline-2 focus-visible:outline-ring">
                            <ExternalLink size={12} aria-hidden="true" /> Open PDF
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
