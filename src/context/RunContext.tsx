import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { STAGES, STAGE_FN } from "../lib/constants";
import type { StageKey, TaskStatus } from "../lib/types";

export type StageStatus = {
  key: StageKey;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  error?: string | null;
};

interface RunContextValue {
  runId: string | null;
  stages: StageStatus[];
  active: boolean;
  start: (runId: string) => Promise<void>;
  refresh: (runId: string) => Promise<void>;
  reset: () => void;
}

const RunContext = createContext<RunContextValue | null>(null);

const AUTO_NAV: Partial<Record<StageKey, (id: string) => string>> = {
  search: (id) => `/knowledge/${id}`,
  "paper-reader": (id) => `/literature/${id}`,
  gap: (id) => `/gap/${id}`,
  hypothesis: (id) => `/hypothesis/${id}`,
  experiment: (id) => `/experiment/${id}`,
  report: (id) => `/report/${id}`,
};

const PENDING: StageStatus[] = STAGES.map((s) => ({
  key: s.key,
  label: s.label,
  status: "pending",
}));

export function RunProvider({ children }: { children: ReactNode }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [stages, setStages] = useState<StageStatus[]>(PENDING);
  const [active, setActive] = useState(false);
  const runningRef = useRef(false);
  const navigate = useNavigate();

  const setStage = useCallback(
    (key: StageKey, status: StageStatus["status"], error?: string | null) => {
      setStages((prev) =>
        prev.map((s) => (s.key === key ? { ...s, status, error } : s)),
      );
    },
    [],
  );

  const applyDbStatuses = useCallback((rows: { stage: string; status: TaskStatus; error?: string | null }[]) => {
    setStages((prev) =>
      prev.map((s) => {
        const row = rows.find((r) => r.stage === s.key);
        if (!row) return s;
        if (row.status === "done") return { ...s, status: "done" };
        if (row.status === "failed") return { ...s, status: "failed", error: row.error };
        if (row.status === "running") return { ...s, status: "running" };
        return s;
      }),
    );
  }, []);

  const loadTasks = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("run_tasks")
      .select("stage, status, error")
      .eq("run_id", id);
    if (data) applyDbStatuses(data as { stage: string; status: TaskStatus; error?: string | null }[]);
  }, [applyDbStatuses]);

  const refresh = useCallback(
    async (id: string) => {
      setRunId(id);
      await loadTasks(id);
    },
    [loadTasks],
  );

  useEffect(() => {
    if (!runId) return;
    const channel = supabase
      .channel(`pipeline-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "run_tasks",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            stage?: string;
            status?: TaskStatus;
            error?: string | null;
          };
          if (!row.stage || !row.status) return;
          setStage(
            row.stage as StageKey,
            row.status === "done" ? "done" : row.status,
            row.error,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [runId, setStage]);

  const start = useCallback(
    async (id: string) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunId(id);
      setActive(true);
      setStages(PENDING.map((s) => (s.key === "plan" ? { ...s, status: "done" } : s)));

      await supabase
        .from("research_runs")
        .update({
          status: "running",
          current_stage: "search",
          finished_at: null,
        })
        .eq("id", id);

      // Pull existing DB progress so resuming a completed run doesn't re-run anything.
      const { data } = await supabase
        .from("run_tasks")
        .select("stage, status, error")
        .eq("run_id", id);
      const dbMap = new Map<string, { status: TaskStatus; error?: string | null }>();
      (data ?? []).forEach((r) => dbMap.set(r.stage, { status: r.status, error: r.error }));
      applyDbStatuses(data ?? []);

      for (const stage of STAGES) {
        if (stage.key === "plan") continue;
        const prior = dbMap.get(stage.key)?.status;
        if (prior === "done") {
          setStage(stage.key, "done");
          const nav = AUTO_NAV[stage.key];
          if (nav) navigate(nav(id));
          continue;
        }
        setStage(stage.key, "running");
        const fn = STAGE_FN[stage.key];
        if (fn) {
          try {
            const { data: res, error } = await supabase.functions.invoke(fn, {
              body: { run_id: id },
            });
            if (error) {
              const msg = (error as { message?: string })?.message;
              const detail = (res as { error?: string })?.error;
              throw new Error(detail || msg || `${stage.label} failed`);
            }
          } catch (e) {
            const message = (e as Error).message;
            setStage(stage.key, "failed", message);
            await supabase
              .from("research_runs")
              .update({ status: "failed", current_stage: stage.key })
              .eq("id", id);
            setActive(false);
            runningRef.current = false;
            return;
          }
        }
        setStage(stage.key, "done");
        const nav = AUTO_NAV[stage.key];
        if (nav) navigate(nav(id));
      }

      await supabase
        .from("research_runs")
        .update({
          status: "completed",
          current_stage: "report",
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);

      setActive(false);
      runningRef.current = false;
    },
    [applyDbStatuses, navigate, setStage],
  );

  const reset = useCallback(() => {
    if (runningRef.current) return;
    setRunId(null);
    setActive(false);
    setStages(PENDING);
  }, []);

  return (
    <RunContext.Provider value={{ runId, stages, active, start, refresh, reset }}>
      {children}
    </RunContext.Provider>
  );
}

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error("useRun must be used within RunProvider");
  return ctx;
}
