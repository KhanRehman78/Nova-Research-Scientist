 NOVA — Autonomous Intelligence Research Engine — Product Requirements Document

\#\# Description

NOVA is a multi-agent, autonomous research platform — not a chatbot. A user enters a research question (e.g. "Find new cancer treatment approaches using AI") and NOVA automatically:

1\. Understands the query and produces a research plan
2\. Searches and aggregates academic papers from multiple open sources
3\. Reads/analyzes the papers (methods, datasets, results, limitations)
4\. Builds a visual knowledge map
5\. Identifies research gaps
6\. Generates novel, scored hypotheses
7\. Designs a proposed experiment / AI architecture
8\. Produces a full research proposal (PDF / Word / LaTeX export)

The full product has 8 major interfaces and a multi-agent backend. It also supports research collaboration with roles (professor, student, research assistant) and three research modes (Quick, Deep, Expert).

\#\# Goals

\- **\*\*Hackathon wow demo\*\***: from one query → analyzed papers → research gap → hypothesis → proposed AI architecture, in \~2 minutes for Quick mode.
\- Ship the **\*\*8 core interfaces\*\*** as a coherent single-page research workspace.
\- Run a **\*\*multi-agent pipeline\*\*** where each step has visible, streamed progress.
\- Support **\*\*three modes\*\***: Quick Analysis (2–3 min), Deep Research (10–30 min), Expert Mode (methodology-heavy output).
\- Provide **\*\*full collaboration\*\***: shared projects, role-based access, saved research runs.
\- Make the "Future Search Engine" tangible through a **\*\*visual knowledge map\*\*** instead of a list of links.
\- Export final output as **\*\*PDF, Word, and LaTeX\*\***.

\#\# User Stories

\- As a researcher, I want to enter a natural-language research question and get an automatic research plan, so that I can start without knowing the right search terms.
\- As a researcher, I want NOVA to search multiple paper sources at once and deduplicate results, so that I don't have to check arXiv, PubMed, and Semantic Scholar separately.
\- As a researcher, I want to see a literature matrix (paper / method / result / problem), so that I can compare papers quickly.
\- As a researcher, I want NOVA to detect research gaps, so that I can find a novel contribution.
\- As a researcher, I want a generated hypothesis with confidence and novelty scores, so that I can judge whether to pursue it.
\- As a researcher, I want an experiment design (dataset, architecture, evaluation metrics), so that I can start execution.
\- As a researcher, I want to export a full proposal to PDF/Word/LaTeX, so that I can submit or share it.
\- As a professor, I want to invite students/assistants to a project and see who contributed what, so that we can collaborate.
\- As a student, I want saved research runs and papers, so that I can resume later.

\#\# User Flows

\#\#\# Happy path — Quick Analysis

1\. User opens the **\*\*Research Dashboard\*\*** and picks **\*\*Quick Analysis\*\***.
2\. User types a research question and presses **\*\*Start Research\*\***.
3\. The **\*\*Research Planning Agent\*\*** shows an auto-generated plan: objective, research tasks, estimated time; user clicks **\*\*Approve Plan\*\***.
4\. The **\*\*Search Agent\*\*** queries arXiv, PubMed, Semantic Scholar, OpenAlex, and Crossref, then deduplicates and ranks results. Paper cards appear in the **\*\*Knowledge Explorer\*\***.
5\. The **\*\*Paper Reader Agent\*\*** extracts methods, datasets, results, and limitations. The **\*\*Literature Review Room\*\*** shows a live progress list and builds the literature matrix.
6\. The **\*\*Gap Finder\*\*** renders a gap map and states the detected research gap.
7\. The **\*\*Hypothesis Generator\*\*** emits a hypothesis with confidence/novelty scores.
8\. The **\*\*Report Generator\*\*** produces the proposal preview; user exports to PDF.

\#\#\# Deep Research / Expert paths

\- Same pipeline, but more papers, longer LLM synthesis, and the output includes literature review, gap, hypothesis, and experiment plan. Expert Mode additionally produces mathematical formulation and a novel framework/methodology.
\- Long steps are **\*\*asynchronous\*\***: the client subscribes to progress updates (Supabase Realtime) while Edge Functions process stages in chunks.

