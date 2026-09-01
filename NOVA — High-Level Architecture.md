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

\#\# 8\. Phased Delivery

\- \*\*Phase 1 (hackathon core)\*\*: Dashboard, Plan, Search, Literature Room, Gap, Hypothesis, minimal Report. Quick mode end-to-end.  
\- \*\*Phase 2\*\*: Full 8 interfaces polish, PDF/Word/LaTeX export, Deep \+ Expert modes, collaboration (auth \+ roles).  
\- \*\*Phase 3\*\*: Voice assistant, AI reviewer simulation, research timeline generator, larger-scale vector search.

