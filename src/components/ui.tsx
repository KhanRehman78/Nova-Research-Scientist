import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Loader2 } from "lucide-react";
import { SOURCES, MODE_META } from "../lib/constants";
import type { Mode } from "../lib/types";

/* ---------- Spinner ---------- */
export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <Loader2
      className={`animate-spin ${className}`}
      size={size}
      aria-hidden="true"
    />
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-border/50 ${className}`} aria-hidden="true" />;
}

/* ---------- Chip ---------- */
type Tone = "default" | "primary" | "success" | "warning" | "danger" | "violet";
const TONES: Record<Tone, string> = {
  default: "bg-border/40 text-foreground/80 border-border",
  primary: "bg-primary/10 text-primary border-primary/30",
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  violet: "bg-secondary/10 text-secondary border-secondary/30",
};

export function Chip({
  tone = "default",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: Mode }) {
  const meta = MODE_META[mode];
  return <Chip tone={mode === "quick" ? "primary" : mode === "deep" ? "violet" : "warning"}>{meta?.label ?? mode}</Chip>;
}

export function SourceBadge({ source, count }: { source: string; count?: number }) {
  const meta = SOURCES[source] ?? { label: source, color: "#e7ecf7" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-0.5 text-xs"
      style={{ color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
      {meta.label}
      {count != null && <span className="text-foreground/60">· {count}</span>}
    </span>
  );
}

/* ---------- Status pill (run/task) ---------- */
export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    pending: { tone: "default", label: "Queued" },
    planning: { tone: "primary", label: "Planning" },
    running: { tone: "primary", label: "Running" },
    in_progress: { tone: "primary", label: "Running" },
    done: { tone: "success", label: "Done" },
    completed: { tone: "success", label: "Completed" },
    failed: { tone: "danger", label: "Failed" },
    cancelled: { tone: "default", label: "Cancelled" },
  };
  const m = map[status] ?? { tone: "default" as Tone, label: status };
  return (
    <Chip tone={m.tone}>
      {status === "running" || status === "in_progress" ? (
        <Spinner size={11} className="text-primary" />
      ) : null}
      {m.label}
    </Chip>
  );
}

/* ---------- Error banner ---------- */
export function ErrorBanner({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive ${className}`}
    >
      <CircleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-panel/40 px-6 py-12 text-center ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon size={22} aria-hidden="true" />
      </div>
      <h3 className="font-heading text-lg text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-foreground/60">{body}</p>
      {action}
    </div>
  );
}

/* ---------- Stat card ---------- */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "text-primary",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="glass-soft flex items-center gap-4 rounded-2xl p-4">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ${accent}`}>
        <Icon size={20} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-foreground/50">{label}</div>
        <div className="truncate font-heading text-2xl leading-tight text-foreground">{value}</div>
        {sub ? <div className="truncate text-xs text-foreground/50">{sub}</div> : null}
      </div>
    </div>
  );
}

/* ---------- Score bar (0..1) ---------- */
export function ScoreBar({
  label,
  value,
  color = "var(--color-primary)",
  right,
}: {
  label: string;
  value: number;
  color?: string;
  right?: ReactNode;
}) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-foreground/70">{label}</span>
        <span className="font-mono text-foreground/80">{right ?? `${Math.round(v * 100)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/50" role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${v * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-widest text-primary">{eyebrow}</div> : null}
        <h1 className="font-heading text-3xl leading-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-foreground/60">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

/* ---------- Button ---------- */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[transform,background-color,box-shadow] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
  const variants = {
    primary:
      "bg-primary text-on-primary hover:bg-primary/90 shadow-[0_0_24px_-6px_var(--color-primary)]",
    secondary: "bg-border/30 text-foreground hover:bg-border/50 border border-border",
    ghost: "text-foreground/80 hover:bg-border/30 hover:text-foreground",
    danger: "bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/30",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
