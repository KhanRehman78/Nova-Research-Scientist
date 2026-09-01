import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ArrowUpDown,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  Table2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRunRow, useStageStatus } from "../lib/hooks";
import { truncate } from "../lib/format";
import type { LiteratureRow, Paper } from "../lib/types";
import {
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
  StatCard,
} from "../components/ui";

export function LiteratureRoom() {
  const { runId } = useParams<{ runId: string }>();
  const { run } = useRunRow(runId);
  const { status, error } = useStageStatus(runId, "paper-reader");
  const [rows, setRows] = useState<(LiteratureRow & { paper_title?: string })[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: keyof (LiteratureRow & { paper_title?: string }); direction: "asc" | "desc" }>({
    key: "paper_title",
    direction: "asc",
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      const { data: matrix } = await supabase
        .from("literature_matrix")
        .select("*")
        .eq("run_id", runId)
        .order("extracted_at", { ascending: true });
      const m = (matrix ?? []) as LiteratureRow[];

      const paperIds = [...new Set(m.map((r) => r.paper_id).filter(Boolean))];
      const titles = new Map<string, string>();
      if (paperIds.length) {
        const { data: papers } = await supabase
          .from("papers")
          .select("id, title")
          .in("id", paperIds);
        ((papers ?? []) as Paper[]).forEach((p) => titles.set(p.id, p.title));
      }

      if (!cancelled) {
        setRows(m.map((r) => ({ ...r, paper_title: titles.get(r.paper_id) })));
      }
    })();
    return () => { cancelled = true; };
  }, [runId, status]);

  const problems = useMemo(
    () => [...new Set(rows.map((r) => r.problem).filter(Boolean))] as string[],
    [rows],
  );
  const visible = useMemo(() => {
    const filtered = filter === "all" ? rows : rows.filter((row) => row.problem === filter);
    return [...filtered].sort((left, right) => {
      const a = String(left[sort.key] ?? "").toLocaleLowerCase();
      const b = String(right[sort.key] ?? "").toLocaleLowerCase();
      return a.localeCompare(b) * (sort.direction === "asc" ? 1 : -1);
    });
  }, [filter, rows, sort]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const methods = new Set(rows.map((r) => r.method).filter(Boolean)).size;

  const reading = status === "pending" || status === "running" || (status == null && rows.length === 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Interface 4 · Literature Review Room"
        title="Literature matrix"
        subtitle="NOVA read the retrieved papers and extracted the methods, datasets, results and open problems into a reviewable matrix."
        right={<Chip tone={status === "done" ? "success" : "primary"}>{rows.length} findings</Chip>}
      />

      {error ? <ErrorBanner className="mb-5">The analysis stage failed: {error}</ErrorBanner> : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Findings extracted" value={rows.length} sub="method · dataset · result" icon={Table2} />
        <StatCard label="Distinct methods" value={methods} sub="across the corpus" icon={FileText} accent="text-secondary" />
        <StatCard label="Open problems" value={problems.length} sub="flagged in the literature" icon={Filter} accent="text-success" />
      </div>

      {reading ? (
        <div className="glass-panel rounded-3xl p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} className="text-primary" />
            <div>
              <div className="font-heading text-lg text-foreground">Reading papers…</div>
              <div className="text-sm text-foreground/55">
                Extracting methods, datasets, results and limitations from {run?.query ? `“${truncate(run.query, 60)}”` : "the corpus"}.
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <div className="h-2 w-3/4 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-5/6 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-2/3 animate-pulse rounded-full bg-border/50" />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpenText}
          title="No literature matrix yet"
          body="This stage runs automatically after the knowledge map fills up. Start the pipeline from Planning to analyze the papers."
        />
      ) : (
        <div className="space-y-4">
          {problems.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-foreground/55">Filter by open problem:</span>
              <button
                onClick={() => { setFilter("all"); setPage(1); }}
                aria-pressed={filter === "all"}
                className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring ${
                  filter === "all"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-panel text-foreground/65 hover:text-foreground"
                }`}
              >
                All
              </button>
              {problems.map((p) => (
                <button
                  key={p}
                  onClick={() => { setFilter(p); setPage(1); }}
                  aria-pressed={filter === p}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring ${
                    filter === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-panel text-foreground/65 hover:text-foreground"
                  }`}
                >
                  {truncate(p, 28)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="glass-panel overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-border text-xs uppercase tracking-wider text-foreground/50">
                  <SortableHead label="Paper" column="paper_title" sort={sort} onSort={setSort} />
                  <SortableHead label="Method" column="method" sort={sort} onSort={setSort} />
                  <SortableHead label="Dataset" column="dataset" sort={sort} onSort={setSort} />
                  <SortableHead label="Result" column="result" sort={sort} onSort={setSort} />
                  <SortableHead label="Open problem" column="problem" sort={sort} onSort={setSort} />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, index) => (
                  <tr key={r.id} className={`border-b border-border/50 align-top last:border-0 hover:bg-primary/5 ${index % 2 ? "bg-panel/35" : ""}`}>
                    <td className="max-w-[15rem] px-4 py-3">
                      <span className="line-clamp-2 leading-snug text-foreground">{r.paper_title ?? "Untitled paper"}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground/75">{r.method || "—"}</td>
                    <td className="px-4 py-3 text-foreground/75">{r.dataset || "—"}</td>
                    <td className="px-4 py-3 text-foreground/75">{truncate(r.result, 90)}</td>
                    <td className="max-w-[14rem] px-4 py-3">
                      {r.problem ? (
                        <Chip tone="warning">{truncate(r.problem, 46)}</Chip>
                      ) : (
                        <span className="text-foreground/35">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-foreground/55">
            <span>
              Showing {visible.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length} results
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-panel px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronLeft size={13} aria-hidden="true" /> Previous
              </button>
              <span className="font-mono">{currentPage} / {pageCount}</span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage === pageCount}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-panel px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-primary disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Next <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type SortState = {
  key: keyof (LiteratureRow & { paper_title?: string });
  direction: "asc" | "desc";
};

function SortableHead({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortState["key"];
  sort: SortState;
  onSort: (sort: SortState) => void;
}) {
  const active = sort.key === column;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort({
          key: column,
          direction: active && sort.direction === "asc" ? "desc" : "asc",
        })}
        className="inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
      >
        {label}
        <ArrowUpDown size={12} className={active ? "text-primary" : "text-foreground/30"} aria-hidden="true" />
        {active ? <span className="sr-only">sorted {sort.direction}ending</span> : null}
      </button>
    </th>
  );
}
