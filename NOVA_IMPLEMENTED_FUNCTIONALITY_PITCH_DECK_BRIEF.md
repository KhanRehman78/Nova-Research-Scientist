# NOVA — Implemented Functionality & Pitch Deck Brief

**Product name:** NOVA  
**Positioning:** Autonomous Intelligence Research Engine  
**Document purpose:** Product functionality reference and source material for a professional investor, university, research-lab, or stakeholder pitch deck  
**Implementation status date:** 2 September 2026

---

## 1. Executive Summary

NOVA is a role-aware research workspace that helps students, researchers, professors, supervisors, and research labs move from an initial research question to an evidence-scoped research proposal and an auditable manuscript workflow.

The product combines:

- a multi-stage autonomous research pipeline;
- live academic-source retrieval and literature organization;
- lawful open-access resolution and machine-readable full-text enrichment;
- research-gap, hypothesis, and experiment-design assistance;
- professional student and professor workflows;
- academic writing, grammar, clarity, and author-voice guidance;
- manuscript validation and submission-readiness controls;
- open-full-text and local-source similarity screening with exact matched passages;
- citation-library, bibliography, journal-rule, and passage-comment workflows;
- live public grant discovery and global funder discovery;
- project collaboration, supervision records, and lab analytics;
- Supabase authentication, private storage, database persistence, and row-level access control.

NOVA is designed as **decision support for research**, not as a replacement for researchers, supervisors, peer reviewers, ethics boards, statisticians, institutional similarity services, or journal editors.

### One-line pitch

> NOVA turns a research question into a traceable literature map, research gap, testable hypothesis, experiment plan, proposal, and publication-readiness workflow—inside one secure, role-aware platform.

---

## 2. The Problem NOVA Addresses

Academic research is fragmented across search engines, reference lists, spreadsheets, writing tools, supervisor conversations, document folders, and submission checklists. Common problems include:

- researchers spending large amounts of time repeating search and screening work;
- literature findings being stored without a consistent evidence structure;
- weak traceability between the original literature, claimed gap, hypothesis, and proposed method;
- students struggling to convert a broad interest into a feasible research question;
- professors lacking one view of student progress, risks, manuscripts, and outputs;
- writing assistants generating text without transparent provenance or author accountability;
- manuscript checks that return a score without showing the exact evidence behind it;
- sensitive research records being shared through disconnected or insecure tools.

NOVA addresses these problems by using one persistent research record across discovery, reasoning, writing, validation, collaboration, and supervision.

---

## 3. Primary Users

### Students

- Undergraduate and postgraduate research students
- Master's and PhD candidates
- Students learning how to evaluate papers and plan a defensible study

### Professors and Supervisors

- Academic supervisors
- Principal investigators
- Peer reviewers and research mentors
- Grant-planning teams

### Research Assistants

- Literature-review assistants
- Lab or project research staff
- Team members working inside shared projects

### Research Labs and University Teams

- Labs monitoring multiple projects and supervised students
- Departments needing role-aware collaboration and project analytics
- Institutional teams requiring more auditable AI-assisted workflows

---

## 4. Product Architecture at a Glance

```text
User Browser / Vercel Frontend
            |
            | Supabase session + publishable key
            v
Supabase Auth, Postgres, Realtime and Private Storage
            |
            | authenticated Edge Function calls
            v
NOVA Research, Writing, Validation and Professional Agents
            |
            +--> OpenAI structured-output model
            +--> arXiv
            +--> Semantic Scholar
            +--> PubMed
            +--> OpenAlex
            +--> OpenAlex Content (licensed OA TEI)
            +--> Unpaywall
            +--> Europe PMC full text
            +--> Crossref
            +--> Grants.gov
```

### Technology stack

| Layer | Implemented technology |
|---|---|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Navigation | React Router with authenticated routes |
| Authentication | Supabase email/password authentication |
| Database | Supabase Postgres |
| File storage | Private Supabase Storage bucket |
| Authorization | Postgres Row Level Security and protected RPC functions |
| Backend logic | Supabase Edge Functions |
| Live status | Supabase Realtime task updates |
| AI | OpenAI structured JSON outputs; default model is `gpt-5.6-luna`, configurable with `OPENAI_MODEL` |
| Academic sources | arXiv, Semantic Scholar, PubMed, OpenAlex, Unpaywall, Europe PMC, Crossref |
| Funding sources | Live Grants.gov opportunities, OpenAlex global funder profiles, official regional portal links |
| Planned web hosting | Vercel frontend with Supabase backend |

