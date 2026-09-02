import type { Paper } from "./types";

export type CitationStyle = "apa7" | "ieee" | "vancouver" | "chicago" | "harvard" | "journal_specific";

function familyName(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ");
  return normalized.split(" ").at(-1) || normalized || "Unknown";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Unknown";
  return `${familyName(name)}, ${parts.slice(0, -1).map((part) => `${part[0]?.toUpperCase()}.`).join(" ")}`;
}

function joinAuthors(authors: string[], style: CitationStyle): string {
  const names = authors.filter(Boolean).slice(0, 20);
  if (!names.length) return "Unknown author";
  if (style === "ieee" || style === "vancouver") {
    const compact = names.slice(0, 6).map((name) => {
      const parts = name.trim().split(/\s+/);
      return `${parts.slice(0, -1).map((part) => part[0]?.toUpperCase()).join("")} ${familyName(name)}`.trim();
    });
    return `${compact.join(", ")}${names.length > 6 ? ", et al." : ""}`;
  }
  const formatted = names.slice(0, 20).map(initials);
  if (formatted.length === 1) return formatted[0];
  return `${formatted.slice(0, -1).join(", ")}, & ${formatted.at(-1)}`;
}

function doiUrl(doi: string | null): string {
  return doi ? `https://doi.org/${doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}` : "";
}

export function citationKey(paper: Paper): string {
  const author = familyName(paper.authors[0] || "source").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const title = paper.title.toLowerCase().match(/[a-z0-9]{4,}/)?.[0] || "work";
  return `${author}${paper.year || "nd"}${title}`.slice(0, 64);
}

export function paperToCsl(paper: Paper): Record<string, unknown> {
  return {
    id: citationKey(paper),
    type: "article-journal",
    title: paper.title,
    author: paper.authors.map((name) => ({ literal: name })),
    issued: paper.year ? { "date-parts": [[paper.year]] } : undefined,
    DOI: paper.doi || undefined,
    URL: paper.url || paper.full_text_url || undefined,
    source: paper.source,
  };
}

export function formatBibliographyEntry(paper: Paper, styleValue: string, index: number): string {
  const style = (styleValue === "journal_specific" ? "apa7" : styleValue) as CitationStyle;
  const authors = joinAuthors(paper.authors, style);
  const year = paper.year || "n.d.";
  const doi = doiUrl(paper.doi);
  const url = doi || paper.url || paper.full_text_url || "";
  if (style === "ieee") return `[${index + 1}] ${authors}, “${paper.title},” ${paper.year ? paper.year : "n.d."}.${url ? ` ${url}` : ""}`;
  if (style === "vancouver") return `${index + 1}. ${authors}. ${paper.title}. ${paper.year || "date unknown"}.${url ? ` Available from: ${url}` : ""}`;
  if (style === "chicago") return `${authors}. “${paper.title}.” ${year}.${url ? ` ${url}.` : ""}`;
  if (style === "harvard") return `${authors} (${year}) ‘${paper.title}’.${url ? ` Available at: ${url}` : ""}`;
  return `${authors} (${year}). ${paper.title}.${doi ? ` ${doi}` : url ? ` ${url}` : ""}`;
}

export function formatInTextCitation(paper: Paper, styleValue: string, index: number): string {
  if (styleValue === "ieee" || styleValue === "vancouver") return `[${index + 1}]`;
  const lead = familyName(paper.authors[0] || "Unknown");
  const author = paper.authors.length > 2 ? `${lead} et al.` : paper.authors.length === 2 ? `${lead} & ${familyName(paper.authors[1])}` : lead;
  return `(${author}, ${paper.year || "n.d."})`;
}

export function bibliography(papers: Paper[], style: string): string {
  return papers.map((paper, index) => formatBibliographyEntry(paper, style, index)).join("\n\n");
}
