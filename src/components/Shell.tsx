import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Network,
  Library,
  Target,
  FlaskConical,
  Beaker,
  FileText,
  Sparkles,
  Menu,
  X,
  LogOut,
  LogIn,
  CircleCheck,
  TriangleAlert,
  PenLine,
  GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useRun } from "../context/RunContext";
import { STAGES, APP_NAME, APP_TAGLINE, ROLE_LABEL } from "../lib/constants";
import { initials, truncate } from "../lib/format";
import { Spinner, ModeBadge, StatusPill } from "./ui";
import type { Mode, RunStatus } from "../lib/types";

const ICONS: Record<string, LucideIcon> = {
  plan: ClipboardList,
  search: Network,
  "paper-reader": Library,
  gap: Target,
  hypothesis: FlaskConical,
  experiment: Beaker,
  report: FileText,
};

const NAV = [
  { key: "dashboard", label: "Dashboard", sub: "Launch & overview", icon: LayoutDashboard, route: () => "/dashboard" },
  { key: "writing", label: "Writing Studio", sub: "Write, validate & submit", icon: PenLine, route: () => "/writing" },
  { key: "professional", label: "Professional Studio", sub: "Student · professor · lab", icon: GraduationCap, route: () => "/professional" },
  ...STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    sub: s.sub,
    icon: ICONS[s.key],
    route: (id: string) => s.route(id),
  })),
];

function keyFromPath(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "dashboard";
  return seg;
}