All privileged API keys remain in Supabase Edge Function secrets. The browser only receives the Supabase project URL and publishable key.

---

## 5. Authentication, Profiles, and Roles

### Implemented authentication flow

1. A user creates an account using full name, email, password, and professional role.
2. Supabase creates the authenticated user and associated profile.
3. If email confirmation is enabled, NOVA asks the user to confirm the email before signing in.
4. A persistent Supabase session keeps the user signed in and refreshes securely.
5. Protected routes redirect unauthenticated users to the authentication screen.

### Implemented roles

- Student
- Professor / Supervisor
- Research Assistant
- Research Lab Admin

`lab_admin` cannot be assigned through public self-registration. It requires an authorized administrative change.

### Professional profile fields

- Full name
- Role
- Institution
- Department
- Research interests
- Expertise level

Role selection controls which professional tools are visible and which server-side actions are authorized.

---

## 6. Dashboard and Research Workspaces

### Project workspace

- A first-time user automatically receives a private **My Research** project.
- Users can access projects they own or projects in which they are registered members.
- The dashboard shows recent research runs, completed runs, and total papers collected.
- Users can resume a run from its last persisted stage.

### Collaboration

- Project owners can add an existing registered colleague by email.
- Supported collaboration roles are Professor, Student, and Research Assistant.
- Members share only the projects to which they have been added.
- Project ownership controls member invitations and sensitive management actions.

### Research modes

| Mode | Intended use |
|---|---|
| Quick | Top papers, key gap, and one hypothesis |
| Deep | Broader corpus and fuller literature matrix |
| Expert | Maximum configured coverage and full proposal workflow |

The mode influences research depth and expected processing time. Actual duration depends on academic-source and AI API response times.

---

## 7. Autonomous Research Pipeline

NOVA implements a persistent seven-stage research workflow.

```text
Research Question
      ↓
1. Plan
      ↓
2. Multi-source Search
      ↓
3. Paper Analysis / Literature Matrix
      ↓
4. Research Gap
      ↓
5. Hypothesis
      ↓
6. Experiment Design
      ↓
7. Research Proposal
```

Each stage writes its status and output to Postgres. Realtime updates drive the mission-control progress interface. If a completed stage already exists, the client can resume without repeating it.

### 7.1 Planning Agent

**Input:** Natural-language research question and selected depth mode.

**Output:**

- concise research objective;
- four to seven concrete research tasks;
- estimated processing duration;
- persisted task plan for all later stages.

**User control:** The user can review, edit, and save the plan before approving the pipeline.

### 7.2 Multi-source Academic Search

NOVA queries five academic sources:

1. arXiv
2. Semantic Scholar
3. PubMed
4. OpenAlex
5. Crossref

**Processing:**

- queries sources in parallel where supported;
- normalizes source records into one paper schema;
- de-duplicates papers;
- stores title, authors, year, DOI, URL, abstract, citation count, and open-access PDF link when available;
- records per-source status so one unavailable source does not silently become complete coverage.

### 7.3 Knowledge Explorer

The retrieved corpus is presented as:

- an interactive knowledge map;
- source-colored paper nodes;
- node size based on citation count;
- paper cards with title, authors, year, abstract, citation count, DOI, paper URL, and available open PDF;
- corpus statistics including paper count, source count, and average publication year.

### 7.4 Open-Access Enrichment, Paper Reader, and Literature Matrix

For a linked research run, NOVA now:

- resolves DOI-level open-access status and locations through Unpaywall;
- enriches work, author, institution, funder, retraction, license, and content metadata through OpenAlex;
- retrieves Europe PMC full-text XML when available;
- retrieves OpenAlex TEI only when machine-readable content exists and the recorded license permits reuse;
- stores source URL, license, retrieval status, content hash, word count, and timestamp behind project RLS;
- records restricted, metadata-only, unavailable, and failed states rather than silently treating them as full text.

NOVA analyzes available full text first, then the abstract, then title-only evidence, and extracts:

- method or approach;
- dataset;
- reported result or finding;
- addressed problem or remaining limitation.

The Literature Room provides:

- a sortable matrix;
- problem-based filters;
- pagination;
- counts of extracted findings, methods, and open problems.

