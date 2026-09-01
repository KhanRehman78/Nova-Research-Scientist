import { writeFile } from "node:fs/promises";
import { createServer } from "vite";

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error("Usage: node scripts/export-fixture.mjs <output-directory>");

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
try {
  const { buildDocxBlob, buildPdfBlob } = await server.ssrLoadModule("/src/lib/documentFiles.ts");
  const content = `# Transparent Clinical Prediction Evaluation

## Abstract

This fixture verifies NOVA's professional document export pipeline. It contains enough prose to exercise line wrapping, headings, paragraphs, page breaks, and the mandatory assistance disclosure.

## Introduction

Clinical prediction models require transparent reporting and reproducible evaluation. The manuscript workflow separates automated decision support from the author's final scientific and ethical responsibility.

## Methods

The proposed protocol documents data eligibility, missing-data handling, calibration, discrimination, subgroup analysis, and uncertainty intervals. No experimental result is claimed in this fixture.

## Discussion

Automated validation can identify structural and bibliographic risks, but it cannot replace peer review, institutional similarity checks, statistical review, or editorial judgment.

## References

Example record. https://doi.org/10.1038/s41591-020-1031-7
`;
  const now = new Date().toISOString();
  const manuscript = {
    id: crypto.randomUUID(), project_id: crypto.randomUUID(), owner_id: crypto.randomUUID(), research_run_id: null,
    title: "Transparent Clinical Prediction Evaluation", target_journal: "Example Journal", article_type: "research_article",
    citation_style: "vancouver", writing_mode: "ai_assisted", status: "draft", content, abstract: "Fixture abstract.",
    keywords: ["clinical prediction", "transparency"], journal_requirements: {},
    ai_disclosure: "NOVA assisted with a test draft. The authors must review and verify every claim, citation, and final sentence.",
    readiness: {}, validation_completed_at: null, last_validated_sha256: null, last_edit_source: "ai_generated",
    last_change_summary: "Export fixture", created_at: now, updated_at: now,
  };
  const [docxBlob, pdfBlob] = await Promise.all([buildDocxBlob(manuscript), buildPdfBlob(manuscript)]);
  await Promise.all([
    writeFile(`${outputDirectory}/nova-export-fixture.docx`, Buffer.from(await docxBlob.arrayBuffer())),
    writeFile(`${outputDirectory}/nova-export-fixture.pdf`, Buffer.from(await pdfBlob.arrayBuffer())),
  ]);
  console.log(JSON.stringify({ docx_bytes: docxBlob.size, pdf_bytes: pdfBlob.size }));
} finally {
  await server.close();
}