export function Shell() {
  const { user, profile, signOut } = useAuth();
  const { runId, stages, active } = useRun();
  const location = useLocation();
  const navigate = useNavigate();
  const activeKey = keyFromPath(location.pathname);
  const researchRoute = new Set(["plan", "knowledge", "literature", "gap", "hypothesis", "experiment", "report"]).has(activeKey);
  const routeRunId = researchRoute && location.pathname.split("/")[2]?.length ? location.pathname.split("/")[2] : null;
  const effectiveRunId = runId ?? routeRunId;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runMeta, setRunMeta] = useState<{ query: string; mode: Mode; status: RunStatus } | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Load run metadata for the mission-control rail.
  useEffect(() => {
    if (!effectiveRunId) { setRunMeta(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("research_runs")
        .select("query, mode, status")
        .eq("id", effectiveRunId)
        .maybeSingle();
      if (!cancelled && data) setRunMeta(data as { query: string; mode: Mode; status: RunStatus });
    })();
    return () => { cancelled = true; };
  }, [effectiveRunId]);

  // Escape closes the mobile drawer; focus moves into it.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Researcher";
  const displayEmail = user?.email ?? "";
  const displayRole = profile?.role ? ROLE_LABEL[profile.role] : null;

  const nav = useMemo(() => NAV, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const handleAuth = () => {
    if (user) void handleSignOut();
    else navigate("/auth");
  };

  const renderNav = (withLabels: boolean) => (
    <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {nav.map((item) => {
        const Icon = item.icon;
        const isActive = activeKey === item.key;
        const href = effectiveRunId ? item.route(effectiveRunId) : item.route("");
        return (
          <Link
            key={item.key}
            to={href}
            aria-current={isActive ? "page" : undefined}
            onClick={() => setDrawerOpen(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              isActive
                ? "bg-primary/15 font-medium text-primary"
                : "text-foreground/70 hover:bg-border/30 hover:text-foreground"
            }`}
          >
            <Icon size={18} className={isActive ? "text-primary" : ""} aria-hidden="true" />
            {withLabels ? (
              <span className="flex flex-col leading-tight">
                <span>{item.label}</span>
                {isActive ? <span className="text-[10px] font-normal text-primary/70">{item.sub}</span> : null}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const userCard = (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-xl bg-panel p-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-sm font-semibold text-secondary">
          {initials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
          <div className="truncate text-xs text-foreground/50">{displayRole ?? (displayEmail || "Browse mode")}</div>
        </div>
        <button
          onClick={handleAuth}
          aria-label={user ? "Sign out" : "Sign in"}
          className="cursor-pointer rounded-lg p-2 text-foreground/50 hover:bg-border/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {user ? <LogOut size={16} aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-[0_0_24px_-4px_var(--color-primary)]">
        <Sparkles size={18} aria-hidden="true" />
      </div>
      <div>
        <div className="font-heading text-lg font-semibold leading-none text-foreground">{APP_NAME}</div>
        <div className="text-[9px] uppercase tracking-[0.22em] text-primary">{APP_TAGLINE}</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop left rail */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-panel/40 print:hidden lg:flex">
        {brand}
        {renderNav(true)}
        {userCard}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex lg:hidden"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex w-72 flex-col border-r border-border bg-background">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="cursor-pointer rounded-lg p-2 text-foreground/70 hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {renderNav(true)}
            {userCard}
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-panel/40 px-4 py-3 print:hidden lg:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="cursor-pointer rounded-lg p-2 text-foreground/80 hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <span className="font-heading text-base font-semibold text-foreground">{APP_NAME}</span>
          </div>
          <span className="text-xs text-foreground/50">{truncate(runMeta?.query, 28) || "Mission control"}</span>
        </header>

        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <Outlet />
        </main>
      </div>

      {/* Right rail — mission control */}
      <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-panel/40 print:hidden xl:flex">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-widest text-foreground/60">
            Mission control
          </h2>
          {active ? <span className="scanline h-1.5 w-16 rounded-full" aria-hidden="true" /> : null}
        </div>
        {runId ? (
          <div className="flex-1 overflow-y-auto px-5 pb-5">
            <div className="glass-soft rounded-2xl p-4">
              <div className="mb-1 flex items-center gap-2">
                <ModeBadge mode={runMeta?.mode ?? "quick"} />
                <StatusPill status={runMeta?.status ?? "pending"} />
              </div>
              <p className="mt-2 font-heading text-sm leading-snug text-foreground">
                {runMeta?.query ?? "Loading run…"}
              </p>
              <p className="mt-1 text-[11px] text-foreground/45">{runId.slice(0, 8)}…</p>
            </div>

            <ol className="mt-4 space-y-1" aria-label="Pipeline stages">
              {stages.map((s, i) => {
                const Icon = ICONS[s.key];
                return (
                  <li key={s.key} className="flex items-center gap-3 rounded-xl px-3 py-2">
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-foreground/60">
                      {s.status === "done" ? (
                        <CircleCheck size={15} className="text-success" aria-hidden="true" />
                      ) : s.status === "failed" ? (
                        <TriangleAlert size={15} className="text-destructive" aria-hidden="true" />
                      ) : s.status === "running" ? (
                        <Spinner size={14} className="text-primary" />
                      ) : (
                        <Icon size={14} aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm ${
                          s.status === "running"
                            ? "font-medium text-primary"
                            : s.status === "done"
                              ? "text-foreground"
                              : s.status === "failed"
                                ? "text-destructive"
                                : "text-foreground/55"
                        }`}
                      >
                        {s.label}
                      </div>
                      {s.status === "running" ? (
                        <div className="text-[11px] text-foreground/45">working…</div>
                      ) : s.status === "failed" ? (
                        <div className="truncate text-[11px] text-destructive/80" title={s.error ?? ""}>
                          {s.error ?? "failed"}
                        </div>
                      ) : null}
                    </div>
                    <span className="font-mono text-[10px] text-foreground/30">0{i + 1}</span>
                  </li>
                );
              })}
            </ol>

            {active ? (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                <span className="animate-pulse-soft inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Pipeline running — sit tight
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 px-5 pb-5">
            <div className="glass-soft rounded-2xl p-4 text-sm text-foreground/60">
              <p className="font-heading text-base text-foreground">No run active</p>
              <p className="mt-1 text-xs">
                Launch a research question from the dashboard and its live pipeline will appear here.
              </p>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-foreground/40">
              Pick a question on the dashboard and NOVA takes it from plan to proposal.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