Each matrix row stores its evidence scope, a supporting excerpt, and source URL where available. If an item is not stated in the supplied evidence, the agent is instructed to leave it empty instead of inventing it.

### 7.5 Research Gap Finder

The gap agent uses the retrieved papers and literature matrix to produce:

- a primary gap title and statement;
- what existing work already covers;
- the specific research opportunity;
- four to seven thematic clusters;
- cluster coverage and opportunity scores;
- missing or weakly addressed topics.

These outputs are evidence-scoped interpretations of the selected corpus, not proof that no publication outside the corpus addresses the gap.

### 7.6 Hypothesis Studio

The scientist agent produces:

- one novel, testable hypothesis;
- two to four research objectives;
- expected contribution;
- confidence score;
- preliminary novelty score.

The hypothesis is generated from the research question, literature matrix, and detected gap.

### 7.7 Experiment Designer

The same evidence-grounded scientist workflow produces:

- recommended dataset;
- algorithm or approach;
- architecture layers and details;
- evaluation metrics.

This is a research blueprint. Dataset access, ethics, statistical power, experimental feasibility, and clinical or regulatory use still require qualified human verification.

### 7.8 Report Generator

NOVA assembles the research record into a structured proposal containing six to nine substantive sections, such as:

- Introduction and motivation
- Literature review
- Research gap
- Proposed hypothesis
- Experiment design
- Expected contributions and risks
- Timeline

Implemented report actions:

- Copy Markdown
- Download Markdown
- Download Word-compatible document
- Download LaTeX
- Print/export PDF

---

## 8. Writing Studio

The Writing Studio supports independent manuscripts and manuscripts linked to a completed NOVA research run.

### 8.1 Manuscript setup

Implemented metadata includes:

- title;
- target journal;
- article type;
- citation style;
- keywords;
- linked research run;
- journal requirements;
- AI-assistance disclosure.

Supported article types include research article, review, systematic review, conference paper, short communication, and thesis chapter.

Supported citation-style metadata includes APA 7, IEEE, Vancouver, Chicago, Harvard, and journal-specific.

### 8.2 Two authorship modes

#### Human-authored mode

- NOVA identifies grammar, clarity, academic tone, author-voice consistency, structure, citation, and integrity issues.
- The system provides explanation and editing guidance.
- It does **not** provide insertable replacement prose.
- The researcher performs every substantive edit.

#### AI-assisted mode

- NOVA can provide conservative replacement text when it preserves the author's meaning.
- Suggestions can be applied through the interface.
- Accepted AI-assisted changes are recorded in provenance.
- A manuscript can be drafted from a linked NOVA research run.
- Generated drafts are instructed not to invent results, authors, DOIs, ethics approvals, participant counts, or statistics.
- AI-assistance disclosure is stored and included in exports.

NOVA provides **author-voice improvement**, not AI-detector evasion. It does not claim that text is “100% human generated” or undetectable.

### 8.3 Grammar and academic-language review

The editorial assistant evaluates:

- grammar;
- clarity;
- academic tone;
- author voice;
- structure;
- citation presentation;
- integrity concerns.

Each suggestion contains:

- category;
- severity;
- exact source excerpt when applicable;
- explanation;
- optional conservative revision in AI-assisted mode;
- open, accepted, or dismissed state;
- content hash tying the suggestion to the exact manuscript version.

### 8.4 Structured academic editor and review comments

- Markdown remains the authoritative, exportable manuscript format.
- The editor includes heading, bold, italic, and evidence-quote controls.
- A reviewer can select an exact passage and attach a comment.
- Comments store selected text, offsets, author, status, timestamp, and manuscript content hash.
- Comments from an earlier manuscript hash remain visible as earlier-version review evidence.
- Open comments can be resolved without deleting the audit record.

### 8.5 Immutable provenance versions

- A manuscript version is captured when a manuscript is created.
- Content changes create new version records.
- Versions store edit source, change summary, content, author, timestamp, and SHA-256 content hash.
- Previous content can be loaded into the editor and saved as a new restoration version.
- Editing a validated manuscript invalidates stale validation and sign-off status.

### 8.6 Private document workspace

Supported uploads:

- PDF
- DOCX
- TXT
- Markdown

Document types:

- manuscript;
- source paper;
- supplement;
- journal guidelines;
- data note.

PDF and DOCX text is extracted locally in the browser. The original file is stored in a private Supabase bucket with project-based access policies. The current configured file limit is 25 MB, and downloads use short-lived signed URLs.

