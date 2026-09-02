import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Rocket,
  Sparkles,
  Network,
  Target,
  FlaskConical,
  FileText,
  ClipboardList,
  Library,
  Beaker,
  Clock,
  ChevronRight,
  FolderOpen,
  Search,
  UsersRound,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useRun } from "../context/RunContext";
import { supabase } from "../lib/supabase";
import {
  MODES,
  MODE_META,
  STAGES,
  routeForStage,
  ROLE_LABEL,
} from "../lib/constants";
import type { Mode, ResearchRun } from "../lib/types";
import { timeAgo } from "../lib/format";
import {
  Button,
  Chip,
  EmptyState,
  ErrorBanner,
  ModeBadge,
  PageHeader,
  Spinner,
  StatCard,
  StatusPill,
} from "../components/ui";
import { TeamPanel } from "../components/TeamPanel";

const STAGE_ICONS: Record<string, { icon: typeof Rocket; desc: string }> = {
  plan: { icon: ClipboardList, desc: "Research plan" },
  search: { icon: Network, desc: "Knowledge explorer" },
  "paper-reader": { icon: Library, desc: "Literature room" },
  gap: { icon: Target, desc: "Gap finder" },
  hypothesis: { icon: FlaskConical, desc: "Hypothesis studio" },
  experiment: { icon: Beaker, desc: "Experiment designer" },
  report: { icon: FileText, desc: "Report generator" },
};

const EXAMPLE_QUERIES = [
  "How can foundation models be made more interpretable in medical imaging?",
  "What reinforcement learning methods improve multi-agent coordination under partial observability?",
  "How do diffusion models compare for small-molecule drug design?",
  "What causal inference approaches work for observational electronic health records?",
];

