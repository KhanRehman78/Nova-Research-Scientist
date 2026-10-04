export type Mode = "quick" | "deep" | "expert";
export type ProfessionalRole = "professor" | "student" | "research_assistant" | "lab_admin";
export type SelfAssignableRole = Extract<ProfessionalRole, "student" | "research_assistant">;

export type RunStatus =
  | "pending"
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type StageKey =
  | "plan"
  | "search"
  | "paper-reader"
  | "gap"
  | "hypothesis"
  | "experiment"
  | "report";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export interface Profile {
  id: string;
  full_name: string;
  role: ProfessionalRole;
  institution: string;
  department: string;
  research_interests: string[];
  expertise_level: "developing" | "intermediate" | "advanced" | "expert";
  onboarding_completed: boolean;
  privileged_role_verified: boolean;
  role_verified_at: string | null;
  created_at: string;
}

export interface ResearchProject {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  created_at: string;
}

export interface ResearchRun {
  id: string;
  project_id: string;
  user_id: string;
  query: string;
  mode: Mode;
  status: RunStatus;
  current_stage: StageKey | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface RunTask {
  id: string;
  run_id: string;
  stage: string;
  status: TaskStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Paper {
  id: string;
  run_id: string;
  source: string;
  source_id: string | null;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  abstract: string | null;
  url: string | null;
  citation_count: number;
  open_access_pdf: string | null;
  openalex_id?: string | null;
  oa_status?: "unknown" | "closed" | "bronze" | "green" | "gold" | "hybrid" | "diamond";
  full_text_status?: "unknown" | "available" | "metadata_only" | "unavailable" | "restricted" | "failed";
  full_text_url?: string | null;
  full_text_source?: string | null;
  full_text_license?: string | null;
  full_text_checked_at?: string | null;
  enriched_metadata?: Record<string, unknown>;
  created_at: string;
}

export interface LiteratureRow {
  id: string;
  run_id: string;
  paper_id: string;
  method: string | null;
  dataset: string | null;
  result: string | null;
  problem: string | null;
}

export interface Gap {
  id: string;
  run_id: string;
  title: string;
  statement: string;
  existing_coverage: string | null;
  opportunity: string | null;
  gap_map_json: {
    clusters?: { topic: string; coverage_score: number; opportunity_score: number }[];
    missing_topics?: string[];
  };
}

export interface Hypothesis {
  id: string;
  run_id: string;
  title: string;
  hypothesis: string;
  objectives: string[];
  expected_contribution: string | null;
  confidence: number;
  novelty: number;
}

export interface Experiment {
  id: string;
  run_id: string;
  dataset: string | null;
  algorithm: string | null;
  architecture_json: {
    layers?: { name: string; type: string; detail: string }[];
  };
  metrics_json: { metrics?: string[] };
}

export interface Report {
  id: string;
  run_id: string;
  title: string;
  abstract: string | null;
  sections_json: { sections?: { heading: string; body: string }[] };
}

export interface PlanOutput {
  objective: string;
  tasks: { title: string; description: string }[];
  estimated_time_seconds: number;
}

export interface SearchSummary {
  total: number;
  sources: { source: string; status: "ok" | "failed" | "empty"; count: number; error?: string }[];
  saved_at?: string;
}

export type WritingMode = "human_authored" | "ai_assisted";
export type CorpusScope = "private" | "shared_opt_in" | "excluded";
export type ManuscriptStatus = "draft" | "validating" | "needs_revision" | "submission_ready";
export type ManuscriptEditSource = "human" | "imported" | "ai_generated" | "ai_assisted";
export type SuggestionCategory = "grammar" | "clarity" | "academic_tone" | "author_voice" | "structure" | "citation" | "integrity";
export type FindingCategory =
  | "citation_integrity"
  | "evidence_support"
  | "methodology"
  | "statistics"
  | "journal_compliance"
  | "ethics"
  | "language"
  | "originality"
  | "provenance";
export type FindingSeverity = "pass" | "info" | "warning" | "blocking" | "human_review";

export interface ReadinessGate {
  key: string;
  label: string;
  status: "pass" | "warning" | "blocking" | "human_review";
  detail: string;
}

export interface Manuscript {
  id: string;
  project_id: string;
  owner_id: string;
  research_run_id: string | null;
  title: string;
  target_journal: string;
  article_type: string;
  citation_style: string;
  writing_mode: WritingMode;
  corpus_scope: CorpusScope;
  shared_corpus_consent_at: string | null;
  shared_corpus_consent_version: string | null;
  status: ManuscriptStatus;
  content: string;
  abstract: string;
  keywords: string[];
  journal_requirements: Record<string, unknown>;
  ai_disclosure: string;
  readiness: {
    gates?: ReadinessGate[];
    summary?: string;
    validated_at?: string;
    finalized_at?: string;
    content_sha256?: string;
  };
  validation_completed_at: string | null;
  last_validated_sha256: string | null;
  similarity_score: number | null;
  similarity_screened_at: string | null;
  last_edit_source: ManuscriptEditSource;
  last_change_summary: string;
  created_at: string;
  updated_at: string;
}

export interface SimilaritySectionScore {
  section: string;
  similarity: number;
  matched_words: number;
  total_words: number;
}

export interface SimilarityReport {
  id: string;
  manuscript_id: string;
  content_sha256: string;
  overall_similarity: number;
  matched_word_count: number;
  total_word_count: number;
  match_count: number;
  section_scores: SimilaritySectionScore[];
  corpus_scope: {
    linked_paper_fulltexts?: number;
    linked_paper_abstracts?: number;
    uploaded_sources?: number;
    nova_private_documents?: number;
    nova_shared_documents?: number;
    sources_compared?: number;
    proprietary_database_coverage?: boolean;
    open_access_fulltext_coverage?: boolean;
    open_web_coverage?: boolean;
  };
  methodology: Record<string, unknown>;
  disclaimer: string;
  status: "limited_corpus" | "review_required" | "screened";
  created_at: string;
}

export interface SimilarityMatch {
  id: string;
  report_id: string;
  manuscript_id: string;
  section: string;
  manuscript_excerpt: string;
  source_type: "linked_paper" | "uploaded_source" | "nova_corpus";
  source_title: string;
  source_reference: string | null;
  source_excerpt: string;
  similarity: number;
  matched_word_count: number;
  classification: "quoted_or_cited" | "near_verbatim" | "substantial_overlap" | "phrase_overlap";
  requires_human_review: boolean;
  created_at: string;
}

export interface SimilarityMatchFeedback {
  id: string;
  match_id: string;
  manuscript_id: string;
  reviewer_id: string;
  verdict: "confirmed_overlap" | "false_positive" | "acceptable_reuse" | "needs_citation";
  note: string;
  created_at: string;
  updated_at: string;
}

export interface ExternalSimilaritySource {
  rank: number;
  title: string;
  url: string | null;
  similarity: number | null;
  matched_words: number | null;
}

export interface ExternalSimilarityScan {
  id: string;
  manuscript_id: string;
  requested_by: string | null;
  provider: "plagaware";
  content_sha256: string;
  provider_report_id: string;
  status: "scheduled" | "active" | "completed" | "error";
  overall_similarity: number | null;
  total_words: number | null;
  matched_words: number | null;
  credits_used: number | null;
  sources: ExternalSimilaritySource[];
  report_html_url: string | null;
  report_pdf_url: string | null;
  provider_metadata: Record<string, unknown>;
  error_message: string | null;
  disclaimer: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

export interface ManuscriptVersion {
  id: string;
  manuscript_id: string;
  version_number: number;
  content: string;
  source: ManuscriptEditSource;
  change_summary: string;
  content_sha256: string;
  created_by: string | null;
  created_at: string;
}

export interface ManuscriptDocument {
  id: string;
  manuscript_id: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  kind: "manuscript" | "source" | "supplement" | "guidelines" | "data";
  extracted_text: string;
  extraction_status: "pending" | "complete" | "partial" | "failed";
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface PaperFullText {
  id: string;
  paper_id: string;
  run_id: string;
  source: string;
  source_url: string;
  license: string | null;
  word_count: number;
  retrieval_status: "available" | "metadata_only" | "unavailable" | "restricted" | "failed";
  retrieved_at: string;
}

export interface JournalProfile {
  id: string;
  manuscript_id: string;
  journal_name: string;
  guidelines_document_id: string | null;
  content_sha256: string;
  rules: Record<string, unknown>;
  evidence: { rule: string; excerpt: string }[];
  status: "extracted" | "requires_review" | "confirmed";
  model: string | null;
  updated_at: string;
}

export interface ManuscriptCitation {
  id: string;
  manuscript_id: string;
  paper_id: string | null;
  citation_key: string;
  csl_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface ManuscriptComment {
  id: string;
  manuscript_id: string;
  content_sha256: string;
  selected_text: string;
  start_offset: number | null;
  end_offset: number | null;
  body: string;
  status: "open" | "resolved";
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface WritingSuggestion {
  id: string;
  manuscript_id: string;
  category: SuggestionCategory;
  severity: "info" | "warning" | "blocking";
  original_excerpt: string;
  suggested_text: string;
  explanation: string;
  status: "open" | "accepted" | "dismissed";
  generated_by: "ai" | "rule";
  content_sha256: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ValidationFinding {
  id: string;
  manuscript_id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
  status: "open" | "resolved" | "accepted_risk";
  content_sha256: string;
  created_at: string;
  resolved_at: string | null;
}

export interface AuthorSignoff {
  id: string;
  manuscript_id: string;
  profile_id: string;
  role: string;
  approved: boolean;
  statement: string;
  content_sha256: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ProfessionalAction =
  | "topic_finder"
  | "paper_simplifier"
  | "research_roadmap"
  | "thesis_coach"
  | "professor_discovery"
  | "literature_intelligence"
  | "peer_review"
  | "grant_proposal"
  | "global_grant_search"
  | "collaborator_finder"
  | "supervision_feedback";

export interface RoleAgentOutput {
  id: string;
  project_id: string;
  user_id: string;
  source_run_id: string | null;
  action: ProfessionalAction;
  title: string;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown>;
  evidence_quality: "verified" | "grounded" | "requires_verification";
  model: string | null;
  created_at: string;
}

export interface SupervisionAssignment {
  id: string;
  project_id: string;
  student_id: string;
  supervisor_id: string;
  research_title: string;
  status: "proposed" | "active" | "on_hold" | "completed";
  progress: number;
  risk_summary: string;
  next_milestone: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupervisionUpdate {
  id: string;
  assignment_id: string;
  author_id: string;
  section: "topic" | "proposal" | "literature" | "methodology" | "data" | "analysis" | "writing" | "submission";
  status: "not_started" | "in_progress" | "needs_review" | "approved" | "blocked";
  progress: number;
  note: string;
  ai_feedback: Record<string, unknown>;
  created_at: string;
}

export interface LabAnalytics {
  members: number;
  active_runs: number;
  completed_runs: number;
  papers: number;
  open_access_papers: number;
  full_text_papers: number;
  reports: number;
  manuscripts: number;
  submission_ready: number;
  similarity_review_required: number;
  grant_opportunities: number;
  supervised_students: number;
  average_student_progress: number;
  open_risks: number;
  generated_at: string;
}
