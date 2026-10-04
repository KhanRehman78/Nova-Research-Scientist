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
import { STAGES } from "../lib/constants";
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
          if (row.status === "done") {
            const destination = AUTO_NAV[row.stage as StageKey];
            if (destination) navigate(destination(runId));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate, runId, setStage]);

  const start = useCallback(
    async (id: string) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setRunId(id);
      setActive(true);
      setStages(PENDING.map((s) => (s.key === "plan" ? { ...s, status: "done" } : s)));
      try {
        await loadTasks(id);
        const { data, error } = await supabase.functions.invoke("research-manager", {
          body: { action: "run", run_id: id },
        });
        if (error || data?.status !== "completed") {
          throw new Error(data?.error || error?.message || "Research pipeline failed");
        }
        await loadTasks(id);
        navigate(`/report/${id}`);
      } catch (error) {
        await loadTasks(id);
        const message = (error as Error).message || "Research pipeline failed";
        setStages((current) => current.map((stage) =>
          stage.status === "running" ? { ...stage, status: "failed", error: message } : stage,
        ));
      } finally {
        setActive(false);
        runningRef.current = false;
      }
    },
    [loadTasks, navigate],
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