export function Dashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { reset } = useRun();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("quick");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [totalPapers, setTotalPapers] = useState<number | null>(null);

  useEffect(() => {
    reset();
  }, [reset]);

  // RLS returns both owned and shared projects. Ensure first-time users get a
  // default workspace, then let them switch between all accessible projects.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setLoadingRuns(false);
        return;
      }
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .order("created_at")
      let available = (projects ?? []) as { id: string; name: string }[];
      let pid = available[0]?.id ?? null;
      if (!pid) {
        const created = { id: crypto.randomUUID(), name: "My Research" };
        const { error: createError } = await supabase
          .from("projects")
          .insert({
            id: created.id,
            name: created.name,
            description: "Default project",
            owner_id: user.id,
          });
        if (!createError) {
          pid = created.id;
          available = [created];
        }
      }
      if (cancelled) return;
      setProjects(available);
      setProjectId(pid);
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoadingRuns(true);
    (async () => {
      const { data: runRows } = await supabase
        .from("research_runs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(25);
      const loadedRuns = (runRows as ResearchRun[]) ?? [];
      if (!cancelled) setRuns(loadedRuns);

      const runIds = loadedRuns.map((run) => run.id);
      let paperCount = 0;
      if (runIds.length) {
        const { count } = await supabase
          .from("papers")
          .select("id", { count: "exact", head: true })
          .in("run_id", runIds);
        paperCount = count ?? 0;
      }
      if (!cancelled) {
        setTotalPapers(paperCount);
        setLoadingRuns(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const handleStart = useCallback(async () => {
    if (!query.trim() || busy) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    if (!projectId) {
      setError("Couldn't set up your workspace — try again in a moment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("research-manager", {
        body: { action: "plan", project_id: projectId, query: query.trim(), mode },
      });
      if (fnError || !data?.run_id) {
        throw new Error(data?.error ?? fnError?.message ?? "Plan request failed");
      }
      navigate(`/plan/${data.run_id}`);
    } catch (e) {
      setError((e as Error).message || "We couldn't start that run. Please try again.");
      setBusy(false);
    }
  }, [query, mode, projectId, busy, navigate, user]);

  const stageStrip = useMemo(
    () => (
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STAGES.map((s, i) => {
          const meta = STAGE_ICONS[s.key];
          const Icon = meta?.icon ?? Rocket;
          return (
            <li key={s.key} className="glass-soft group relative overflow-hidden rounded-2xl p-4">
              <span className="absolute right-3 top-2 font-mono text-[10px] text-foreground/25">0{i + 1}</span>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-150 group-hover:scale-110">
                <Icon size={19} aria-hidden="true" />
              </div>
              <div className="font-medium text-foreground">{s.label}</div>
              <div className="text-xs text-foreground/50">{meta?.desc}</div>
            </li>
          );
        })}
        <li className="glass-panel flex items-center justify-center rounded-2xl p-4">
          <div className="text-center">
            <Sparkles size={20} className="mx-auto mb-1 text-primary" aria-hidden="true" />
            <div className="text-xs text-foreground/60">You're in the driver's seat</div>
          </div>
        </li>
      </ol>
    ),
    [],
  );

  const runsDone = runs.filter((r) => r.status === "completed").length;

  return (
    <div className="bg-dotgrid-glow min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          eyebrow={`${ROLE_LABEL[profile?.role ?? "student"] ?? "Researcher"} Dashboard`}
          title={profile?.role === "professor" || profile?.role === "lab_admin" ? "Research intelligence and supervision" : "Launch autonomous research"}
          subtitle="Describe the question. NOVA plans the approach, gathers the literature, finds the gap, and drafts a hypothesis and proposal."
        />

        {user ? <Link to="/professional" className="glass-soft mb-6 flex items-center justify-between gap-4 rounded-2xl border-secondary/30 p-4 transition-colors hover:border-secondary/60 focus-visible:outline-2 focus-visible:outline-ring"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary"><GraduationCap size={19} /></span><span><span className="block font-heading text-base">Open {ROLE_LABEL[profile?.role ?? "student"] ?? "Professional"} Studio</span><span className="block text-xs text-foreground/50">Role-aware topic, paper, roadmap, reviewer, supervision and lab workflows.</span></span></span><ChevronRight size={18} className="shrink-0 text-secondary" /></Link> : null}

        {/* Launch card */}
        <section aria-label="Start a research run" className="glass-panel rounded-3xl p-6 sm:p-8">
          <label htmlFor="research-query" className="mb-2 block text-sm font-medium text-foreground/80">
            What do you want to research?
          </label>
          <textarea
            id="research-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleStart();
            }}
            placeholder="e.g. How can foundation models be made more interpretable in medical imaging?"
            rows={3}
            className="w-full resize-none rounded-2xl border border-border bg-panel px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/50"
          />

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="mr-1 self-center text-xs text-foreground/45">Try:</span>
            {EXAMPLE_QUERIES.slice(0, 3).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                className="cursor-pointer rounded-full border border-border bg-panel px-3 py-1 text-xs text-foreground/70 transition-colors duration-150 hover:border-primary/50 hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
              >
                {q.length > 46 ? `${q.slice(0, 46)}…` : q}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div role="radiogroup" aria-label="Research depth" className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  role="radio"
                  aria-checked={mode === m.key}
                  onClick={() => setMode(m.key)}
                  className={`cursor-pointer rounded-2xl border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    mode === m.key
                      ? "border-primary bg-primary/10"
                      : "border-border bg-panel hover:border-border/70"
                  }`}
                >
                  <div className={`text-sm font-semibold ${mode === m.key ? "text-primary" : "text-foreground"}`}>
                    {m.label}
                  </div>
                  <div className="mt-0.5 max-w-[15rem] text-[11px] leading-tight text-foreground/55">{m.desc}</div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-foreground/40">
                    <Clock size={10} aria-hidden="true" /> ~{m.minutes} min
                  </div>
                </button>
              ))}
            </div>

            <Button size="lg" onClick={handleStart} disabled={busy || !query.trim()}>
              {busy ? <Spinner size={17} /> : <Rocket size={17} />}
              {busy ? "Planning…" : "Start research"}
            </Button>
          </div>

          {error ? <ErrorBanner className="mt-4">{error}</ErrorBanner> : null}
        </section>

        {/* Stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Research runs" value={runs.length} sub="across your workspace" icon={FolderOpen} />
          <StatCard label="Completed" value={runsDone} sub="reports generated" icon={FileText} accent="text-success" />
          <StatCard label="Papers gathered" value={totalPapers ?? 0} sub="from 5 academic sources" icon={Search} accent="text-secondary" />
        </div>

        {/* Team & access */}
        {user ? <div className="mt-8">
          {projects.length > 1 ? (
            <label className="mb-3 flex max-w-sm items-center gap-2 text-sm text-foreground/70">
              <UsersRound size={16} className="text-secondary" aria-hidden="true" />
              <span className="shrink-0">Workspace</span>
              <select
                value={projectId ?? ""}
                onChange={(event) => setProjectId(event.target.value)}
                className="min-w-0 flex-1 cursor-pointer rounded-xl border border-border bg-panel px-3 py-2 text-foreground focus:border-primary focus:outline-2 focus:outline-ring"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <TeamPanel projectId={projectId} />
        </div> : null}

        {/* Recent runs */}
        <section className="mt-10" aria-label="Recent research runs">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-xl text-foreground">Recent research</h2>
            {runs.length > 0 ? (
              <Link to="/dashboard" className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-ring">
                View all <ChevronRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          {loadingRuns ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="glass-soft h-28 animate-pulse rounded-2xl" />
              <div className="glass-soft h-28 animate-pulse rounded-2xl" />
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Rocket}
              title="No research runs yet"
              body="Type a question above and hit “Start research” — NOVA will plan, search, analyze, and hand you a full proposal."
              action={
                <Button onClick={() => document.getElementById("research-query")?.focus()}>
                  Ask your first question
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {runs.map((run) => (
                <li key={run.id}>
                  <Link
                    to={routeForStage(run.current_stage, run.id)}
                    className="glass-soft group block rounded-2xl p-4 transition-[border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <ModeBadge mode={run.mode} />
                      <StatusPill status={run.status} />
                    </div>
                    <p className="mt-3 line-clamp-2 font-heading text-base leading-snug text-foreground group-hover:text-primary/90">
                      {run.query}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-xs text-foreground/45">
                      <span>{timeAgo(run.created_at)}</span>
                      <span className="inline-flex items-center gap-1">
                        {run.status === "running" ? <Spinner size={11} className="text-primary" /> : null}
                        {run.current_stage ? <Chip tone="default">{run.current_stage}</Chip> : null}
                        Continue <ChevronRight size={12} aria-hidden="true" />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline overview */}
        <section className="mt-10" aria-label="How NOVA works">
          <h2 className="mb-4 font-heading text-xl text-foreground">The research pipeline</h2>
          <div className="mb-3 text-sm text-foreground/60">
            {MODE_META.quick.desc} · {MODE_META.deep.desc} · {MODE_META.expert.desc}
          </div>
          {stageStrip}
        </section>
      </div>
    </div>
  );
}
