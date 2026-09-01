import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { ResearchRun, RunTask, TaskStatus } from "./types";

/** Live task status for a single pipeline stage of a run. */
export function useStageStatus(runId: string | undefined, stage: string) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [output, setOutput] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("run_tasks")
        .select("*")
        .eq("run_id", runId)
        .eq("stage", stage)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setStatus(data.status as TaskStatus);
        setOutput((data.output ?? null) as Record<string, unknown> | null);
        setError(data.error);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`run-task-${runId}-${stage}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "run_tasks",
          filter: `run_id=eq.${runId}`,
        },
        (payload) => {
          const row = payload.new as RunTask;
          if (row.stage !== stage) return;
          setStatus(row.status);
          setOutput((row.output ?? null) as Record<string, unknown> | null);
          setError(row.error);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [runId, stage]);

  return { status, output, error, loading };
}

/** Live run metadata (query, mode, status). */
export function useRunRow(runId: string | undefined) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("research_runs")
        .select("*")
        .eq("id", runId)
        .maybeSingle();
      if (!cancelled) setRun((data as ResearchRun) ?? null);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`run-row-${runId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "research_runs", filter: `id=eq.${runId}` },
        (payload) => setRun(payload.new as ResearchRun),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [runId]);

  return { run, loading };
}