### 8.7 Citation library and bibliography

- Papers from a linked research run can be added to a structured manuscript citation library.
- NOVA stores a citation key and CSL-shaped metadata with the source-paper link.
- Authors can insert an in-text marker at the editor cursor.
- A bibliography can be generated from the current library in APA 7, IEEE, Vancouver, Chicago, or Harvard form.
- Journal-specific punctuation and edge cases remain a mandatory human check.

### 8.8 Journal requirement profile

- The author uploads the current official author guide as a private Guidelines document.
- NOVA extracts explicit limits and requirements with exact source excerpts.
- Supported rule types include title, abstract, manuscript and keyword limits; required sections; table/figure limits; reference style; ethics, data, conflict, funding and AI-disclosure requirements; and submission-file requirements.
- If the OpenAI review is unavailable, a conservative deterministic extractor still records explicit patterns and marks the profile as requiring review.
- The validator applies measurable rules to the exact current manuscript.

### 8.9 Professional manuscript exports

The Writing Studio generates:

- real DOCX;
- paginated PDF;
- LaTeX;
- Markdown.

Exports include manuscript metadata, workflow state, and AI disclosure where applicable.

---

## 9. Manuscript Validator

The full validator combines deterministic checks, verified external metadata, and conservative AI-assisted review.

### 9.1 Deterministic checks

- Minimum manuscript content length
- Approximate word count
- Required core headings
- Target-journal presence
- Exact SHA-256 content version
- Current validation status
- Open blocking and human-review issues
- Current author attestation
- Extracted journal-rule conformance
- Full-text-aware local similarity corpus

Core heading detection includes Abstract, Introduction, Methods/Methodology, Discussion, and References/Bibliography.

### 9.2 DOI and retraction checks

- DOI identifiers are extracted from the manuscript.
- Crossref is used to verify DOI metadata.
- OpenAlex is used as a second verification source and to check available retraction status.
- Unverified identifiers produce a warning.
- A source marked retracted produces a blocking issue.

These checks depend on the coverage and availability of Crossref and OpenAlex records.

### 9.3 Conservative academic review

The validator reviews observable manuscript content for:

- evidence support;
- methodology completeness;
- statistical reporting;
- ethics statements;
- language quality;
- journal compliance;
- originality-review requirements;
- provenance and AI disclosure.

Results are classified as:

- Pass
- Information
- Warning
- Blocking
- Human review required

The interface provides both **Deterministic checks** and **Full validation**. Deterministic mode remains usable before OpenAI credits are added; full mode adds the structured AI-assisted academic review. OpenAI calls have a bounded server timeout so an unavailable provider cannot hold the workflow indefinitely.

### 9.4 Six readiness gates

1. Citation integrity
2. Methods and statistics
3. Ethics and disclosure
4. Language quality
5. Journal compliance
6. Originality review

Automated passes mean that no issue was detected in that limited check. They do not prove factual correctness or guarantee publication acceptance.

---

## 10. Similarity and Source-Overlap Screening

NOVA implements an auditable local-corpus similarity report rather than presenting an unsupported “plagiarism verdict.”

### Comparison corpus

The validator compares manuscript prose against:

- legally retrieved open full text from papers in the linked research run;
- remaining abstracts where full text was not lawfully retrievable;
- uploaded source documents;
- uploaded supplementary documents.

### Implemented algorithm

- text normalization;
- seven-word shingles;
- minimum nine contiguous shared words;
- minimum 30% coverage of a screened passage;
- References, Bibliography, and Works Cited sections excluded from the score;
- up to 50 highest-priority de-duplicated matches returned;
- report tied to the exact manuscript SHA-256 hash.

### Displayed result

- overall Similarity Score;
- matched-word count;
- total screened-word count;
- number of compared sources;
- count of full-text versus abstract-only linked sources;
- section-by-section similarity percentage;
- exact matched manuscript passage;
- matched source title and reference;
- normalized shared phrase;
- passage-level match strength;
- matched contiguous-word count;
- human-review requirement.

### Match classifications

- Quoted or cited
- Near verbatim
- Substantial overlap
- Phrase overlap

### Important scientific limitation

The score is **not a definitive plagiarism percentage**. NOVA does not currently search:

- proprietary publisher similarity indexes;
- private student-paper repositories;
- every webpage on the open internet;
- licensed institutional databases such as Turnitin or iThenticate.

