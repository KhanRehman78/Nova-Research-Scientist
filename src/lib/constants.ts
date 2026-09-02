import type { Mode, StageKey } from "./types";

export const APP_NAME = "NOVA";
export const APP_TAGLINE = "Autonomous Intelligence Research Engine";

export const STAGES: {
  key: StageKey;
  label: string;
  sub: string;
  route: (runId: string) => string;
}[] = [
  { key: "plan", label: "Plan", sub: "Research plan", route: (r) => `/plan/${r}` },
  { key: "search", label: "Search", sub: "Knowledge explorer", route: (r) => `/knowledge/${r}` },
  { key: "paper-reader", label: "Analyze", sub: "Literature room", route: (r) => `/literature/${r}` },
  { key: "gap", label: "Gap finding", sub: "Gap finder", route: (r) => `/gap/${r}` },
  { key: "hypothesis", label: "Hypothesis", sub: "Hypothesis studio", route: (r) => `/hypothesis/${r}` },
  { key: "experiment", label: "Experiment", sub: "Experiment designer", route: (r) => `/experiment/${r}` },
  { key: "report", label: "Report", sub: "Report generator", route: (r) => `/report/${r}` },
];

export const MODES: { key: Mode; label: string; desc: string; minutes: number }[] = [
  { key: "quick", label: "Quick", desc: "Top papers · key gaps · one hypothesis", minutes: 2 },
  { key: "deep", label: "Deep", desc: "Full literature matrix · richer analysis", minutes: 6 },
  { key: "expert", label: "Expert", desc: "Maximum coverage · full research proposal", minutes: 12 },
];

export const MODE_META: Record<Mode, { label: string; desc: string; minutes: number }> = {
  quick: { label: "Quick", desc: "Top papers · key gaps · one hypothesis", minutes: 2 },
  deep: { label: "Deep", desc: "Full literature matrix · richer analysis", minutes: 6 },
  expert: { label: "Expert", desc: "Maximum coverage · full research proposal", minutes: 12 },
};

export const SOURCES: Record<string, { label: string; color: string }> = {
  arxiv: { label: "arXiv", color: "#22d3ee" },
  semantic_scholar: { label: "Semantic Scholar", color: "#a78bfa" },
  pubmed: { label: "PubMed", color: "#34d399" },
  openalex: { label: "OpenAlex", color: "#fbbf24" },
  crossref: { label: "Crossref", color: "#f87171" },
};

export const STAGE_FN: Partial<Record<StageKey, string>> = {
  search: "search-agent",
  "paper-reader": "paper-reader",
  gap: "reasoning-gap",
  hypothesis: "scientist-hypothesis",
  report: "report-writer",
};

/** Maps a run's current_stage to its page route (for "continue where you left off"). */
export function routeForStage(stage: StageKey | null, runId: string): string {
  const found = STAGES.find((s) => s.key === stage);
  if (found) return found.route(runId);
  return `/plan/${runId}`;
}

export const ROLE_LABEL: Record<string, string> = {
  professor: "Professor",
  student: "Student",
  research_assistant: "Research Assistant",
  lab_admin: "Research Lab Admin",
};