\#\#\# Error / alternate paths

\- **\*\*No papers found\*\***: widen query automatically, show "loosen filters" suggestion instead of an empty state.
\- **\*\*A source API is down\*\***: degrade gracefully — mark that source failed, continue with the others, show a per-source status.
\- **\*\*Rate limited (429)\*\***: retry with backoff; if persistent, return partial results and flag it in the report.
\- **\*\*LLM call fails\*\***: retry once; if still failing, show a clear error at the current stage and let the user resume from the last completed step.
\- **\*\*Unauthenticated user\*\***: collaboration features are hidden/blocked; dashboard is still browsable.

\#\# Design & UX

8 interfaces, presented as steps/pages in one workspace:

1\. **\*\*Research Dashboard (Home)\*\*** — hero input, research mode selector (Quick / Deep / Expert), example queries, recent projects.
2\. **\*\*Research Planning Agent\*\*** — auto-generated plan, task checklist, estimated time, Approve button.
3\. **\*\*Knowledge Explorer\*\*** — visual knowledge map (nodes for topics, methods, limitations), paper cards with year/impact/main finding/research gap.
4\. **\*\*Literature Review Room\*\*** — live "Analyzing papers…" progress, then a literature matrix table.
5\. **\*\*Research Gap Finder\*\*** — gap map (existing coverage vs. opportunity) and a written gap statement.
6\. **\*\*Hypothesis Generator\*\*** — generated title, hypothesis, objectives, expected contribution, confidence \+ novelty scores.
7\. **\*\*Experiment Designer\*\*** — proposed dataset, model architecture diagram (Input → Transformer Encoder → Fuzzy Layer → Prediction), evaluation metrics.
8\. **\*\*Research Report Generator\*\*** — structured proposal with all sections, export buttons (PDF / Word / LaTeX).

Design requirements: dark "research console" aesthetic, visible progress at every step, skeleton states, per-source status chips, and a persistent left rail for project navigation.

\#\# Integrations