For a final publication, the exact final manuscript should still be checked through an institution-approved licensed similarity service, and every match should be interpreted by a qualified human reviewer.

---

## 11. Submission-Readiness and Author Accountability

“Submission ready” is a controlled server-side workflow state.

The server requires:

1. at least 500 characters of manuscript content;
2. validation completed for the exact current content hash;
3. no open blocking or human-review findings for that hash;
4. author attestation for the same content hash.

The author attests that they:

- reviewed the manuscript;
- checked authorship and sources to the best of their knowledge;
- disclosed AI assistance where required;
- accept responsibility for the final work.

The browser cannot directly forge validation findings, similarity reports, or protected readiness fields.

“Submission ready” does not mean:

- accepted by a journal;
- error-free;
- plagiarism-cleared by every database;
- proven human-generated;
- ethically or legally approved.

---

## 12. Professional Studio — Student Workflows

### 12.1 Research Topic Finder

Produces four to eight candidate topics with:

- title;
- research question;
- rationale;
- difficulty level;
- required skills;
- preliminary novelty-prioritization score;
- dataset-readiness status;
- dataset candidates;
- evidence gaps.

Dataset names without supporting evidence are labeled as candidates requiring verification.

### 12.2 Paper Simplifier

Accepts uploaded PDF/DOCX/TXT/Markdown or pasted text and returns:

- plain-language summary;
- research question;
- method;
- findings;
- limitations;
- terminology explanations;
- questions for the paper's author;
- confidence note.

The agent is instructed to separate what the supplied paper reports from its own interpretation.

### 12.3 Research Roadmap

Produces:

- objective;
- prerequisites;
- three or more phases;
- period, goal, deliverables, risks, and required evidence for each phase;
- decision gates;
- accuracy safeguards.

### 12.4 Thesis Assistant

Produces:

- proposed title;
- problem statement;
- measurable objectives;
- answerable research questions;
- methodology outline;
- ethics checks;
- milestones;
- unresolved evidence gaps.

---

## 13. Professional Studio — Professor and Supervisor Workflows

Professor-only actions are checked both in the interface and in the Edge Function.

### 13.1 Advanced Discovery

Uses a completed NOVA research run to identify:

- emerging topics;
- signals and confidence;
- evidence IDs;
- research gaps;
- recommended follow-up queries;
- scope limitations.

### 13.2 Literature Intelligence

Produces:

- thematic clusters;
- citation leaders from the selected corpus;
- method patterns;
- future research directions;
- scope limitations.

### 13.3 Structured Peer Reviewer

Reviews a selected manuscript and returns:

- summary;
- scores for novelty, methodology, evidence, clarity, and reproducibility;
- major issues with evidence excerpts and required actions;
- minor issues;
- required human reviews;
- conservative recommendation;
- recommendation rationale;
- confidence score.

Available recommendations are Not Ready, Major Revision, Minor Revision, or Ready for External Review. The result is not represented as a journal decision.

### 13.4 Grant Proposal Studio

Uses a completed research record to generate:

- title and executive summary;
- objectives;
- work packages and deliverables;
- timeline;
- estimated budget lines and currency;
- expected outcomes;
- risks;
- compliance checks;
- verification note.

Budget figures are planning estimates only and require institutional rates, quotes, funder rules, and eligibility verification.

### 13.5 Collaborator Finder

- Extracts exact author names from papers in the selected corpus.
- Ranks candidate authors using stored corpus evidence.
- Enriches exact-name matches from public OpenAlex profiles with OpenAlex ID, ORCID when present, current public affiliation, country, work count, citation count, and h-index.
- Preserves evidence references behind the recommendation.

Exact identity, current affiliation, availability, and contact details remain subject to human confirmation. NOVA does not collect or infer private contact information.

### 13.6 Global Grant Discovery

- Searches live posted and forecasted Grants.gov opportunities.
- Stores source ID, title, agency, status, dates, public URL, disciplines, and source payload with a fetch timestamp.
- Searches OpenAlex for relevant funders across countries.
- Provides official discovery links for EU Funding & Tenders, UKRI, WHO, and World Bank partnership/funding pages.
- Persists each discovery result with source status and coverage note.

The current structured live opportunity feed is Grants.gov. Other regions are represented through global funder profiles and official portal links; eligibility, currency, deadline, and programme rules must be confirmed on the official call page.

### 13.7 Supervision Assistant

