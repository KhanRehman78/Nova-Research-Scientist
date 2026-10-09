import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  FileText,
  Copy,
  Download,
  Printer,
  Check,
  Clock,
  Sparkles,
  FileType2,
  Braces,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useRunRow, useStageStatus } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import type { Report } from "../lib/types";
import {
  Button,
  Chip,
  EmptyState,
  ErrorBanner,
  PageHeader,
  Spinner,
} from "../components/ui";

export function ReportGenerator() {
  const { runId } = useParams<{ runId: string }>();
  const { run } = useRunRow(runId);
  const { status, error } = useStageStatus(runId, "report");
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("reports")
        .select("*")
        .eq("run_id", runId)
        .limit(1)
        .maybeSingle();
      if (!cancelled) setReport((data as Report | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [runId, status]);

  const sections = report?.sections_json?.sections ?? [];
  const evidenceSummary = report?.sections_json?.evidence_summary;
  const generating = status === "pending" || status === "running" || (status == null && !report);

  const markdown = useMemo(() => {
    if (!report) return "";
    const lines: string[] = [`# ${report.title}`, "", report.abstract ?? "", ""];
    sections.forEach((s) => {
      lines.push(`## ${s.heading}`, "", s.body, "");
      if (s.evidence_ids?.length) lines.push(`_Evidence: ${s.evidence_ids.join(", ")}_`, "");
    });
    if (evidenceSummary) {
      lines.push(
        "## Evidence audit",
        "",
        `Sources used: ${(evidenceSummary.source_ids ?? []).join(", ") || "None recorded"}`,
        "",
        evidenceSummary.synthesis_note ?? "",
        "",
        ...(evidenceSummary.limitations ?? []).map((item) => `- ${item}`),
        "",
      );
    }
    return lines.join("\n").trim() + "\n";
  }, [evidenceSummary, report, sections]);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const downloadMarkdown = () => {
    downloadBlob(markdown, "text/markdown;charset=utf-8", "md", report?.title);
  };

  const downloadWord = () => {
    if (!report) return;
    const body = sections
      .map((section) => `<h2>${escapeHtml(section.heading)}</h2>${section.body
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
        .join("")}${section.evidence_ids?.length ? `<p class="evidence"><strong>Evidence:</strong> ${escapeHtml(section.evidence_ids.join(", "))}</p>` : ""}`)
      .join("");
    const audit = evidenceSummary ? `<h2>Evidence audit</h2><p><strong>Sources used:</strong> ${escapeHtml((evidenceSummary.source_ids ?? []).join(", ") || "None recorded")}</p><p>${escapeHtml(evidenceSummary.synthesis_note ?? "")}</p><ul>${(evidenceSummary.limitations ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;line-height:1.55;max-width:760px;margin:48px auto;color:#111}h1,h2{color:#14213d}h1{font-size:28pt}h2{font-size:18pt;margin-top:28px}.abstract{border-left:4px solid #22a6b3;padding-left:18px;color:#333}.evidence{font-size:9pt;color:#555}</style></head><body><h1>${escapeHtml(report.title)}</h1><div class="abstract"><strong>Abstract</strong><p>${escapeHtml(report.abstract ?? "")}</p></div>${body}${audit}<hr><small>Evidence-grounded AI-assisted draft — authors must verify all claims and citations before publication.</small></body></html>`;
    downloadBlob(html, "application/msword;charset=utf-8", "doc", report.title);
  };

  const downloadLatex = () => {
    if (!report) return;
    const content = [
      "\\documentclass[11pt]{article}",
      "\\usepackage[margin=1in]{geometry}",
      "\\usepackage[T1]{fontenc}",
      "\\usepackage{lmodern}",
      `\\title{${escapeLatex(report.title)}}`,
      "\\author{NOVA Autonomous Intelligence Research Engine}",
      "\\date{\\today}",
      "\\begin{document}",
      "\\maketitle",
      "\\begin{abstract}",
      escapeLatex(report.abstract ?? ""),
      "\\end{abstract}",
      ...sections.flatMap((section) => [
        `\\section{${escapeLatex(section.heading)}}`,
        escapeLatex(section.body).replace(/\n{2,}/g, "\n\n"),
        ...(section.evidence_ids?.length ? [`\\textit{Evidence: ${escapeLatex(section.evidence_ids.join(", "))}}`] : []),
      ]),
      ...(evidenceSummary ? [
        "\\section{Evidence audit}",
        `\\textbf{Sources used:} ${escapeLatex((evidenceSummary.source_ids ?? []).join(", ") || "None recorded")}`,
        escapeLatex(evidenceSummary.synthesis_note ?? ""),
        "\\begin{itemize}",
        ...(evidenceSummary.limitations ?? []).map((item) => `\\item ${escapeLatex(item)}`),
        "\\end{itemize}",
      ] : []),
      "\\end{document}",
      "",
    ].join("\n");
    downloadBlob(content, "application/x-tex;charset=utf-8", "tex", report.title);
  };

  const exportPdf = () => window.print();

  return (
    <div className="nova-print mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-10">
      <PageHeader
        eyebrow="Interface 8 · Research Report Generator"
        title="Research proposal"
        subtitle="All pipeline outputs — search, matrix, gap, hypothesis, experiment — assembled into a coherent, citable proposal."
        right={
          report ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copyMarkdown}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy Markdown"}
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadMarkdown}>
                <Download size={14} aria-hidden="true" /> .md
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadWord}>
                <FileType2 size={14} aria-hidden="true" /> Word
              </Button>
              <Button variant="secondary" size="sm" onClick={downloadLatex}>
                <Braces size={14} aria-hidden="true" /> LaTeX
              </Button>
              <Button size="sm" onClick={exportPdf}>
                <Printer size={14} aria-hidden="true" /> Export PDF
              </Button>
            </div>
          ) : null
        }
      />

      {error ? <ErrorBanner className="mb-5">Report generation failed: {error}</ErrorBanner> : null}

      {generating ? (
        <div className="glass-panel rounded-3xl p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} className="text-primary" />
            <div>
              <div className="font-heading text-lg text-foreground">Writing the proposal…</div>
              <div className="text-sm text-foreground/55">
                The writer agent is structuring the gap, hypothesis and experiment into full prose sections.
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-full animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-11/12 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-4/5 animate-pulse rounded-full bg-border/50" />
            <div className="h-2 w-3/5 animate-pulse rounded-full bg-border/50" />
          </div>
        </div>
      ) : !report ? (
        <EmptyState
          icon={FileText}
          title="No report yet"
          body="This is the final stage — it synthesizes everything into the proposal. Run the pipeline from Planning to generate it."
        />
      ) : (
        <article className="glass-panel overflow-hidden rounded-3xl">
          {/* Title block */}
          <header className="border-b border-border p-6 sm:p-10">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip tone="primary">
                <Clock size={11} aria-hidden="true" /> {fmtDate(run?.created_at)}
              </Chip>
              <Chip tone="violet">mode · {run?.mode ?? "quick"}</Chip>
              <Chip tone="success">
                <Sparkles size={11} aria-hidden="true" /> Evidence-grounded draft
              </Chip>
            </div>
            <h1 className="font-heading text-3xl leading-tight text-foreground">{report.title}</h1>
            {report.abstract ? (
              <div className="mt-5">
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Abstract</div>
                <p className="text-sm leading-relaxed text-foreground/75">{report.abstract}</p>
              </div>
            ) : null}
            {evidenceSummary ? (
              <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs font-semibold uppercase tracking-widest text-primary">Evidence audit</div>
                <div className="mt-2 text-sm text-foreground/70">
                  {(evidenceSummary.source_ids ?? []).length} traceable source{(evidenceSummary.source_ids ?? []).length === 1 ? "" : "s"}
                  {(evidenceSummary.source_ids ?? []).length ? ` · ${(evidenceSummary.source_ids ?? []).join(", ")}` : ""}
                </div>
                {evidenceSummary.synthesis_note ? (
                  <p className="mt-2 text-sm leading-relaxed text-foreground/65">{evidenceSummary.synthesis_note}</p>
                ) : null}
                {(evidenceSummary.limitations ?? []).length ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-foreground/55">
                    {(evidenceSummary.limitations ?? []).map((item, index) => <li key={index}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </header>

          {/* Sections */}
          <div className="space-y-8 p-6 sm:p-10">
            {sections.map((s, i) => (
              <section key={i} aria-label={s.heading}>
                <h2 className="mb-3 font-heading text-xl text-foreground">
                  <span className="mr-2 font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</span>
                  {s.heading}
                </h2>
                <div className="space-y-3 text-sm leading-relaxed text-foreground/75">
                  {s.body.split(/\n{2,}/).map((para, j) => (
                    <p key={j}>{para}</p>
                  ))}
                </div>
                {s.evidence_ids?.length ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={`Evidence for ${s.heading}`}>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground/40">Evidence</span>
                    {s.evidence_ids.map((sourceId) => <Chip key={sourceId} tone="primary">{sourceId}</Chip>)}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <footer className="border-t border-border px-6 py-4 text-center text-xs text-foreground/40 sm:px-10">
            Evidence-grounded AI-assisted draft — authors must verify all claims, citations and source scope before publication.
          </footer>
        </article>
      )}
    </div>
  );
}

function fileBase(title = "nova-report") {
  return title
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "nova-report";
}

function downloadBlob(content: string, mime: string, extension: string, title?: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${fileBase(title)}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function escapeLatex(value: string) {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    "$": "\\$",
    "&": "\\&",
    "#": "\\#",
    "%": "\\%",
    "_": "\\_",
    "^": "\\textasciicircum{}",
    "~": "\\textasciitilde{}",
  };
  return value.replace(/[\\{}$&#%_^~]/g, (character) => replacements[character]);
}