\#\#\# Supabase (backend platform)
\- **\*\*Used for\*\***: Auth (email), Postgres storage, Row Level Security, Realtime progress updates, Edge Functions, and Secret Manager.
\- **\*\*Credential handling\*\***: \`SUPABASE\_URL\` and \`SUPABASE\_ANON\_KEY\` are **\*\*PUBLISHABLE\*\*** (safe in client source). \`SUPABASE\_SERVICE\_ROLE\_KEY\` (if used) is a **\*\*SECRET\*\*** — never in client code.
\- **\*\*Where code runs\*\***: client SDK for auth/data/Realtime; Edge Functions for all server-side logic.
\- **\*\*Transport\*\***: REST \+ WebSocket (Realtime).
\- **\*\*Status\*\***: currently \`not\_connected\`. Must be connected before any backend build begins.

\#\#\# OpenAI (primary LLM provider — recommended)
\- **\*\*Used for\*\***: query understanding, planning, paper analysis, gap detection, hypothesis generation, experiment design, report writing.
\- **\*\*Credential handling\*\***: \`OPENAI\_API\_KEY\` is a **\*\*SECRET\*\*** stored in Supabase Secret Manager and read **\*\*only inside Edge Functions\*\***. The key is **\*\*never sent to the browser\*\***. The client talks to our Edge Function, never to OpenAI directly.
\- **\*\*Where code runs\*\***: server-side only (Edge Functions).
\- **\*\*Transport\*\***: REST (\`POST /v1/chat/completions\`), streaming via SSE for long generations.
\- **\*\*Structured output\*\***: use JSON schema output for gap, hypothesis, and report objects so the UI can render deterministic shapes.
\- **\*\*SDK\*\***: \`openai\` npm package (latest stable) inside Edge Functions. Model IDs are set via Edge Function configuration, not hardcoded in the client.

\#\#\# arXiv
\- **\*\*Used for\*\***: preprint paper search.
\- **\*\*Credential handling\*\***: none required.
\- **\*\*Where code runs\*\***: server-side only (Edge Function) — avoids browser CORS issues and enforces rate limits centrally.
\- **\*\*Transport\*\***: REST GET \`https://export.arxiv.org/api/query\` (Atom XML response).
\- **\*\*Constraints\*\***: ≥3 seconds between requests; max 2000 results/page; max 300,000 total results per query.

\#\#\# Semantic Scholar
\- **\*\*Used for\*\***: relevance-ranked paper search, citation counts, open-access PDF links.
\- **\*\*Credential handling\*\***: optional \`x-api-key\` header for higher rate limits. If a key is provisioned, it is a **\*\*SECRET\*\*** (Supabase Secret Manager, Edge Functions only). Works without a key at lower limits.
\- **\*\*Where code runs\*\***: server-side only.
\- **\*\*Transport\*\***: REST GET \`https://api.semanticscholar.org/graph/v1/paper/search\` (JSON); bulk endpoint \`.../paper/search/bulk\` for larger pulls.
\- **\*\*Constraints\*\***: max 100 results/request; relevance search capped at 1,000 results/query; 10 MB response cap.

\#\#\# PubMed (NCBI E-utilities)
\- **\*\*Used for\*\***: biomedical/life-science literature and clinical research.
\- **\*\*Credential handling\*\***: no auth required; optional API key to raise rate limits. If a key is provisioned, it is a **\*\*SECRET\*\***.
\- **\*\*Where code runs\*\***: server-side only.
\- **\*\*Transport\*\***: REST GET \`esearch\`/\`efetch\` (XML, JSON available for some endpoints).

\#\#\# OpenAlex
\- **\*\*Used for\*\***: broad scholarly metadata and semantic search.
\- **\*\*Credential handling\*\***: optional \`api\_key\` query parameter for higher daily limits and semantic search. If a key is provisioned, it is a **\*\*SECRET\*\*** (edge function only, never appended in client-visible URLs).
\- **\*\*Where code runs\*\***: server-side only.
\- **\*\*Transport\*\***: REST GET \`https://api.openalex.org/works\` (JSON).

\#\#\# Crossref
\- **\*\*Used for\*\***: DOI lookups and additional metadata.
\- **\*\*Credential handling\*\***: no secret. Use polite pool: \`mailto\` query parameter or descriptive \`User-Agent\` header.
\- **\*\*Where code runs\*\***: server-side only.
\- **\*\*Transport\*\***: REST GET \`https://api.crossref.org/works\` (JSON).

\#\#\# Cross-cutting integration constraints (must be enforced by Builder)
\- All external paper APIs are called from Edge Functions, **\*\*never\*\*** from the browser.
\- All secrets live in Supabase Secret Manager and are read only inside Edge Functions. **\*\*No \`.env\` files.\*\***
\- The LLM key never reaches client code; the client only calls our own Edge Function endpoints.
\- Every source call must normalize results into one common \`Paper\` schema (id, title, authors, year, source, doi, abstract, url, citationCount, openAccessPdf).

\#\# Acceptance Criteria

\- \[ \] User can submit a natural-language query and choose Quick / Deep / Expert mode.
\- \[ \] Planning agent renders an editable plan and the pipeline starts only after approval.
\- \[ \] Search agent returns normalized, deduplicated papers from at least 3 of the 5 configured sources.
\- \[ \] If one source fails, the run continues and the UI shows a per-source failure status.
\- \[ \] Literature analyzer produces a literature matrix (paper, method, result, problem) for at least 20 papers in the demo path.
\- \[ \] Gap finder outputs a written gap statement and a visual gap map.
\- \[ \] Hypothesis generator outputs title, hypothesis, objectives, expected contribution, confidence, and novelty scores.
\- \[ \] Experiment designer outputs dataset recommendation, architecture diagram, and evaluation metrics.
\- \[ \] Report generator produces a complete proposal and can export to PDF, Word, and LaTeX.
\- \[ \] Progress updates stream to the client during the run.
\- \[ \] Long runs survive Edge Function time limits by processing stages as chunks and persisting state.
\- \[ \] Auth \+ role-based project sharing works (professor / student / research assistant).
\- \[ \] \`OPENAI\_API\_KEY\` is never present in client source or network requests from the browser.
\- \[ \] Quick demo completes in \~2 minutes with mock-free live API \+ LLM calls.

\#\# Out of Scope (for v1)

\- Full-text parsing of paywalled papers (v1 uses abstracts \+ open-access PDFs only).
\- Training or fine-tuning custom ML models — NOVA orchestrates existing LLMs and APIs.
\- Real clinical or regulatory validation of generated hypotheses.
\- Voice research assistant (phase 2).
\- Self-hosted vector database for RAG at web scale (v1 may use Postgres \+ embeddings; dedicated vector store is a later optimization).

\#\# Open Questions

\- Model selection is deployment-configured; the current cost-efficient default is \`gpt-5.6-luna\`, and no model choice changes the requirement for evidence checks and human review.
\- Whether to provision optional API keys for Semantic Scholar / OpenAlex / PubMed to raise rate limits, or ship keyless first.
\- Export approach: client-side generation (recommended for PDF/Word) vs. server-side PDF rendering.
\- Exact "Deep Research" max duration — must stay within Supabase Edge Function limits via chunked stages (no single long-running request).

\#\# Implementation Notes

\- **\*\*Frontend\*\***: Vite \+ React \+ TypeScript (already scaffolded). One route/screen per interface.
\- **\*\*Backend\*\***: Supabase Edge Functions per agent: \`research-manager\`, \`search-agent\`, \`paper-reader\`, \`reasoning-gap\`, \`scientist-hypothesis\`, \`report-writer\`. Client calls these, never third-party APIs directly.
\- **\*\*State model\*\***: \`projects\`, \`research\_runs\`, \`tasks\`, \`papers\`, \`literature\_matrix\`, \`gaps\`, \`hypotheses\`, \`experiments\`, \`reports\`, plus \`profiles\`, \`project\_members\` for collaboration.
\- **\*\*Progress\*\***: write stage status to Postgres; broadcast via Supabase Realtime.
\- **\*\*Resume\*\***: every stage persists its output so a failed run can resume from the last completed stage.

\#\# Professional University Ecosystem (Current Phase)

NOVA now includes a role-aware Professional Studio in the current product phase rather than deferring these workflows.

\#\#\# Student module

\- Research Topic Finder produces feasible topic portfolios with difficulty, required skills, preliminary novelty prioritization, dataset-verification status, and explicit evidence gaps.
\- Paper Simplifier accepts PDF, DOCX, Markdown, text, or pasted excerpts and separates reported content from interpretation.
\- Research Roadmap creates staged goals, deliverables, decision gates, risks, and evidence requirements.
\- Thesis Assistant produces a proposed title, problem statement, research questions, objectives, methodology outline, ethics checks, milestones, and unresolved evidence gaps.

\#\#\# Professor module

\- Advanced Discovery and Literature Intelligence operate only over a selected NOVA corpus and cite its evidence IDs.
\- Student Supervision stores assignments, milestones, progress evidence, risks, and human feedback; AI summaries cannot infer unreported progress.
\- Structured Peer Reviewer scores novelty, methodology, evidence, clarity, and reproducibility and returns a conservative pre-submission recommendation. It does not represent a journal decision.
\- Grant Proposal Studio generates grounded objectives, work packages, timeline, planning-budget lines, risks, and compliance checks. All financial figures remain estimates requiring institutional verification.
\- Collaborator Finder ranks exact authors present in the selected corpus. Identity, affiliation, availability, and contact details remain explicitly unverified until independently confirmed.

\#\#\# Research Lab / Admin module

\- Live project analytics cover membership, research runs, papers, reports, manuscripts, submission readiness, supervision progress, and open risks.
\- `lab_admin` is a protected role and cannot be self-assigned through public onboarding.

\#\#\# Publication-safety requirements

\- Outputs are labeled `verified`, `grounded`, or `requires_verification` and persist their input, source run, model, user, and timestamp.
\- Human-authored writing mode provides grammar, clarity, academic-tone, and author-voice guidance without insertable replacement prose.
\- AI-assisted mode preserves disclosure and immutable provenance. Neither mode claims detector evasion, human authorship certification, originality clearance, or publication acceptance.
\- Manuscript finalization remains server-controlled and requires current-content validation, resolution of blocking/human-review findings, and author sign-off.