Uses stored supervision records to produce:

- evidence-based progress summary;
- observed strengths;
- risks;
- recommended actions;
- questions for the student;
- confidence and evidence limitations.

The agent cannot silently change recorded student progress.

---

## 14. Supervision and Research-Lab Management

### Supervision records

Project owners can create student assignments containing:

- student;
- research title or supervision objective;
- progress percentage;
- current section;
- status;
- risk summary;
- next milestone;
- supervision notes and updates.

### Lab analytics

Authorized Professor and Lab Admin users can view project-scoped metrics such as:

- members;
- supervised students;
- research runs;
- collected papers;
- open-access papers and stored open full texts;
- generated reports;
- manuscripts;
- submission-ready manuscripts;
- manuscripts requiring similarity review;
- stored grant opportunities;
- average supervision progress;
- open risks.

### Auditable professional history

Every professional-agent result is stored with:

- project;
- actor;
- action;
- title;
- structured input and output;
- selected research run, manuscript, or supervision assignment;
- evidence-quality label;
- AI model;
- timestamp.

Evidence-quality labels are:

- **Verified:** deterministic output derived directly from stored records.
- **Grounded:** model-assisted interpretation constrained to selected evidence.
- **Requires verification:** planning or generation containing assumptions, estimates, or candidate resources.

---

## 15. Security and Data Protection

### Implemented controls

- Supabase authenticated sessions
- Row Level Security on project, run, paper, writing, validation, professional, supervision, and similarity data
- Project membership checks
- Professor-only action verification on the server
- Public onboarding cannot assign Lab Admin
- Private manuscript storage
- Time-limited signed file downloads
- Service-role key restricted to server-side functions
- OpenAI key restricted to Supabase secrets
- OpenAlex key and Unpaywall central contact email restricted to Supabase secrets
- Protected manuscript readiness fields
- Server-generated validation and similarity records
- SHA-256 version binding
- Client-side prompt text treated as untrusted data by agent instructions
- Strict JSON schemas for AI outputs
- Input size limits and response validation

### Credential rule

Only these values belong in the Vercel frontend environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` / publishable key

Database passwords, service-role keys, Supabase access tokens, and OpenAI keys must never be added to the frontend or committed to Git.

---

## 16. Reliability and Verification Already Performed

### Build verification

- Production Vite build completed successfully.
- TypeScript compilation completed through the production build.
- Repository secret scan found no committed high-privilege credentials in the implemented change set.

### Professional ecosystem live test

The live Supabase test verified:

- secure role onboarding;
- project collaboration;
- student supervision;
- deterministic collaborator evidence;
- Topic Finder;
- Paper Simplifier;
- Research Roadmap;
- Thesis Assistant;
- Advanced Discovery;
- Literature Intelligence;
- Structured Peer Reviewer;
- Grant Proposal Studio;
- Supervision Assistant;
- evidence-quality labels;
- lab analytics;
- output persistence and RLS.

### Writing and validation live test

The live test verified:

- human-authored guidance mode;
- AI-assisted draft provenance;
- private file upload and signed download;
- deterministic validation findings;
- DOI verification;
- source-overlap report;
- exact section localization;
- similarity-report RLS;
- client forgery rejection;
- content-hash validation;
- human-review resolution;
- author sign-off;
- server-controlled finalization.

The controlled similarity fixture produced a 10.43% local-corpus score and localized the known overlap to the Introduction. This number is a test-fixture result, not a general product accuracy claim.

### Global open-research live test

The production Supabase test additionally verified:

- Unpaywall and OpenAlex metadata enrichment;
- retrieval and persistence of a real CC-BY OpenAlex TEI full text;
- content-license, URL, SHA-256, word-count, and retrieval-status storage;
- inclusion of the stored full text in the deterministic similarity corpus;
- live Grants.gov discovery and global OpenAlex funder results;
- citation-library RLS;
- passage-comment RLS;
- temporary-user cleanup without breaking retained provenance.

---

## 17. Current Deployment Status

### Already deployed

- Supabase database schema and RLS policies
- Supabase authentication integration
- Private manuscript storage configuration
- Research Edge Functions
- Professional Agent Edge Function
- Writing Assistant Edge Function
- Paper Validator and similarity-screening backend
- Open Research enrichment and global grant backend
- Journal-profile, citation-library, and manuscript-comment schema
- OpenAI secret integration through Supabase
- OpenAlex and Unpaywall secret integration through Supabase

### Ready for Vercel deployment

- React/Vite frontend
- Production build script
- Supabase publishable frontend integration

### Still required for the Vercel launch

1. Push the repository to GitHub or another supported Git provider.
2. Import the repository into Vercel. `vercel.json` already defines the Vite build, `dist` output, SPA fallback, cache, and baseline security headers.
3. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.example`.
4. Add the final Vercel URL to Supabase Auth URL Configuration.
5. Test email confirmation, direct-route refresh, research run, open-access enrichment, Writing Studio, and similarity report on the production domain.

