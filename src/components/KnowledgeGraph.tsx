import { useMemo } from "react";
import type { Paper } from "../lib/types";
import { SOURCES } from "../lib/constants";
import { fmtNum } from "../lib/format";

const W = 900;
const H = 620;
const CX = W / 2;
const CY = H / 2;

function colorOf(source: string): string {
  return SOURCES[source]?.color ?? "#e7ecf7";
}

type Node = { x: number; y: number; r: number; paper: Paper };

export function KnowledgeGraph({ papers, query }: { papers: Paper[]; query: string }) {
  const layout = useMemo(() => {
    const groups = new Map<string, Paper[]>();
    papers.forEach((p) => {
      const arr = groups.get(p.source) ?? [];
      arr.push(p);
      groups.set(p.source, arr);
    });
    const keys = [...groups.keys()];
    const nodes: Node[] = [];
    const clusters: { x: number; y: number; label: string; color: string }[] = [];

    keys.forEach((source, gi) => {
      const meta = SOURCES[source] ?? { label: source, color: "#e7ecf7" };
      const angle = -Math.PI / 2 + (gi / Math.max(keys.length, 1)) * Math.PI * 2;
      const cr = 205;
      const cx = CX + Math.cos(angle) * cr;
      const cy = CY + Math.sin(angle) * cr;
      const list = groups.get(source)!;
      clusters.push({ x: cx, y: cy, label: meta.label, color: meta.color });
      list.forEach((p, i) => {
        const r = Math.max(6, Math.min(17, 6 + Math.sqrt(p.citation_count || 0) * 1.25));
        const ring = 48 + Math.min(i, 8) * 7;
        const a = (i / Math.max(list.length, 1)) * Math.PI * 2;
        nodes.push({ x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring * 0.7, r, paper: p });
      });
    });

    return { nodes, clusters };
  }, [papers]);

  const label = query.length > 20 ? `${query.slice(0, 20)}…` : query;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label={`Knowledge map for “${query}”: ${papers.length} papers clustered by source`}
    >
      <defs>
        <radialGradient id="nova-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* glow behind center */}
      <circle cx={CX} cy={CY} r={130} fill="url(#nova-core)" />

      {/* edges from core to every paper */}
      {layout.nodes.map((n) => (
        <line
          key={`edge-${n.paper.id}`}
          x1={CX}
          y1={CY}
          x2={n.x}
          y2={n.y}
          stroke={colorOf(n.paper.source)}
          strokeOpacity={0.12}
          strokeWidth={0.7}
        />
      ))}

      {/* center core */}
      <circle cx={CX} cy={CY} r={34} fill="var(--color-primary)" opacity={0.14} className="animate-pulse-soft" />
      <circle cx={CX} cy={CY} r={26} fill="var(--color-primary)" />
      <text
        x={CX}
        y={CY}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-on-primary)"
        fontWeight={700}
        fontSize={12.5}
      >
        {label}
      </text>

      {/* cluster labels */}
      {layout.clusters.map((c) => (
        <text
          key={`cluster-${c.label}`}
          x={c.x}
          y={c.y}
          textAnchor="middle"
          fill={c.color}
          fontSize={11}
          fontWeight={600}
          opacity={0.85}
        >
          {c.label}
        </text>
      ))}

      {/* paper nodes */}
      {layout.nodes.map((n) => (
        <g key={n.paper.id} className="cursor-pointer transition-opacity duration-150 hover:opacity-100" opacity={0.92}>
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={colorOf(n.paper.source)}
            fillOpacity={0.85}
            stroke="var(--color-background)"
            strokeWidth={1.5}
          >
            <title>{`${n.paper.title} (${n.paper.year ?? "n/a"}) · ${fmtNum(n.paper.citation_count)} citations`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
