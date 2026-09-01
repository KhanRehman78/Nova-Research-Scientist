import type { Manuscript } from "./types";

export const ACCEPTED_MANUSCRIPT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function manuscriptWordCount(content: string): number {
  return content.trim() ? content.trim().split(/\s+/).length : 0;
}

export async function extractDocumentText(file: File): Promise<{ text: string; status: "complete" | "partial" }> {
  if (file.size > 25 * 1024 * 1024) throw new Error("File must be 25 MB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (file.type === "text/plain" || file.type === "text/markdown" || extension === "txt" || extension === "md") {
    return { text: await file.text(), status: "complete" };
  }

  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { text: result.value.trim(), status: result.messages.length ? "partial" : "complete" };
  }

  if (file.type === "application/pdf" || extension === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push(
        textContent.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" "),
      );
    }
    const text = pages.join("\n\n").trim();
    return { text, status: text ? "complete" : "partial" };
  }

  throw new Error("Unsupported file type. Upload PDF, DOCX, TXT or Markdown.");
}

function safeBaseName(title: string): string {
  return title
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "nova-manuscript";
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markdownLines(content: string): { kind: "h1" | "h2" | "h3" | "bullet" | "paragraph"; text: string }[] {
  return content.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (line.startsWith("### ")) return { kind: "h3" as const, text: line.slice(4) };
    if (line.startsWith("## ")) return { kind: "h2" as const, text: line.slice(3) };
    if (line.startsWith("# ")) return { kind: "h1" as const, text: line.slice(2) };
    if (/^[-*]\s+/.test(line)) return { kind: "bullet" as const, text: line.replace(/^[-*]\s+/, "") };
    return { kind: "paragraph" as const, text: line };
  });
}

export async function buildDocxBlob(manuscript: Manuscript): Promise<Blob> {
  const docx = await import("docx");
  const {
    AlignmentType,
    Document,
    Footer,
    HeadingLevel,
    Packer,
    PageNumber,
    Paragraph,
    TextRun,
    convertInchesToTwip,
  } = docx;

  const children = markdownLines(manuscript.content).map((line) => {
    if (!line.text) return new Paragraph({ spacing: { after: 120 } });
    if (line.kind === "h1") return new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_1, spacing: { before: 320, after: 160 } });
    if (line.kind === "h2") return new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 140 } });
    if (line.kind === "h3") return new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_3, spacing: { before: 220, after: 120 } });
    if (line.kind === "bullet") return new Paragraph({ text: line.text, bullet: { level: 0 }, spacing: { after: 80 }, alignment: AlignmentType.JUSTIFIED });
    return new Paragraph({ children: [new TextRun(line.text)], spacing: { after: 160, line: 360 }, alignment: AlignmentType.JUSTIFIED });
  });

  if (manuscript.writing_mode === "ai_assisted" && manuscript.ai_disclosure) {
    children.push(
      new Paragraph({ text: "AI Assistance Disclosure", heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 } }),
      new Paragraph({ text: manuscript.ai_disclosure, spacing: { after: 160, line: 360 }, alignment: AlignmentType.JUSTIFIED }),
    );
  }

  const document = new Document({
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 }, paragraph: { spacing: { line: 360 } } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Times New Roman", size: 34, bold: true, color: "000000" },
          paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Times New Roman", size: 30, bold: true, color: "000000" },
          paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
        },
        {
          id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { font: "Times New Roman", size: 26, bold: true, color: "000000" },
          paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })] })],
        }),
      },
      children,
    }],
  });
  return Packer.toBlob(document);
}

export async function exportDocx(manuscript: Manuscript) {
  saveBlob(await buildDocxBlob(manuscript), `${safeBaseName(manuscript.title)}.docx`);
}

export async function buildPdfBlob(manuscript: Manuscript): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const margin = 72;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const bodyWidth = pageWidth - margin * 2;
  let y = margin;

  const addPageIfNeeded = (height: number) => {
    if (y + height <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  };
  const draw = (text: string, size = 12, bold = false, gap = 8) => {
    pdf.setFont("times", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text || " ", bodyWidth) as string[];
    const lineHeight = size * 1.45;
    for (const line of lines) {
      addPageIfNeeded(lineHeight);
      pdf.text(line, margin, y);
      y += lineHeight;
    }
    y += gap;
  };

  for (const line of markdownLines(manuscript.content)) {
    if (line.kind === "h1") draw(line.text, 18, true, 12);
    else if (line.kind === "h2") draw(line.text, 15, true, 10);
    else if (line.kind === "h3") draw(line.text, 13, true, 8);
    else if (line.kind === "bullet") draw(`• ${line.text}`, 12, false, 4);
    else if (line.text) draw(line.text, 12, false, 8);
    else y += 6;
  }
  if (manuscript.writing_mode === "ai_assisted" && manuscript.ai_disclosure) {
    draw("AI Assistance Disclosure", 15, true, 10);
    draw(manuscript.ai_disclosure, 12, false, 8);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("times", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(`${page} / ${pages}`, pageWidth / 2, pageHeight - 36, { align: "center" });
  }
  return pdf.output("blob");
}

export async function exportPdf(manuscript: Manuscript) {
  saveBlob(await buildPdfBlob(manuscript), `${safeBaseName(manuscript.title)}.pdf`);
}

function escapeLatex(value: string): string {
  const replacements: Record<string, string> = {
    "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&",
    "#": "\\#", "%": "\\%", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}",
  };
  return value.replace(/[\\{}$&#%_^~]/g, (character) => replacements[character]);
}

export function exportLatex(manuscript: Manuscript) {
  const body = markdownLines(manuscript.content).map((line) => {
    const text = escapeLatex(line.text);
    if (line.kind === "h1") return `\\section*{${text}}`;
    if (line.kind === "h2") return `\\section{${text}}`;
    if (line.kind === "h3") return `\\subsection{${text}}`;
    if (line.kind === "bullet") return `\\begin{itemize}\\item ${text}\\end{itemize}`;
    return text;
  }).join("\n\n");
  const disclosure = manuscript.writing_mode === "ai_assisted" && manuscript.ai_disclosure
    ? `\\section*{AI Assistance Disclosure}\n${escapeLatex(manuscript.ai_disclosure)}`
    : "";
  const latex = `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{newtxtext,newtxmath}
\\title{${escapeLatex(manuscript.title)}}
\\date{}
\\begin{document}
\\maketitle

${body}

${disclosure}
\\end{document}
`;
  saveBlob(new Blob([latex], { type: "application/x-tex;charset=utf-8" }), `${safeBaseName(manuscript.title)}.tex`);
}

export function exportMarkdown(manuscript: Manuscript) {
  const disclosure = manuscript.writing_mode === "ai_assisted" && manuscript.ai_disclosure
    ? `\n\n## AI Assistance Disclosure\n\n${manuscript.ai_disclosure}\n`
    : "";
  saveBlob(new Blob([`${manuscript.content.trim()}${disclosure}\n`], { type: "text/markdown;charset=utf-8" }), `${safeBaseName(manuscript.title)}.md`);
}