The browser URL `localhost:5173/**` is not valid for opening the application. `/**` is an allow-list wildcard used only inside Supabase Redirect URLs. Local use should open `http://localhost:5173/` while `npm run dev` is actively running.

---

## 18. Honest Product Boundaries

The following claims should **not** appear in a pitch deck as implemented capabilities:

- “100% accurate” research conclusions
- “100% human-generated” certification
- guaranteed AI-detector evasion
- definitive plagiarism percentage across the entire internet
- Turnitin/iThenticate-equivalent proprietary database coverage
- guaranteed journal acceptance
- automatic ethics-board or regulatory approval
- clinical validation
- verified collaborator identity or availability
- confirmed funder eligibility or final institutional budget
- automatic direct submission to journals
- institutional SSO unless separately integrated

Recommended pitch language:

> NOVA provides evidence-scoped research and publication decision support with transparent limitations, provenance, and mandatory human-review gates.

---

## 19. Recommended Pitch Deck Structure

The following 14-slide structure can be copied directly into a presentation.

### Slide 1 — Title

**Headline:** NOVA  
**Subheadline:** Autonomous Intelligence Research Engine  
**Supporting line:** From research question to auditable proposal and publication-readiness workflow.

**Suggested visual:** NOVA dashboard or a clean pipeline diagram.

### Slide 2 — The Research Workflow Is Fragmented

**Key points:**

- Discovery, review, writing, supervision, and validation happen in disconnected tools.
- Evidence traceability is lost between literature search and final claims.
- Students need structured guidance; professors need scalable oversight.
- Generic AI writing creates provenance and accountability risks.

**Suggested visual:** Disconnected-tool icons converging into NOVA.

### Slide 3 — The NOVA Solution

**Key points:**

- One secure workspace for the full research lifecycle.
- Role-aware experiences for students, professors, assistants, and labs.
- AI outputs constrained by selected evidence and strict schemas.
- Human-review and author-accountability controls built into publication workflows.

### Slide 4 — End-to-End Autonomous Research Pipeline

**Show this flow:**

```text
Question → Plan → Search → Literature Matrix → Gap → Hypothesis
→ Experiment → Proposal → Manuscript → Validation
```

**Supporting proof:** Data persists at every stage and progress updates in real time.

### Slide 5 — Multi-source Research Intelligence

**Key points:**

- arXiv, Semantic Scholar, PubMed, OpenAlex, and Crossref
- Normalized and de-duplicated corpus
- Knowledge graph and reviewable paper cards
- Sortable literature matrix of methods, datasets, findings, and limitations

### Slide 6 — Evidence-to-Insight Reasoning

**Key points:**

- Thematic gap map
- Evidence-scoped research opportunity
- Testable hypothesis
- Experiment blueprint and evaluation metrics
- Structured research proposal exports

### Slide 7 — Responsible Writing Studio

**Key points:**

- Human-authored guidance and AI-assisted modes
- Grammar, clarity, academic tone, and author-voice review
- Immutable content versions and SHA-256 provenance
- PDF/DOCX source workspace
- DOCX, PDF, LaTeX, and Markdown exports

### Slide 8 — Auditable Validation and Similarity

**Key points:**

- Citation, methodology, statistics, ethics, language, journal, and originality gates
- DOI verification through Crossref and OpenAlex
- Similarity score with exact matched passages and section breakdown
- Human review blocks finalization when required
- Honest disclosure of licensed-corpus limitations

### Slide 9 — Built for Students

**Feature cards:**

- Research Topic Finder
- Paper Simplifier
- Research Roadmap
- Thesis Assistant

**Message:** NOVA turns broad interest into a feasible, reviewable research plan.

### Slide 10 — Built for Professors and Research Labs

**Feature cards:**

