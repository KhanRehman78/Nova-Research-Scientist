 NOVA — High-Level Architecture

\#\# 1\. System Overview

NOVA is a \*\*server-orchestrated research pipeline\*\* with a React client. The browser never talks to academic APIs or the LLM directly. It talks only to Supabase (auth/data/Realtime) and to NOVA's own Edge Functions.

\`\`\`
┌───────────────────────────── Browser (Vite \+ React \+ TS) ─────────────────────────────┐
│  Dashboard │ Planning │ Knowledge Explorer │ Literature Room │ Gap │ Hypothesis │    │
│  Experiment │ Report   (8 interfaces, one SPA)                                        │
└───────┬──────────────────────────────┬────────────────────────────────────────────────┘
        │ Supabase JS (anon key)       │ Edge Function calls (JWT)
        ▼                              ▼
┌─────────────────── Supabase Backend ───────────────────────────────────────────────┐
│  Auth (profiles, roles)                                                             │
│  Postgres (projects, runs, tasks, papers, matrix, gaps, hypotheses, reports)       │
│  Realtime (progress broadcast)                                                      │
│  Edge Functions: research-manager → search-agent → paper-reader → gap → hypothesis │
│                  → experiment → report-writer                                       │
│  Secret Manager: OPENAI\_API\_KEY, optional source API keys                            │
└──────┬──────────────────────────────────────────────────────────────────────────────┘
       │ server-side only
       ▼
┌──────────────────────────── External APIs ───────────────────────────────────────────┐
│  OpenAI (LLM)   arXiv   Semantic Scholar   PubMed   OpenAlex   Crossref               │
└───────────────────────────────────────────────────────────────────────────────────────┘
\`\`\`

\#\# 2\. Frontend (Vite \+ React \+ TypeScript)

\- \*\*Routes/screens\*\* map 1:1 to the 8 interfaces.
\- \*\*State\*\*: Supabase queries \+ Realtime subscriptions; local UI state for form inputs and mode selection.
\- \*\*No third-party API keys\*\* in the client. The client calls NOVA Edge Functions via \`supabase.functions.invoke(...)\`.

Screens:

1\. \`Dashboard\` — mode select, query input, recent projects.
2\. \`Plan\` — shows plan JSON, approve/cancel.
3\. \`KnowledgeMap\` — force/network graph of topics/papers.
4\. \`LiteratureRoom\` — live task list \+ matrix table.
5\. \`GapFinder\` — gap map \+ gap statement.
6\. \`Hypothesis\` — scored hypothesis card.
7\. \`Experiment\` — architecture diagram \+ metrics.
8\. \`Report\` — full proposal \+ export buttons.

\#\# 3\. Backend Agents (Edge Functions)

One Edge Function per agent, orchestrated by \`research-manager\`. Each function:

\- reads secrets from Supabase Secret Manager only,
\- writes its output to Postgres,
\- broadcasts stage status via Realtime,
\- is idempotent/resumable (each stage can be re-run from saved input).

| Agent | Responsibility | External calls |
|---|---|---|
| \`research-manager\` | Parse query → build plan → invoke agents in order → track run state | OpenAI |
| \`search-agent\` | Query all sources, normalize \+ dedupe papers, save to DB | arXiv, Semantic Scholar, PubMed, OpenAlex, Crossref |
| \`paper-reader\` | Extract methods/datasets/results/limitations → literature matrix | OpenAI (abstracts) |
| \`reasoning-gap\` | Detect patterns and missing areas → gap statement \+ gap map data | OpenAI |
| \`scientist-hypothesis\` | Generate scored hypothesis \+ experiment design | OpenAI |
| \`report-writer\` | Assemble all outputs into proposal sections | OpenAI (synthesis) |

\*\*Pipeline order\*\*: manager → search → paper-reader → gap → hypothesis → experiment → report.

\#\# 4\. Research Modes

| Mode | Papers | Output | Implementation |
|---|---|---|---|
| Quick | \~20 | summary, trends, key papers, gap, hypothesis | single sequential run, low-token LLM calls |
| Deep | 50–100+ | full literature review, gap, hypothesis, experiment plan | chunked stages, persisted progress, Realtime |
| Expert | as Deep | \+ mathematical formulation, novel framework | extra \`expert-synthesis\` step, longer LLM prompts |

\#\# 5\. Data Model (Postgres)

\- \`profiles\` — id (FK auth.users), full\_name, role (\`professor\` | \`student\` | \`research\_assistant\`).
\- \`projects\` — id, name, description, owner\_id, created\_at.
\- \`project\_members\` — project\_id, profile\_id, role, invited\_at.
\- \`research\_runs\` — id, project\_id, user\_id, query, mode, status, current\_stage, started\_at, finished\_at.
\- \`run\_tasks\` — id, run\_id, stage, status (\`pending\` | \`running\` | \`done\` | \`failed\`), input, output, error, updated\_at.
\- \`papers\` — id, run\_id, source, source\_id, title, authors, year, doi, abstract, url, citation\_count, open\_access\_pdf.
\- \`literature\_matrix\` — id, run\_id, paper\_id, method, dataset, result, problem, extracted\_at.
\- \`gaps\` — id, run\_id, title, statement, existing\_coverage, opportunity, gap\_map\_json.
\- \`hypotheses\` — id, run\_id, title, hypothesis, objectives, expected\_contribution, confidence, novelty, created\_at.
\- \`experiments\` — id, run\_id, dataset, architecture\_json, algorithm, metrics\_json.
\- \`reports\` — id, run\_id, title, abstract, sections\_json, created\_at.
\- \`similarity\_reports\` — one server-generated, content-hash-bound report per manuscript with overall/section scores, corpus scope, methodology, disclaimer, and review state.
\- \`similarity\_matches\` — exact manuscript excerpt, matched source identity/reference, normalized shared phrase, match strength/classification, and human-review flag.

\*\*RLS\*\*: users read/write only projects they own or are members of. Runs/papers/matrix/gaps/hypotheses/reports inherit access through their project.

\#\# 6\. Security & Secrets

\- \`SUPABASE\_URL\`, \`SUPABASE\_ANON\_KEY\` — \*\*publishable\*\*, in client.
\- \`OPENAI\_API\_KEY\` — \*\*secret\*\*, Supabase Secret Manager, read only in Edge Functions.
\- Optional \`S2\_API\_KEY\`, \`OPENALEX\_API\_KEY\`, \`PUBMED\_API\_KEY\` — \*\*secrets\*\*, same rule, only if rate-limit keys are provisioned.
\- \*\*Never\*\* any \`.env\` file, \*\*never\*\* a third-party key in \`src/\`.

\#\# 7\. Resilience & Timeouts

\- Every external fetch uses timeout \+ retry with exponential backoff.
\- Edge Functions process \*\*one stage at a time\*\* and persist results, so a Deep run is a sequence of short invocations, not one long request.
\- If a source fails, mark \`source\_failed\` and continue with remaining sources.
\- Client shows per-stage status and a per-source health chip.

\#\# 8\. Current Delivery Scope

The current delivery includes the full research pipeline, professional writing and validation, role-based collaboration, Student and Professor agents, supervision, peer review, grant planning, collaborator discovery, and lab analytics. These are one coherent release rather than deferred phase labels.

\#\# 9\. Professional Role Layer (Current Phase)

The Professional Studio is a role-aware layer over the same authenticated project and evidence model:

\`Student / Professor / Research Assistant / Lab Admin → Professional Studio → professional-agent → evidence-scoped output\`

\- \`role_agent_outputs\` stores every professional action, structured output, evidence-quality label, source run, model, actor, and timestamp.
\- \`supervision_assignments\` and \`supervision_updates\` store student progress and human feedback under project RLS.
\- \`set_own_professional_profile\` constrains public role onboarding; \`lab_admin\` cannot be self-assigned.
\- \`get_lab_analytics\` derives project-scoped institutional metrics after membership authorization.
\- \`professional-agent\` uses action-specific strict JSON schemas. Professor-only actions verify the caller's profile role and every action first verifies project access through RLS.
\- Discovery, intelligence, reviewer, grant, collaborator, and supervision outputs never broaden the caller's data access and never call the LLM from the browser.
\- \`paper-validator\` performs deterministic seven-word-shingle overlap screening after authorization. It compares only linked abstracts and extracted uploaded source/supplement text, stores the report with service-role privileges, and returns matches through read-only project RLS.
\- The client cannot forge or modify similarity records. Manuscript hashes prevent stale scores from being presented for edited content, and server finalization continues to block on unresolved high-risk human-review findings.

Evidence states:

\- \`verified\`: deterministic output derived directly from stored records.
\- \`grounded\`: model-assisted interpretation constrained to a selected run, manuscript, or supervision record.
\- \`requires_verification\`: planning or generation output containing assumptions, estimates, or candidate resources that need independent confirmation.