- Advanced Discovery
- Literature Intelligence
- Structured Peer Review
- Grant Proposal Studio
- Collaborator Finder
- Supervision Assistant
- Lab Analytics

### Slide 11 — Trust, Security, and Accountability

**Key points:**

- Supabase authentication and project-level RLS
- Private storage and signed downloads
- Server-side role checks
- Strict structured outputs
- Content-hash validation
- Author attestation
- No detector-evasion or publication-guarantee claims

### Slide 12 — Architecture and Scalability

**Visual:**

```text
Vercel React App
      ↓
Supabase Auth + Postgres + Realtime + Storage
      ↓
Edge Functions
      ↓
OpenAI + Academic APIs
```

**Key message:** The frontend scales independently while sensitive processing and data access remain server controlled.

### Slide 13 — Demonstrated Product Readiness

**Key points:**

- Production database migrations deployed
- Edge Functions deployed
- Professional ecosystem live test passed
- Writing and validator live test passed
- Similarity localization and client-forgery protection verified
- Vite production build passed

Avoid presenting the controlled 10.43% test-fixture score as an accuracy benchmark.

### Slide 14 — Vision and Next Step

**Current product:** Integrated research, writing, supervision, and validation workspace.

**Potential next integrations:**

- licensed institutional similarity provider;
- university SSO and tenant administration;
- full-text publisher agreements;
- reference-manager integrations;
- journal-specific submission packages;
- institutional audit and governance dashboards.

**Closing line:**

> NOVA does not replace academic judgment—it gives researchers a faster, structured, and more accountable way to apply it.

---

## 20. Suggested Five-Minute Product Demo

### Minute 0:00–0:30 — Sign in and role context

- Open the Supabase email/password login.
- Show the active Student or Professor role.
- Explain project-level privacy.

### Minute 0:30–1:20 — Launch research

- Enter a focused research question.
- Select Quick mode.
- Show the editable plan and approve it.
- Point to live mission-control stage progress.

### Minute 1:20–2:10 — Explore evidence

- Open Knowledge Explorer.
- Show five source types, knowledge map, DOI, and paper cards.
- Open Literature Room and filter the methods/results/open-problem matrix.

### Minute 2:10–2:50 — Research reasoning

- Show Gap Finder.
- Show the testable hypothesis and experiment blueprint.
- Show the generated proposal and export options.

### Minute 2:50–3:50 — Writing and validation

- Open Writing Studio.
- Demonstrate Human-authored versus AI-assisted controls.
- Upload a source document.
- Run editorial analysis and full validation.
- Show DOI checks, readiness gates, Similarity Score, section breakdown, and exact matched passage.

### Minute 3:50–4:35 — Professional Studio

- As a Student, show Topic Finder or Paper Simplifier.
- As a Professor, show Peer Reviewer, Grant Proposal, or Supervision Assistant.
- Show evidence-quality labels and saved output history.

### Minute 4:35–5:00 — Accountability close

- Show version history and author attestation.
- Explain that server finalization requires current validation and resolved human-review issues.
- Close with the one-line pitch.

---

## 21. Suggested Screenshots for the Pitch Deck

Capture these screens after the Vercel deployment is live:

1. Authentication screen with NOVA value proposition
2. Dashboard with Quick/Deep/Expert modes
3. Editable research plan
4. Knowledge graph and paper list
5. Literature matrix
6. Gap Finder cluster view
7. Hypothesis and Experiment Designer
8. Report Generator export controls
9. Writing Studio editor and authorship-mode selector
10. Similarity report showing section score and exact matched passage
11. Professional Studio student actions
12. Professional Studio professor actions and output history
13. Supervision assignment cards and progress
14. Lab analytics

Do not use `localhost:5173/**` when capturing screenshots. Use the final Vercel production URL, or use `http://localhost:5173/` only while the local development server is running.

---

## 22. Final Pitch Messaging

### Short version

> NOVA is a secure, role-aware research platform that connects literature discovery, evidence analysis, research design, academic writing, supervision, and publication-readiness in one auditable workflow.

### University version

> NOVA gives students structured research guidance while giving professors and institutions evidence-scoped outputs, project controls, supervision records, and human-review gates.

### Research-lab version

> NOVA helps research labs turn scattered search, writing, and supervision activity into persistent, reviewable project intelligence.

### Responsible-AI version

> NOVA combines AI acceleration with provenance, strict evidence scope, protected server controls, and explicit limits—so researchers remain accountable for the final academic work.
