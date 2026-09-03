import { useEffect, useRef, useState } from "react";
import {
  ArchiveRestore,
  BadgeCheck,
  Bold,
  BookCheck,
  BookPlus,
  Braces,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  FileType2,
  History,
  Heading2,
  Italic,
  Library,
  LockKeyhole,
  PenLine,
  MessageSquareText,
  Quote,
  RefreshCcw,
  ScanSearch,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  WandSparkles,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { functionErrorMessage } from "../lib/functions";
import {
  ACCEPTED_MANUSCRIPT_TYPES,
  exportDocx,
  exportLatex,
  exportMarkdown,
  exportPdf,
  extractDocumentText,
  manuscriptWordCount,
  sha256Text,
} from "../lib/documentFiles";
import type {
  AuthorSignoff,
  CorpusScope,
  ExternalSimilarityScan,
  JournalProfile,
  Manuscript,
  ManuscriptCitation,
  ManuscriptComment,
  ManuscriptDocument,
  ManuscriptVersion,
  Paper,
  PaperFullText,
  ResearchRun,
  SimilarityMatch,
  SimilarityMatchFeedback,
  SimilarityReport,
  ValidationFinding,
  WritingMode,
  WritingSuggestion,
} from "../lib/types";
import { bibliography, citationKey, formatInTextCitation, paperToCsl } from "../lib/citations";
import { Button, Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from "../components/ui";

type Tab = "write" | "sources" | "validate" | "submission";
type ProjectOption = { id: string; name: string };
type BusyAction = "create" | "save" | "analyze" | "draft" | "validate" | "external-scan" | "external-status" | "corpus" | "feedback" | "upload" | "signoff" | "finalize" | "export" | "enrich" | "journal" | "citation" | "comment" | null;

const FIELD_CLASS = "w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/40";
const ENABLE_EXTERNAL_PROVIDER = import.meta.env.VITE_ENABLE_EXTERNAL_SIMILARITY === "true";
const TABS: { key: Tab; label: string; icon: typeof PenLine }[] = [
  { key: "write", label: "Write", icon: PenLine },
  { key: "sources", label: "Sources", icon: Library },
  { key: "validate", label: "Validate", icon: ShieldCheck },
  { key: "submission", label: "Submission", icon: FileCheck2 },
];

const MODE_COPY: Record<WritingMode, { title: string; description: string }> = {
  human_authored: {
    title: "Human-authored",
    description: "NOVA flags issues and explains them, but never inserts replacement prose. You make every substantive edit.",
  },
  ai_assisted: {
    title: "AI-assisted",
    description: "NOVA may draft or apply edits. Each AI contribution is versioned and an assistance disclosure is included in exports.",
  },
};

function statusTone(status: string): "default" | "primary" | "success" | "warning" | "danger" | "violet" {
  if (status === "submission_ready" || status === "pass" || status === "resolved" || status === "screened" || status === "completed") return "success";
  if (status === "blocking" || status === "error") return "danger";
  if (status === "warning" || status === "needs_revision" || status === "limited_corpus" || status === "review_required") return "warning";
  if (status === "human_review") return "violet";
  if (status === "validating" || status === "scheduled" || status === "active") return "primary";
  return "default";
}

function labelize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function WritingStudio() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [suggestions, setSuggestions] = useState<WritingSuggestion[]>([]);
  const [findings, setFindings] = useState<ValidationFinding[]>([]);
  const [documents, setDocuments] = useState<ManuscriptDocument[]>([]);
  const [versions, setVersions] = useState<ManuscriptVersion[]>([]);
  const [signoffs, setSignoffs] = useState<AuthorSignoff[]>([]);
  const [similarityReport, setSimilarityReport] = useState<SimilarityReport | null>(null);
  const [similarityMatches, setSimilarityMatches] = useState<SimilarityMatch[]>([]);
  const [matchFeedback, setMatchFeedback] = useState<SimilarityMatchFeedback[]>([]);
  const [externalScan, setExternalScan] = useState<ExternalSimilarityScan | null>(null);
  const [externalConsent, setExternalConsent] = useState(false);
  const [linkedPapers, setLinkedPapers] = useState<Paper[]>([]);
  const [fullTexts, setFullTexts] = useState<PaperFullText[]>([]);
  const [journalProfile, setJournalProfile] = useState<JournalProfile | null>(null);
  const [citations, setCitations] = useState<ManuscriptCitation[]>([]);
  const [comments, setComments] = useState<ManuscriptComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [tab, setTab] = useState<Tab>("write");
  const [uploadKind, setUploadKind] = useState<ManuscriptDocument["kind"]>("source");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [contentHash, setContentHash] = useState("");

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      setLoading(true);
      const { data } = await supabase.from("projects").select("id, name").order("created_at");
      let available = (data ?? []) as ProjectOption[];
      if (!available.length) {
        const workspace = { id: crypto.randomUUID(), name: "My Research" };
        const { error: createError } = await supabase.from("projects").insert({
          ...workspace,
          description: "Default project",
          owner_id: user.id,
        });
        if (!createError) available = [workspace];
      }
      if (!cancelled) {
        setProjects(available);
        setProjectId(available[0]?.id ?? "");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [manuscriptRows, runRows] = await Promise.all([
        supabase.from("manuscripts").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
        supabase.from("research_runs").select("*").eq("project_id", projectId).eq("status", "completed").order("created_at", { ascending: false }).limit(30),
      ]);
      if (cancelled) return;
      const loaded = (manuscriptRows.data ?? []) as Manuscript[];
      setManuscripts(loaded);
      setRuns((runRows.data ?? []) as ResearchRun[]);
      setManuscript(loaded[0] ?? null);
      setDirty(false);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!manuscript?.id) {
      setSuggestions([]); setFindings([]); setDocuments([]); setVersions([]); setSignoffs([]);
      setSimilarityReport(null); setSimilarityMatches([]); setMatchFeedback([]); setExternalScan(null); setExternalConsent(false);
      setLinkedPapers([]); setFullTexts([]); setJournalProfile(null); setCitations([]); setComments([]);
      return;
    }
    let cancelled = false;
    const manuscriptId = manuscript.id;
    (async () => {
      const [suggestionRows, findingRows, documentRows, versionRows, signoffRows, similarityReportRow, similarityMatchRows, feedbackRows, externalScanRows, journalRow, citationRows, commentRows, paperRows, fullTextRows] = await Promise.all([
        supabase.from("writing_suggestions").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("validation_findings").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("manuscript_documents").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("manuscript_versions").select("*").eq("manuscript_id", manuscriptId).order("version_number", { ascending: false }).limit(50),
        supabase.from("author_signoffs").select("*").eq("manuscript_id", manuscriptId),
        supabase.from("similarity_reports").select("*").eq("manuscript_id", manuscriptId).maybeSingle(),
        supabase.from("similarity_matches").select("*").eq("manuscript_id", manuscriptId).order("similarity", { ascending: false }),
        supabase.from("similarity_match_feedback").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("external_similarity_scans").select("*").eq("manuscript_id", manuscriptId).order("requested_at", { ascending: false }).limit(1),
        supabase.from("journal_profiles").select("*").eq("manuscript_id", manuscriptId).maybeSingle(),
        supabase.from("manuscript_citations").select("*").eq("manuscript_id", manuscriptId).order("created_at"),
        supabase.from("manuscript_comments").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        manuscript.research_run_id ? supabase.from("papers").select("*").eq("run_id", manuscript.research_run_id).order("citation_count", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
        manuscript.research_run_id ? supabase.from("paper_fulltexts").select("id,paper_id,run_id,source,source_url,license,word_count,retrieval_status,retrieved_at").eq("run_id", manuscript.research_run_id) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setSuggestions((suggestionRows.data ?? []) as WritingSuggestion[]);
      setFindings((findingRows.data ?? []) as ValidationFinding[]);
      setDocuments((documentRows.data ?? []) as ManuscriptDocument[]);
      setVersions((versionRows.data ?? []) as ManuscriptVersion[]);
      setSignoffs((signoffRows.data ?? []) as AuthorSignoff[]);
      setSimilarityReport((similarityReportRow.data ?? null) as SimilarityReport | null);
      setSimilarityMatches((similarityMatchRows.data ?? []) as SimilarityMatch[]);
      setMatchFeedback((feedbackRows.data ?? []) as SimilarityMatchFeedback[]);
      setExternalScan(((externalScanRows.data ?? [])[0] ?? null) as ExternalSimilarityScan | null);
      setJournalProfile((journalRow.data ?? null) as JournalProfile | null);
      setCitations((citationRows.data ?? []) as ManuscriptCitation[]);
      setComments((commentRows.data ?? []) as ManuscriptComment[]);
      setLinkedPapers((paperRows.data ?? []) as Paper[]);
      setFullTexts((fullTextRows.data ?? []) as PaperFullText[]);
    })();
    return () => { cancelled = true; };
  }, [manuscript?.id, manuscript?.research_run_id]);

  useEffect(() => {
    let cancelled = false;
    if (!manuscript) { setContentHash(""); return; }
    void sha256Text(manuscript.content).then((hash) => { if (!cancelled) setContentHash(hash); });
    return () => { cancelled = true; };
  }, [manuscript?.content]);

  const wordCount = manuscriptWordCount(manuscript?.content ?? "");
  const currentSuggestions = suggestions.filter((item) => !contentHash || item.content_sha256 === contentHash);
  const currentFindings = findings.filter((item) => !contentHash || item.content_sha256 === contentHash);
  const openReviewBlockers = currentFindings.filter((item) => item.status === "open" && (item.severity === "blocking" || item.severity === "human_review"));
  const ownSignoff = signoffs.find((item) => item.profile_id === user?.id && item.approved && item.content_sha256 === contentHash);
  const currentSimilarityReport = similarityReport?.content_sha256 === contentHash ? similarityReport : null;
  const currentSimilarityMatches = currentSimilarityReport ? similarityMatches : [];
  const currentExternalScan = externalScan?.content_sha256 === contentHash ? externalScan : null;
  const isReady = manuscript?.status === "submission_ready";

  const updateManuscript = <K extends keyof Manuscript>(key: K, value: Manuscript[K]) => {
    setManuscript((current) => current ? { ...current, [key]: value } : current);
    setDirty(true);
    setNotice(null);
  };

  const refreshAssets = async (id: string) => {
    const [suggestionRows, findingRows, documentRows, versionRows, signoffRows, similarityReportRow, similarityMatchRows, feedbackRows, externalScanRows, journalRow, citationRows, commentRows, paperRows, fullTextRows] = await Promise.all([
      supabase.from("writing_suggestions").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("validation_findings").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("manuscript_documents").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("manuscript_versions").select("*").eq("manuscript_id", id).order("version_number", { ascending: false }).limit(50),
      supabase.from("author_signoffs").select("*").eq("manuscript_id", id),
      supabase.from("similarity_reports").select("*").eq("manuscript_id", id).maybeSingle(),
      supabase.from("similarity_matches").select("*").eq("manuscript_id", id).order("similarity", { ascending: false }),
      supabase.from("similarity_match_feedback").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("external_similarity_scans").select("*").eq("manuscript_id", id).order("requested_at", { ascending: false }).limit(1),
      supabase.from("journal_profiles").select("*").eq("manuscript_id", id).maybeSingle(),
      supabase.from("manuscript_citations").select("*").eq("manuscript_id", id).order("created_at"),
      supabase.from("manuscript_comments").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      manuscript?.research_run_id ? supabase.from("papers").select("*").eq("run_id", manuscript.research_run_id).order("citation_count", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
      manuscript?.research_run_id ? supabase.from("paper_fulltexts").select("id,paper_id,run_id,source,source_url,license,word_count,retrieval_status,retrieved_at").eq("run_id", manuscript.research_run_id) : Promise.resolve({ data: [] }),
    ]);
    setSuggestions((suggestionRows.data ?? []) as WritingSuggestion[]);
    setFindings((findingRows.data ?? []) as ValidationFinding[]);
    setDocuments((documentRows.data ?? []) as ManuscriptDocument[]);
    setVersions((versionRows.data ?? []) as ManuscriptVersion[]);
    setSignoffs((signoffRows.data ?? []) as AuthorSignoff[]);
    setSimilarityReport((similarityReportRow.data ?? null) as SimilarityReport | null);
    setSimilarityMatches((similarityMatchRows.data ?? []) as SimilarityMatch[]);
    setMatchFeedback((feedbackRows.data ?? []) as SimilarityMatchFeedback[]);
    setExternalScan(((externalScanRows.data ?? [])[0] ?? null) as ExternalSimilarityScan | null);
    setJournalProfile((journalRow.data ?? null) as JournalProfile | null);
    setCitations((citationRows.data ?? []) as ManuscriptCitation[]);
    setComments((commentRows.data ?? []) as ManuscriptComment[]);
    setLinkedPapers((paperRows.data ?? []) as Paper[]);
    setFullTexts((fullTextRows.data ?? []) as PaperFullText[]);
  };

  const createManuscript = async () => {
    if (!user || !projectId || busy) return;
    setBusy("create"); setError(null); setNotice(null);
    const { data, error: createError } = await supabase.from("manuscripts").insert({
      project_id: projectId,
      owner_id: user.id,
      title: "Untitled manuscript",
      writing_mode: "human_authored",
      last_edit_source: "human",
      last_change_summary: "Manuscript created",
    }).select().single();
    if (createError) setError(createError.message);
    else {
      const created = data as Manuscript;
      setManuscripts((items) => [created, ...items]);
      setManuscript(created);
      setDirty(false);
      setTab("write");
      setNotice("Private manuscript created.");
    }
    setBusy(null);
  };

  const persistManuscript = async (source: Manuscript["last_edit_source"] = "human", summary = "Author saved manuscript changes") => {
    if (!manuscript) return null;
    setBusy("save"); setError(null); setNotice(null);
    const { data, error: saveError } = await supabase.from("manuscripts").update({
      title: manuscript.title.trim() || "Untitled manuscript",
      target_journal: manuscript.target_journal.trim(),
      article_type: manuscript.article_type,
      citation_style: manuscript.citation_style,
      writing_mode: manuscript.writing_mode,
      research_run_id: manuscript.research_run_id || null,
      abstract: manuscript.abstract,
      keywords: manuscript.keywords,
      journal_requirements: manuscript.journal_requirements,
      ai_disclosure: manuscript.writing_mode === "ai_assisted" ? manuscript.ai_disclosure : "",
      content: manuscript.content,
      last_edit_source: source,
      last_change_summary: summary,
    }).eq("id", manuscript.id).select().single();
    setBusy(null);
    if (saveError) {
      setError(saveError.message);
      return null;
    }
    const saved = data as Manuscript;
    setManuscript(saved);
    setManuscripts((items) => items.map((item) => item.id === saved.id ? saved : item));
    setDirty(false);
    setNotice("Saved with an immutable provenance version.");
    await refreshAssets(saved.id);
    return saved;
  };

  const selectManuscript = async (id: string) => {
    if (dirty) {
      const saved = await persistManuscript();
      if (!saved) return;
    }
    const selected = manuscripts.find((item) => item.id === id) ?? null;
    setManuscript(selected);
    setDirty(false);
    setError(null);
    setNotice(null);
  };

  const analyzeWriting = async () => {
    if (!manuscript) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("analyze"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("writing-assistant", {
      body: { action: "analyze", manuscript_id: manuscript.id },
    });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "Editorial analysis failed."));
    else {
      setSuggestions((data?.suggestions ?? []) as WritingSuggestion[]);
      setNotice(data?.summary || "Editorial analysis complete.");
    }
    setBusy(null);
  };

  const generateDraft = async () => {
    if (!manuscript) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("draft"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("writing-assistant", {
      body: { action: "draft_from_research", manuscript_id: manuscript.id },
    });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "Draft generation failed."));
    else if (data?.manuscript) {
      const saved = data.manuscript as Manuscript;
      setManuscript(saved);
      setManuscripts((items) => items.map((item) => item.id === saved.id ? saved : item));
      setDirty(false);
      setNotice("Grounded AI-assisted draft created. Review every claim and citation.");
      await refreshAssets(saved.id);
    }
    setBusy(null);
  };

  const applySuggestion = async (suggestion: WritingSuggestion) => {
    if (!manuscript || manuscript.writing_mode !== "ai_assisted" || !suggestion.suggested_text) return;
    if (!manuscript.content.includes(suggestion.original_excerpt)) {
      setError("The source excerpt changed. Run editorial analysis again before applying this suggestion.");
      return;
    }
    const revised = manuscript.content.replace(suggestion.original_excerpt, suggestion.suggested_text);
    const { data, error: saveError } = await supabase.from("manuscripts").update({
      content: revised,
      last_edit_source: "ai_assisted",
      last_change_summary: `Accepted ${labelize(suggestion.category)} suggestion`,
    }).eq("id", manuscript.id).select().single();
    if (saveError) { setError(saveError.message); return; }
    await supabase.from("writing_suggestions").update({ status: "accepted", resolved_at: new Date().toISOString() }).eq("id", suggestion.id);
    setManuscript(data as Manuscript);
    setDirty(false);
    setNotice("Suggestion applied and recorded as an AI-assisted version.");
    await refreshAssets(manuscript.id);
  };

  const dismissSuggestion = async (suggestion: WritingSuggestion) => {
    const { error: updateError } = await supabase.from("writing_suggestions").update({ status: "dismissed", resolved_at: new Date().toISOString() }).eq("id", suggestion.id);
    if (updateError) setError(updateError.message);
    else setSuggestions((items) => items.map((item) => item.id === suggestion.id ? { ...item, status: "dismissed" } : item));
  };

  const applyEditorMarkup = (prefix: string, suffix = prefix, placeholder = "text") => {
    if (!manuscript) return;
    const editor = editorRef.current;
    const start = editor?.selectionStart ?? manuscript.content.length;
    const end = editor?.selectionEnd ?? start;
    const selected = manuscript.content.slice(start, end) || placeholder;
    const next = `${manuscript.content.slice(0, start)}${prefix}${selected}${suffix}${manuscript.content.slice(end)}`;
    updateManuscript("content", next);
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };

  const enrichLinkedRun = async () => {
    if (!manuscript?.research_run_id) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("enrich"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("open-research", {
      body: { action: "enrich_run", run_id: manuscript.research_run_id, include_full_text: true },
    });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "Open-access enrichment failed."));
    else {
      await refreshAssets(manuscript.id);
      setNotice(`Open research enrichment complete: ${data.full_text_available ?? 0} full text, ${data.metadata_only ?? 0} metadata/link-only, ${data.unavailable ?? 0} unavailable or restricted.`);
    }
    setBusy(null);
  };

  const extractJournalRequirements = async () => {
    if (!manuscript) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("journal"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("open-research", {
      body: { action: "extract_journal_profile", manuscript_id: manuscript.id },
    });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "Journal requirement extraction failed."));
    else {
      setJournalProfile(data.profile as JournalProfile);
      setManuscript((current) => current ? { ...current, journal_requirements: data.profile.rules } : current);
      setNotice(`Journal requirements extracted with ${data.profile.evidence?.length ?? 0} source excerpt(s). Review the evidence before relying on them.`);
    }
    setBusy(null);
  };

  const ensureCitation = async (paper: Paper): Promise<{ rows: ManuscriptCitation[]; index: number } | null> => {
    if (!manuscript || !user) return null;
    const existingIndex = citations.findIndex((item) => item.paper_id === paper.id);
    if (existingIndex >= 0) return { rows: citations, index: existingIndex };
    const baseKey = citationKey(paper);
    const key = citations.some((item) => item.citation_key === baseKey) ? `${baseKey}-${citations.length + 1}` : baseKey;
    const { data, error: insertError } = await supabase.from("manuscript_citations").insert({
      manuscript_id: manuscript.id,
      paper_id: paper.id,
      citation_key: key,
      csl_json: paperToCsl(paper),
      created_by: user.id,
    }).select().single();
    if (insertError) { setError(insertError.message); return null; }
    const rows = [...citations, data as ManuscriptCitation];
    setCitations(rows);
    return { rows, index: rows.length - 1 };
  };

  const insertCitation = async (paper: Paper) => {
    if (!manuscript) return;
    setBusy("citation"); setError(null);
    const ensured = await ensureCitation(paper);
    if (ensured) {
      const marker = formatInTextCitation(paper, manuscript.citation_style, ensured.index);
      applyEditorMarkup(marker, "", "");
      setNotice(`Citation ${marker} inserted locally. Save the manuscript to version it.`);
    }
    setBusy(null);
  };

  const removeCitation = async (citation: ManuscriptCitation) => {
    const { error: deleteError } = await supabase.from("manuscript_citations").delete().eq("id", citation.id);
    if (deleteError) setError(deleteError.message);
    else setCitations((items) => items.filter((item) => item.id !== citation.id));
  };

  const appendBibliography = () => {
    if (!manuscript) return;
    const selected = citations.map((citation) => linkedPapers.find((paper) => paper.id === citation.paper_id)).filter(Boolean) as Paper[];
    if (!selected.length) { setError("Add at least one linked paper to the citation library first."); return; }
    const block = `## References\n\n${bibliography(selected, manuscript.citation_style)}`;
    const withoutExisting = manuscript.content.replace(/\n#{1,3}\s+(?:references|bibliography)\s*\n[\s\S]*$/i, "").trimEnd();
    updateManuscript("content", `${withoutExisting}\n\n${block}\n`);
    setNotice("Bibliography generated from the current citation library. Verify journal-specific punctuation before submission.");
    setTab("write");
  };

  const addComment = async () => {
    if (!manuscript || !user || !commentDraft.trim() || !contentHash) return;
    const start = editorRef.current?.selectionStart ?? null;
    const end = editorRef.current?.selectionEnd ?? null;
    const selectedText = start != null && end != null && end > start ? manuscript.content.slice(start, end) : "";
    setBusy("comment"); setError(null);
    const { data, error: insertError } = await supabase.from("manuscript_comments").insert({
      manuscript_id: manuscript.id,
      content_sha256: contentHash,
      selected_text: selectedText,
      start_offset: start,
      end_offset: end,
      body: commentDraft.trim(),
      created_by: user.id,
    }).select().single();
    if (insertError) setError(insertError.message);
    else {
      setComments((items) => [data as ManuscriptComment, ...items]);
      setCommentDraft("");
      setNotice(selectedText ? "Review comment attached to the selected passage." : "Document-level review comment added.");
    }
    setBusy(null);
  };

  const resolveComment = async (comment: ManuscriptComment) => {
    const { error: updateError } = await supabase.from("manuscript_comments").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", comment.id);
    if (updateError) setError(updateError.message);
    else setComments((items) => items.map((item) => item.id === comment.id ? { ...item, status: "resolved", resolved_at: new Date().toISOString() } : item));
  };

  const validateManuscript = async (deterministicOnly = false) => {
    if (!manuscript) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("validate"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("paper-validator", { body: { manuscript_id: manuscript.id, deterministic_only: deterministicOnly } });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "Paper validation failed."));
    else {
      setManuscript(data.manuscript as Manuscript);
      setManuscripts((items) => items.map((item) => item.id === manuscript.id ? data.manuscript as Manuscript : item));
      setFindings((data.findings ?? []) as ValidationFinding[]);
      setSimilarityReport((data.similarity_report ?? null) as SimilarityReport | null);
      setSimilarityMatches((data.similarity_matches ?? []) as SimilarityMatch[]);
      setMatchFeedback([]);
      setTab("validate");
      setNotice(`${deterministicOnly ? "Deterministic" : "Full"} validation and NOVA first-party similarity screening complete.${data.ai_review_cache_hit ? " The previous AI review was safely reused, so no new OpenAI credits were consumed." : ""} Review every match and resolve all human-review items before finalization.`);
    }
    setBusy(null);
  };

  const startExternalScan = async () => {
    if (!manuscript || !externalConsent) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("external-scan"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("external-similarity", {
      body: { action: "start", manuscript_id: manuscript.id, consent: true },
    });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "External similarity scan could not be started."));
    else {
      setExternalScan(data.scan as ExternalSimilarityScan);
      setNotice(data.reused ? "The existing PlagAware scan for this exact manuscript version was reused; no additional credits were consumed." : "PlagAware web similarity scan started. Refresh the result after processing completes.");
    }
    setBusy(null);
  };

  const refreshExternalScan = async () => {
    if (!manuscript || !externalScan) return;
    setBusy("external-status"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("external-similarity", {
      body: { action: "status", manuscript_id: manuscript.id, scan_id: externalScan.id },
    });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "External similarity status could not be refreshed."));
    else {
      setExternalScan(data.scan as ExternalSimilarityScan);
      setNotice(data.scan.status === "completed" ? "PlagAware web similarity report is ready. Review every source in context." : `PlagAware scan status: ${labelize(data.scan.status)}.`);
    }
    setBusy(null);
  };

  const changeCorpusScope = async (scope: CorpusScope) => {
    if (!manuscript || !user || manuscript.owner_id !== user.id || busy) return;
    setBusy("corpus"); setError(null); setNotice(null);
    const { data, error: scopeError } = await supabase.rpc("set_manuscript_corpus_scope", {
      p_manuscript_id: manuscript.id,
      p_scope: scope,
    });
    if (scopeError) setError(scopeError.message);
    else {
      const saved = data as Manuscript;
      setManuscript(saved);
      setManuscripts((items) => items.map((item) => item.id === saved.id ? saved : item));
      setNotice(scope === "shared_opt_in"
        ? "Shared-corpus opt-in recorded. Other NOVA users may receive anonymized passage matches against this manuscript; ownership and full text remain protected."
        : scope === "excluded"
          ? "This manuscript was removed from NOVA's comparison corpus, including its derived fingerprints."
          : "This manuscript is indexed only for your private/project similarity checks.");
    }
    setBusy(null);
  };

  const setMatchVerdict = async (match: SimilarityMatch, verdict: SimilarityMatchFeedback["verdict"]) => {
    if (!manuscript || !user || busy) return;
    setBusy("feedback"); setError(null); setNotice(null);
    const { data, error: feedbackError } = await supabase.from("similarity_match_feedback").upsert({
      match_id: match.id,
      manuscript_id: manuscript.id,
      reviewer_id: user.id,
      verdict,
    }, { onConflict: "match_id,reviewer_id" }).select().single();
    if (feedbackError) setError(feedbackError.message);
    else {
      const saved = data as SimilarityMatchFeedback;
      setMatchFeedback((items) => [saved, ...items.filter((item) => item.id !== saved.id && item.match_id !== saved.match_id)]);
      setNotice("Your review decision was saved as auditable quality feedback for NOVA's matching engine.");
    }
    setBusy(null);
  };

  const resolveFinding = async (finding: ValidationFinding) => {
    const status = finding.severity === "warning" ? "accepted_risk" : "resolved";
    const { error: updateError } = await supabase.rpc("resolve_validation_finding", { p_finding_id: finding.id, p_status: status });
    if (updateError) setError(updateError.message);
    else setFindings((items) => items.map((item) => item.id === finding.id ? { ...item, status, resolved_at: new Date().toISOString() } : item));
  };

  const uploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !manuscript || !user) return;
    setBusy("upload"); setError(null); setNotice(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const mime = file.type || (extension === "md" ? "text/markdown" : extension === "txt" ? "text/plain" : "");
      if (!ACCEPTED_MANUSCRIPT_TYPES.includes(mime)) throw new Error("Upload a PDF, DOCX, TXT or Markdown file.");
      const normalized = file.type ? file : new File([file], file.name, { type: mime });
      const extracted = await extractDocumentText(normalized);
      const safeName = file.name.replace(/[^\p{L}\p{N}._-]/gu, "-");
      const storagePath = `${manuscript.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: storageError } = await supabase.storage.from("manuscripts").upload(storagePath, normalized, { contentType: mime, upsert: false });
      if (storageError) throw storageError;
      const { data, error: rowError } = await supabase.from("manuscript_documents").insert({
        manuscript_id: manuscript.id,
        storage_path: storagePath,
        filename: file.name,
        mime_type: mime,
        size_bytes: file.size,
        kind: uploadKind,
        extracted_text: extracted.text,
        extraction_status: extracted.status,
        metadata: { client_extracted: true },
        created_by: user.id,
      }).select().single();
      if (rowError) {
        await supabase.storage.from("manuscripts").remove([storagePath]);
        throw rowError;
      }
      setDocuments((items) => [data as ManuscriptDocument, ...items]);
      setNotice(`${file.name} uploaded to private manuscript storage.`);
    } catch (uploadError) {
      setError((uploadError as Error).message);
    }
    setBusy(null);
  };

  const deleteDocument = async (document: ManuscriptDocument) => {
    const { error: storageError } = await supabase.storage.from("manuscripts").remove([document.storage_path]);
    if (storageError) { setError(storageError.message); return; }
    const { error: rowError } = await supabase.from("manuscript_documents").delete().eq("id", document.id);
    if (rowError) setError(rowError.message);
    else setDocuments((items) => items.filter((item) => item.id !== document.id));
  };

  const downloadDocument = async (document: ManuscriptDocument) => {
    const { data, error: signedError } = await supabase.storage.from("manuscripts").createSignedUrl(document.storage_path, 60);
    if (signedError) setError(signedError.message);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const loadDocumentIntoEditor = (document: ManuscriptDocument) => {
    if (!document.extracted_text) { setError("No extractable text was found in this document."); return; }
    updateManuscript("content", document.extracted_text);
    if (manuscript) {
      setManuscript((current) => current ? { ...current, last_edit_source: "imported", last_change_summary: `Imported ${document.filename}` } : current);
    }
    setTab("write");
    setNotice("Document text loaded locally. Review it, then Save to create an imported provenance version.");
  };

  const signAuthorAttestation = async () => {
    if (!manuscript || !user || !attested || dirty) return;
    setBusy("signoff"); setError(null);
    const statement = "I reviewed the current manuscript, verified the authorship and source record to the best of my knowledge, disclosed AI assistance where required, and accept responsibility for the submitted work.";
    const { data, error: signoffError } = await supabase.from("author_signoffs").upsert({
      manuscript_id: manuscript.id,
      profile_id: user.id,
      role: "author",
      approved: true,
      statement,
      content_sha256: contentHash,
      approved_at: new Date().toISOString(),
    }, { onConflict: "manuscript_id,profile_id" }).select().single();
    if (signoffError) setError(signoffError.message);
    else {
      setSignoffs((items) => [data as AuthorSignoff, ...items.filter((item) => item.profile_id !== user.id)]);
      setNotice("Author attestation recorded for this exact content version.");
    }
    setBusy(null);
  };

  const finalizeSubmission = async () => {
    if (!manuscript) return;
    setBusy("finalize"); setError(null); setNotice(null);
    const { data, error: rpcError } = await supabase.rpc("finalize_manuscript", { p_manuscript_id: manuscript.id });
    if (rpcError) setError(rpcError.message);
    else {
      const saved = data as Manuscript;
      setManuscript(saved);
      setManuscripts((items) => items.map((item) => item.id === saved.id ? saved : item));
      setNotice("Submission package finalized. This confirms NOVA's workflow gates, not journal acceptance.");
    }
    setBusy(null);
  };

  const runExport = async (type: "docx" | "pdf" | "tex" | "md") => {
    if (!manuscript) return;
    setBusy("export"); setError(null);
    try {
      if (type === "docx") await exportDocx(manuscript);
      if (type === "pdf") await exportPdf(manuscript);
      if (type === "tex") exportLatex(manuscript);
      if (type === "md") exportMarkdown(manuscript);
    } catch (exportError) {
      setError(`Export failed: ${(exportError as Error).message}`);
    }
    setBusy(null);
  };

  const mode = manuscript?.writing_mode ?? "human_authored";
  const versionCount = versions.length;

  return (
    <div className="bg-dotgrid-glow min-h-full">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Writing & Validation Studio"
          title="From working draft to an auditable submission"
          subtitle="Correct grammar, strengthen natural academic voice, validate claims and citations, preserve provenance, and finalize only after human sign-off. NOVA never guarantees journal acceptance or AI-detector outcomes."
          right={manuscript ? <><Chip tone={statusTone(manuscript.status)}>{labelize(manuscript.status)}</Chip><Chip tone="default">{wordCount.toLocaleString()} words</Chip></> : null}
        />

        <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <label className="text-xs text-foreground/55">
            Workspace
            <select className={`${FIELD_CLASS} mt-1`} value={projectId} onChange={(event) => { setProjectId(event.target.value); setManuscript(null); }}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-foreground/55">
            Manuscript
            <select className={`${FIELD_CLASS} mt-1`} value={manuscript?.id ?? ""} onChange={(event) => void selectManuscript(event.target.value)} disabled={!manuscripts.length}>
              {!manuscripts.length ? <option value="">No manuscripts yet</option> : null}
              {manuscripts.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <Button onClick={createManuscript} disabled={!projectId || Boolean(busy)}>
              {busy === "create" ? <Spinner size={15} /> : <Plus size={15} />} New manuscript
            </Button>
          </div>
        </div>

        {error ? <ErrorBanner className="mb-4">{error}</ErrorBanner> : null}
        {notice ? <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"><Check size={16} className="mt-0.5 shrink-0" />{notice}</div> : null}

        {loading ? (
          <div className="glass-panel flex min-h-72 items-center justify-center rounded-3xl"><Spinner size={24} className="text-primary" /></div>
        ) : !manuscript ? (
          <EmptyState icon={PenLine} title="Create your first manuscript" body="Start a private writing workspace, then link a completed research run or upload your own source documents." action={<Button onClick={createManuscript}><Plus size={15} /> New manuscript</Button>} />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="space-y-4 print:hidden">
              <div className="glass-panel rounded-2xl p-3">
                <nav aria-label="Writing workflow" className="space-y-1">
                  {TABS.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.key;
                    return <button key={item.key} onClick={() => setTab(item.key)} className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${active ? "bg-primary/15 text-primary" : "text-foreground/65 hover:bg-border/30 hover:text-foreground"}`}><Icon size={17} /><span className="flex-1">{item.label}</span><ChevronRight size={14} className={active ? "opacity-100" : "opacity-20"} /></button>;
                  })}
                </nav>
              </div>

              <div className="glass-soft rounded-2xl p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground"><LockKeyhole size={15} className="text-primary" /> Private by default</div>
                <p className="text-xs leading-relaxed text-foreground/55">Documents live in a private Supabase bucket. Project access policies protect manuscripts, files, versions and review records.</p>
              </div>

              <div className="glass-soft rounded-2xl p-4">
                <div className="text-xs uppercase tracking-widest text-foreground/45">Provenance</div>
                <div className="mt-2 flex items-center justify-between text-sm"><span>Versions</span><span className="font-mono text-primary">{versionCount}</span></div>
                <div className="mt-1 flex items-center justify-between text-sm"><span>Documents</span><span className="font-mono text-primary">{documents.length}</span></div>
                <div className="mt-1 flex items-center justify-between text-sm"><span>Open findings</span><span className="font-mono text-primary">{currentFindings.filter((item) => item.status === "open").length}</span></div>
                <div className="mt-1 flex items-center justify-between text-sm"><span>Similarity</span><span className="font-mono text-primary">{currentSimilarityReport ? `${currentSimilarityReport.overall_similarity.toFixed(2)}%` : "Not screened"}</span></div>
              </div>
            </aside>

            <main className="min-w-0">
              {tab === "write" ? (
                <div className="space-y-5">
                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <label className="text-xs text-foreground/55 md:col-span-2">Title<input className={`${FIELD_CLASS} mt-1`} value={manuscript.title} onChange={(event) => updateManuscript("title", event.target.value)} /></label>
                      <label className="text-xs text-foreground/55">Target journal<input className={`${FIELD_CLASS} mt-1`} value={manuscript.target_journal} onChange={(event) => updateManuscript("target_journal", event.target.value)} placeholder="Exact journal name" /></label>
                      <label className="text-xs text-foreground/55">Article type<select className={`${FIELD_CLASS} mt-1`} value={manuscript.article_type} onChange={(event) => updateManuscript("article_type", event.target.value)}><option value="research_article">Research article</option><option value="review">Review</option><option value="systematic_review">Systematic review</option><option value="conference_paper">Conference paper</option><option value="short_communication">Short communication</option><option value="thesis_chapter">Thesis chapter</option></select></label>
                      <label className="text-xs text-foreground/55">Citation style<select className={`${FIELD_CLASS} mt-1`} value={manuscript.citation_style} onChange={(event) => updateManuscript("citation_style", event.target.value)}><option value="apa7">APA 7</option><option value="ieee">IEEE</option><option value="vancouver">Vancouver</option><option value="chicago">Chicago</option><option value="harvard">Harvard</option><option value="journal_specific">Journal-specific</option></select></label>
                      <label className="text-xs text-foreground/55 md:col-span-2">Linked completed research run<select className={`${FIELD_CLASS} mt-1`} value={manuscript.research_run_id ?? ""} onChange={(event) => updateManuscript("research_run_id", event.target.value || null)}><option value="">None — independent manuscript</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.query}</option>)}</select></label>
                      <label className="text-xs text-foreground/55">Keywords<input className={`${FIELD_CLASS} mt-1`} value={manuscript.keywords.join(", ")} onChange={(event) => updateManuscript("keywords", event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} placeholder="comma, separated" /></label>
                      <label className="text-xs text-foreground/55 md:col-span-2 xl:col-span-4">Structured abstract<textarea className={`${FIELD_CLASS} mt-1 resize-y`} rows={4} value={manuscript.abstract} onChange={(event) => updateManuscript("abstract", event.target.value)} placeholder="Keep this synchronized with the Abstract section; journal word-limit checks use this field first." /></label>
                    </div>
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-heading text-xl text-foreground">Authorship control</h2>
                        <p className="text-xs text-foreground/50">Choose deliberately; switching modes is recorded with the manuscript metadata.</p>
                      </div>
                      <Chip tone={mode === "human_authored" ? "success" : "violet"}>{MODE_COPY[mode].title}</Chip>
                    </div>
                    <div role="radiogroup" aria-label="Writing mode" className="grid gap-3 md:grid-cols-2">
                      {(Object.keys(MODE_COPY) as WritingMode[]).map((key) => <button key={key} role="radio" aria-checked={mode === key} onClick={() => updateManuscript("writing_mode", key)} className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors ${mode === key ? "border-primary bg-primary/10" : "border-border bg-panel hover:border-primary/40"}`}><div className="font-medium text-foreground">{MODE_COPY[key].title}</div><div className="mt-1 text-xs leading-relaxed text-foreground/55">{MODE_COPY[key].description}</div></button>)}
                    </div>
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6" aria-labelledby="corpus-participation-heading">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 id="corpus-participation-heading" className="font-heading text-xl text-foreground">NOVA corpus participation</h2>
                        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground/50">Controls first-party similarity indexing. Private is the safe default; no PlagAware, Turnitin or other paid plagiarism API is required.</p>
                      </div>
                      <Chip tone={manuscript.corpus_scope === "shared_opt_in" ? "violet" : manuscript.corpus_scope === "excluded" ? "warning" : "success"}>{labelize(manuscript.corpus_scope ?? "private")}</Chip>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      {([
                        { key: "private", title: "Private/project corpus", body: "Indexed for checks available to you and authorized collaborators in this project." },
                        { key: "excluded", title: "Do not index", body: "Remove the manuscript and its derived fingerprints from NOVA's comparison corpus." },
                        { key: "shared_opt_in", title: "Shared corpus opt-in", body: "Allow anonymized passage matching for other NOVA users. Full text is never exposed through the browser." },
                      ] as { key: CorpusScope; title: string; body: string }[]).map((option) => <button key={option.key} type="button" onClick={() => void changeCorpusScope(option.key)} disabled={Boolean(busy) || manuscript.owner_id !== user?.id} className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${manuscript.corpus_scope === option.key ? "border-primary bg-primary/10" : "border-border bg-panel hover:border-primary/40"}`}><div className="font-medium text-foreground">{option.title}</div><div className="mt-1 text-xs leading-relaxed text-foreground/55">{option.body}</div></button>)}
                    </div>
                    {manuscript.owner_id !== user?.id ? <p className="mt-3 text-xs text-warning">Only the manuscript owner can change corpus participation.</p> : null}
                    {manuscript.shared_corpus_consent_at ? <p className="mt-3 text-xs text-foreground/45">Shared-corpus consent recorded {formatDate(manuscript.shared_corpus_consent_at)}. You can opt out at any time.</p> : null}
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div><h2 className="font-heading text-xl text-foreground">Manuscript editor</h2><p className="text-xs text-foreground/50">Markdown headings are supported and preserved in DOCX, PDF and LaTeX exports.</p></div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void persistManuscript(manuscript.last_edit_source === "imported" ? "imported" : "human", manuscript.last_edit_source === "imported" ? manuscript.last_change_summary : "Author saved manuscript changes")} disabled={!dirty || Boolean(busy)}>{busy === "save" ? <Spinner size={14} /> : <Save size={14} />}{dirty ? "Save version" : "Saved"}</Button>
                        <Button variant="secondary" size="sm" onClick={analyzeWriting} disabled={Boolean(busy) || manuscript.content.trim().length < 80}>{busy === "analyze" ? <Spinner size={14} /> : <WandSparkles size={14} />}Analyze writing</Button>
                        {mode === "ai_assisted" ? <Button size="sm" onClick={generateDraft} disabled={Boolean(busy) || !manuscript.research_run_id}>{busy === "draft" ? <Spinner size={14} /> : <Sparkles size={14} />}Draft from research</Button> : null}
                      </div>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-border bg-panel/70 p-2" aria-label="Academic editor toolbar">
                      <Button variant="ghost" size="sm" onClick={() => applyEditorMarkup("## ", "", "Section heading")}><Heading2 size={14} />Heading</Button>
                      <Button variant="ghost" size="sm" onClick={() => applyEditorMarkup("**", "**", "bold text")}><Bold size={14} />Bold</Button>
                      <Button variant="ghost" size="sm" onClick={() => applyEditorMarkup("*", "*", "italic text")}><Italic size={14} />Italic</Button>
                      <Button variant="ghost" size="sm" onClick={() => applyEditorMarkup("> ", "", "quoted evidence")}><Quote size={14} />Quote</Button>
                    </div>
                    <textarea ref={editorRef} aria-label="Manuscript content" value={manuscript.content} onChange={(event) => { updateManuscript("content", event.target.value); setManuscript((current) => current ? { ...current, last_edit_source: "human", last_change_summary: "Author saved manuscript changes" } : current); }} placeholder="# Title\n\n## Abstract\n\nBegin your manuscript…" className="min-h-[560px] w-full resize-y rounded-2xl border border-border bg-[#080d18] px-5 py-4 font-serif text-[15px] leading-7 text-foreground placeholder:text-foreground/25 focus:border-primary focus:outline-2 focus:outline-primary/40" />
                    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-foreground/45"><span>{wordCount.toLocaleString()} words · {manuscript.content.length.toLocaleString()} characters</span><span>{dirty ? "Unsaved local changes" : `Saved ${formatDate(manuscript.updated_at)}`}</span></div>
                    <div className="mt-4 rounded-2xl border border-border bg-panel/60 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground"><MessageSquareText size={15} className="text-primary" />Passage review comment</div>
                      <p className="mt-1 text-xs text-foreground/45">Select text in the editor, then add a comment. Comments are tied to this content hash and remain auditable after later edits.</p>
                      <div className="mt-3 flex gap-2"><input value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} className={FIELD_CLASS} placeholder="Review note or required change…" /><Button size="sm" onClick={() => void addComment()} disabled={!commentDraft.trim() || Boolean(busy)}>{busy === "comment" ? <Spinner size={13} /> : <Plus size={13} />}Add</Button></div>
                    </div>
                  </section>

                  {comments.length ? <section className="glass-panel rounded-3xl p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><h2 className="font-heading text-xl text-foreground">Review comments</h2><Chip tone="default">{comments.filter((item) => item.status === "open").length} open</Chip></div><div className="space-y-3">{comments.slice(0, 30).map((comment) => <article key={comment.id} className={`rounded-2xl border border-border bg-panel p-4 ${comment.status === "resolved" ? "opacity-60" : ""}`}><div className="flex flex-wrap items-center gap-2"><Chip tone={comment.status === "resolved" ? "success" : comment.content_sha256 === contentHash ? "primary" : "warning"}>{comment.status === "resolved" ? "Resolved" : comment.content_sha256 === contentHash ? "Current version" : "Earlier version"}</Chip><span className="ml-auto text-xs text-foreground/35">{formatDate(comment.created_at)}</span></div>{comment.selected_text ? <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-xs italic text-foreground/60">“{comment.selected_text}”</blockquote> : null}<p className="mt-3 text-sm text-foreground/75">{comment.body}</p>{comment.status === "open" ? <Button variant="secondary" size="sm" className="mt-3" onClick={() => void resolveComment(comment)}><Check size={13} />Resolve</Button> : null}</article>)}</div></section> : null}

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-xl text-foreground">Editorial suggestions</h2><p className="text-xs text-foreground/50">Suggestions match the currently saved content hash.</p></div><Chip tone="default">{currentSuggestions.filter((item) => item.status === "open").length} open</Chip></div>
                    {!currentSuggestions.length ? <EmptyState icon={WandSparkles} title="No editorial review yet" body="Save the draft, then run Analyze writing. Human-authored mode returns guidance only; AI-assisted mode can apply conservative replacements." className="py-8" /> : <div className="space-y-3">{currentSuggestions.map((suggestion) => <article key={suggestion.id} className={`rounded-2xl border p-4 ${suggestion.status === "open" ? "border-border bg-panel" : "border-border/50 bg-panel/40 opacity-65"}`}><div className="flex flex-wrap items-center gap-2"><Chip tone={statusTone(suggestion.severity)}>{suggestion.severity}</Chip><Chip tone="default">{labelize(suggestion.category)}</Chip><span className="ml-auto text-xs text-foreground/40">{labelize(suggestion.status)}</span></div>{suggestion.original_excerpt ? <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-sm italic text-foreground/65">“{suggestion.original_excerpt}”</blockquote> : null}<p className="mt-3 text-sm leading-relaxed text-foreground/75">{suggestion.explanation}</p>{suggestion.suggested_text ? <div className="mt-3 rounded-xl bg-success/5 p-3 text-sm text-success/90"><span className="font-medium">Suggested revision:</span> {suggestion.suggested_text}</div> : <div className="mt-3 text-xs text-primary">Guidance only — NOVA will not insert text in Human-authored mode.</div>}{suggestion.status === "open" ? <div className="mt-3 flex gap-2">{mode === "ai_assisted" && suggestion.suggested_text ? <Button size="sm" onClick={() => void applySuggestion(suggestion)}><Check size={13} />Apply with provenance</Button> : null}<Button variant="ghost" size="sm" onClick={() => void dismissSuggestion(suggestion)}><X size={13} />Dismiss</Button></div> : null}</article>)}</div>}
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="mb-4 flex items-center gap-2"><History size={18} className="text-primary" /><h2 className="font-heading text-xl text-foreground">Version history</h2></div>
                    <div className="space-y-2">{versions.slice(0, 12).map((version) => <div key={version.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel px-3 py-2"><span className="font-mono text-xs text-primary">v{version.version_number}</span><Chip tone={version.source.includes("ai") ? "violet" : version.source === "imported" ? "warning" : "default"}>{labelize(version.source)}</Chip><span className="min-w-0 flex-1 truncate text-sm text-foreground/65">{version.change_summary}</span><span className="text-xs text-foreground/35">{formatDate(version.created_at)}</span><Button variant="ghost" size="sm" onClick={() => { updateManuscript("content", version.content); setNotice(`Version ${version.version_number} loaded locally. Save to create a new restoration version.`); }}><ArchiveRestore size={13} />Restore</Button></div>)}</div>
                  </section>
                </div>
              ) : null}

              {tab === "sources" ? (
                <div className="space-y-5">
                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-2xl text-foreground">Open research evidence corpus</h2><p className="mt-1 max-w-3xl text-sm text-foreground/55">Unpaywall resolves lawful open-access locations; OpenAlex enriches metadata and, when licensing permits, machine-readable full text. Restricted content is linked but never copied.</p></div><Button onClick={() => void enrichLinkedRun()} disabled={!manuscript.research_run_id || Boolean(busy)}>{busy === "enrich" ? <Spinner size={14} /> : <RefreshCcw size={14} />}Enrich linked corpus</Button></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-border bg-panel p-3"><div className="font-mono text-xl text-primary">{linkedPapers.length}</div><div className="text-xs text-foreground/45">Linked papers</div></div><div className="rounded-xl border border-border bg-panel p-3"><div className="font-mono text-xl text-success">{fullTexts.length}</div><div className="text-xs text-foreground/45">Open full texts stored</div></div><div className="rounded-xl border border-border bg-panel p-3"><div className="font-mono text-xl text-foreground">{linkedPapers.filter((paper) => paper.full_text_status === "metadata_only").length}</div><div className="text-xs text-foreground/45">OA link / metadata only</div></div></div>
                    {!manuscript.research_run_id ? <p className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">Link a completed research run in the Write tab before enriching sources.</p> : null}
                    {linkedPapers.length ? <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">{linkedPapers.map((paper) => { const citation = citations.find((item) => item.paper_id === paper.id); return <article key={paper.id} className="rounded-2xl border border-border bg-panel p-4"><div className="flex flex-wrap items-start gap-3"><div className="min-w-0 flex-1"><h3 className="text-sm font-medium text-foreground">{paper.title}</h3><p className="mt-1 text-xs text-foreground/45">{paper.authors.slice(0, 4).join(", ") || "Authors unavailable"}{paper.year ? ` · ${paper.year}` : ""}</p><div className="mt-2 flex flex-wrap gap-2"><Chip tone={paper.full_text_status === "available" ? "success" : paper.oa_status && !["unknown", "closed"].includes(paper.oa_status) ? "primary" : "default"}>{paper.full_text_status === "available" ? "Open full text" : paper.oa_status ? `OA: ${paper.oa_status}` : "Not enriched"}</Chip>{paper.full_text_license ? <Chip tone="default">{paper.full_text_license}</Chip> : null}{citation ? <Chip tone="success">In citation library</Chip> : null}</div></div><div className="flex shrink-0 flex-wrap gap-2">{paper.full_text_url || paper.url ? <a href={paper.full_text_url || paper.url || undefined} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg px-3 text-xs text-primary hover:bg-primary/10">Open source</a> : null}<Button variant="secondary" size="sm" onClick={() => void insertCitation(paper)} disabled={Boolean(busy)}><BookPlus size={13} />Insert citation</Button></div></div></article>; })}</div> : null}
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-xl text-foreground">Citation library</h2><p className="mt-1 text-xs text-foreground/50">Structured references from linked paper metadata. NOVA generates APA 7, IEEE, Vancouver, Chicago or Harvard output; journal-specific exceptions still require author review.</p></div><Button variant="secondary" onClick={appendBibliography} disabled={!citations.length}><BookPlus size={14} />Generate bibliography</Button></div>
                    {!citations.length ? <EmptyState icon={BookPlus} title="Citation library is empty" body="Use Insert citation on a linked paper. The source will be stored here and a version-aware marker inserted into the editor." className="mt-4 py-8" /> : <div className="mt-4 space-y-2">{citations.map((citation, index) => { const paper = linkedPapers.find((item) => item.id === citation.paper_id); return <div key={citation.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-panel px-3 py-3"><span className="font-mono text-xs text-primary">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-foreground/70">{paper?.title || String(citation.csl_json.title ?? citation.citation_key)}</span>{paper ? <Button variant="ghost" size="sm" onClick={() => void insertCitation(paper)}>Insert</Button> : null}<Button variant="ghost" size="sm" onClick={() => void removeCitation(citation)}><Trash2 size={13} />Remove</Button></div>; })}</div>}
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-xl text-foreground">Journal requirement profile</h2><p className="mt-1 max-w-2xl text-sm text-foreground/55">Upload the current author guide as “Journal guidelines,” then extract measurable rules with exact source excerpts. The validator applies those rules to the current manuscript.</p></div><Button variant="secondary" onClick={() => void extractJournalRequirements()} disabled={Boolean(busy) || !manuscript.target_journal || !documents.some((item) => item.kind === "guidelines" && item.extraction_status === "complete")}>{busy === "journal" ? <Spinner size={14} /> : <ShieldCheck size={14} />}Extract journal requirements</Button></div>
                    {journalProfile ? <div className="mt-4"><div className="flex flex-wrap gap-2"><Chip tone={journalProfile.status === "confirmed" ? "success" : "warning"}>{labelize(journalProfile.status)}</Chip><Chip tone="default">{journalProfile.journal_name}</Chip><span className="text-xs text-foreground/40">Updated {formatDate(journalProfile.updated_at)}</span></div><div className="mt-4 grid gap-3 md:grid-cols-2">{Object.entries(journalProfile.rules).filter(([, value]) => value !== null && (!Array.isArray(value) || value.length)).map(([key, value]) => <div key={key} className="rounded-xl border border-border bg-panel p-3"><div className="text-xs font-medium text-primary">{labelize(key)}</div><div className="mt-1 text-xs leading-relaxed text-foreground/60">{Array.isArray(value) ? value.join(" · ") : String(value)}</div></div>)}</div>{journalProfile.evidence.length ? <details className="mt-4 rounded-xl border border-border bg-panel p-4"><summary className="cursor-pointer text-sm font-medium text-foreground">Source evidence ({journalProfile.evidence.length})</summary><div className="mt-3 space-y-3">{journalProfile.evidence.map((item, index) => <blockquote key={index} className="border-l-2 border-primary/50 pl-3 text-xs leading-relaxed text-foreground/55"><span className="font-medium text-foreground">{labelize(item.rule)}:</span> “{item.excerpt}”</blockquote>)}</div></details> : null}</div> : <p className="mt-4 rounded-xl border border-border bg-panel/60 p-4 text-xs text-foreground/50">No journal rule profile extracted yet.</p>}
                  </section>

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-2xl text-foreground">Private document workspace</h2><p className="mt-1 max-w-2xl text-sm text-foreground/55">Upload manuscript files, source papers, supplements or journal guidelines. PDF and DOCX text is extracted locally in your browser; the original file and extracted text remain access-controlled.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs text-foreground/55">Document kind<select value={uploadKind} onChange={(event) => setUploadKind(event.target.value as ManuscriptDocument["kind"])} className={`${FIELD_CLASS} mt-1`}><option value="manuscript">Manuscript</option><option value="source">Source paper</option><option value="supplement">Supplement</option><option value="guidelines">Journal guidelines</option><option value="data">Data note</option></select></label><input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={uploadDocument} /><Button onClick={() => fileInputRef.current?.click()} disabled={Boolean(busy)}>{busy === "upload" ? <Spinner size={14} /> : <Upload size={14} />}Upload</Button></div></div>
                    <div className="mt-4 rounded-xl border border-border bg-panel/60 px-4 py-3 text-xs text-foreground/55"><LockKeyhole size={14} className="mr-2 inline text-primary" />PDF, DOCX, TXT and Markdown · maximum 25 MB · private bucket · signed downloads expire after 60 seconds.</div>
                  </section>
                  {!documents.length ? <EmptyState icon={Library} title="No documents uploaded" body="Add your working manuscript, evidence sources, supplementary material or the target journal's author guide." /> : <div className="grid gap-3 lg:grid-cols-2">{documents.map((document) => <article key={document.id} className="glass-panel rounded-2xl p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText size={18} /></div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium text-foreground" title={document.filename}>{document.filename}</h3><div className="mt-1 flex flex-wrap gap-2"><Chip tone="default">{labelize(document.kind)}</Chip><Chip tone={document.extraction_status === "complete" ? "success" : "warning"}>{labelize(document.extraction_status)}</Chip><span className="text-xs text-foreground/35">{(document.size_bytes / 1024 / 1024).toFixed(2)} MB</span></div><p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/50">{document.extracted_text || "No extractable text was found."}</p><div className="mt-3 flex flex-wrap gap-2">{document.kind === "manuscript" ? <Button size="sm" onClick={() => loadDocumentIntoEditor(document)}>Load into editor</Button> : null}<Button variant="ghost" size="sm" onClick={() => void downloadDocument(document)}><Download size={13} />Open original</Button><Button variant="ghost" size="sm" onClick={() => void deleteDocument(document)}><Trash2 size={13} />Remove</Button></div></div></div></article>)}</div>}
                </div>
              ) : null}

              {tab === "validate" ? (
                <div className="space-y-5">
                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-2xl text-foreground">Evidence & submission validation</h2><p className="mt-1 max-w-3xl text-sm text-foreground/55">Checks structure, language, methodology, statistics, ethics, provenance, journal rules and deterministic overlap against NOVA's private/shared corpus, open full text, abstracts and uploaded sources. Repeated AI reviews of unchanged evidence are cached to protect OpenAI credits.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void validateManuscript(true)} disabled={Boolean(busy) || dirty || manuscript.content.trim().length < 500}>{busy === "validate" ? <Spinner size={15} /> : <ScanSearch size={15} />}Free deterministic checks</Button><Button onClick={() => void validateManuscript(false)} disabled={Boolean(busy) || dirty || manuscript.content.trim().length < 500}>{busy === "validate" ? <Spinner size={15} /> : <ShieldCheck size={15} />}{dirty ? "Save before validating" : "Run full validation"}</Button></div></div>
                    <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">NOVA's first-party similarity scan consumes no OpenAI credits and requires no paid plagiarism API. Automated review remains decision support—not a plagiarism verdict, peer review, legal/ethics approval or acceptance guarantee.</div>
                  </section>
                  {currentSimilarityReport ? (
                    <section className="glass-panel rounded-3xl p-5 sm:p-6" aria-labelledby="similarity-heading">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ScanSearch size={21} /></div>
                          <div><h3 id="similarity-heading" className="font-heading text-xl text-foreground">NOVA first-party similarity report</h3><p className="mt-1 max-w-2xl text-sm text-foreground/55">Auditable local passage matching for the exact saved version. References are excluded and no paid external plagiarism API is called.</p></div>
                        </div>
                        <Chip tone={statusTone(currentSimilarityReport.status)}>{labelize(currentSimilarityReport.status)}</Chip>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4"><div className="font-mono text-3xl font-semibold text-primary">{currentSimilarityReport.overall_similarity.toFixed(2)}%</div><div className="mt-1 text-xs uppercase tracking-wider text-foreground/45">Similarity score</div></div>
                        <div className="rounded-2xl border border-border bg-panel p-4"><div className="font-mono text-2xl text-foreground">{currentSimilarityReport.match_count}</div><div className="mt-1 text-xs text-foreground/45">Matched passages</div></div>
                        <div className="rounded-2xl border border-border bg-panel p-4"><div className="font-mono text-2xl text-foreground">{currentSimilarityReport.matched_word_count.toLocaleString()}</div><div className="mt-1 text-xs text-foreground/45">Overlapping screened words</div></div>
                        <div className="rounded-2xl border border-border bg-panel p-4"><div className="font-mono text-2xl text-foreground">{currentSimilarityReport.corpus_scope.sources_compared ?? 0}</div><div className="mt-1 text-xs text-foreground/45">Sources compared · {(currentSimilarityReport.corpus_scope.nova_private_documents ?? 0) + (currentSimilarityReport.corpus_scope.nova_shared_documents ?? 0)} NOVA</div></div>
                      </div>

                      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.65fr)]">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">Section breakdown</h4>
                          <div className="mt-3 space-y-3">
                            {currentSimilarityReport.section_scores.map((section) => <div key={section.section} className="rounded-xl border border-border bg-panel p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-foreground">{section.section}</span><span className="font-mono text-primary">{section.similarity.toFixed(2)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, section.similarity)}%` }} /></div><div className="mt-1 text-[11px] text-foreground/40">{section.matched_words} of {section.total_words} screened words</div></div>)}
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-medium text-foreground">Where overlap was found</h4><span className="text-xs text-foreground/40">Highest match first</span></div>
                          {!currentSimilarityMatches.length ? <EmptyState icon={ScanSearch} title="No overlap found in the available corpus" body="No eligible overlap was detected in NOVA's current private/shared and open-research corpus. Coverage grows as authorized documents are indexed." className="mt-3 py-8" /> : <div className="mt-3 space-y-3">{currentSimilarityMatches.map((match) => {
                            const review = matchFeedback.find((item) => item.match_id === match.id && item.reviewer_id === user?.id);
                            return <article key={match.id} className="rounded-2xl border border-border bg-panel p-4">
                              <div className="flex flex-wrap items-center gap-2"><Chip tone="default">{match.section}</Chip><Chip tone={match.requires_human_review ? "warning" : "primary"}>{labelize(match.classification)}</Chip>{review ? <Chip tone="success">Reviewed · {labelize(review.verdict)}</Chip> : null}<span className="ml-auto font-mono text-sm text-primary">{match.similarity.toFixed(1)}% passage match</span></div>
                              <blockquote className="mt-3 border-l-2 border-warning/60 pl-3 text-sm leading-relaxed text-foreground/75">“{match.manuscript_excerpt}”</blockquote>
                              <div className="mt-3 rounded-xl bg-background/45 p-3"><div className="text-xs font-medium text-foreground">Source: {match.source_title}</div><div className="mt-1 text-[11px] text-foreground/45">{labelize(match.source_type)} · {match.matched_word_count} contiguous shared words</div><div className="mt-2 text-xs leading-relaxed text-foreground/55"><span className="font-medium">Normalized shared phrase:</span> “{match.source_excerpt}”</div>{match.source_reference?.startsWith("http") ? <a href={match.source_reference} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs text-primary hover:underline">Open source reference</a> : match.source_type !== "nova_corpus" && match.source_reference ? <div className="mt-2 break-all text-[11px] text-foreground/35">Reference: {match.source_reference}</div> : null}</div>
                              {match.requires_human_review ? <p className="mt-3 text-xs leading-relaxed text-warning">Human review required: check quotation, citation, permissions and acceptable reuse in context.</p> : null}
                              <div className="mt-3 flex flex-wrap gap-2" aria-label="Similarity match review"><Button variant={review?.verdict === "confirmed_overlap" ? "primary" : "ghost"} size="sm" onClick={() => void setMatchVerdict(match, "confirmed_overlap")} disabled={Boolean(busy)}>Confirm overlap</Button><Button variant={review?.verdict === "needs_citation" ? "primary" : "ghost"} size="sm" onClick={() => void setMatchVerdict(match, "needs_citation")} disabled={Boolean(busy)}>Needs citation</Button><Button variant={review?.verdict === "acceptable_reuse" ? "primary" : "ghost"} size="sm" onClick={() => void setMatchVerdict(match, "acceptable_reuse")} disabled={Boolean(busy)}>Acceptable reuse</Button><Button variant={review?.verdict === "false_positive" ? "primary" : "ghost"} size="sm" onClick={() => void setMatchVerdict(match, "false_positive")} disabled={Boolean(busy)}>False positive</Button></div>
                            </article>;
                          })}</div>}
                        </div>
                      </div>

                      <p className="mt-5 rounded-xl border border-border bg-panel/60 px-4 py-3 text-xs leading-relaxed text-foreground/50">{currentSimilarityReport.disclaimer} Screened {formatDate(currentSimilarityReport.created_at)}.</p>
                    </section>
                  ) : null}
                  {ENABLE_EXTERNAL_PROVIDER ? <section className="glass-panel rounded-3xl p-5 sm:p-6" aria-labelledby="external-similarity-heading">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 text-secondary"><RefreshCcw size={21} /></div>
                        <div><h3 id="external-similarity-heading" className="font-heading text-xl text-foreground">External web similarity</h3><p className="mt-1 max-w-2xl text-sm text-foreground/55">Optional PlagAware screening against its external web corpus. This result stays separate from NOVA's open-research corpus score because coverage and methodology differ.</p></div>
                      </div>
                      {currentExternalScan ? <Chip tone={statusTone(currentExternalScan.status)}>PlagAware · {labelize(currentExternalScan.status)}</Chip> : <Chip tone="default">Not screened</Chip>}
                    </div>

                    <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-panel/70 px-4 py-3 text-xs leading-relaxed text-foreground/60">
                      <input type="checkbox" checked={externalConsent} onChange={(event) => setExternalConsent(event.target.checked)} className="mt-0.5 accent-primary" />
                      <span>I consent to sending the current saved manuscript text, excluding the References/Bibliography section, to PlagAware for third-party similarity screening. Provider credits may be consumed.</span>
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={() => void startExternalScan()} disabled={Boolean(busy) || dirty || !externalConsent || manuscript.content.trim().length < 500}>{busy === "external-scan" ? <Spinner size={14} /> : <ScanSearch size={14} />}{currentExternalScan ? "Reuse current-version scan" : "Start PlagAware scan"}</Button>
                      {externalScan ? <Button variant="secondary" onClick={() => void refreshExternalScan()} disabled={Boolean(busy)}>{busy === "external-status" ? <Spinner size={14} /> : <RefreshCcw size={14} />}Refresh result</Button> : null}
                    </div>
                    {dirty ? <p className="mt-2 text-xs text-warning">Save the manuscript before sending the exact version for external screening.</p> : null}
                    {externalScan && !currentExternalScan ? <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">The available PlagAware result belongs to an earlier manuscript version. Start a new scan only when the current draft is stable to avoid unnecessary credit use.</p> : null}

                    {currentExternalScan ? <div className="mt-5">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-secondary/25 bg-secondary/10 p-4"><div className="font-mono text-3xl font-semibold text-secondary">{currentExternalScan.overall_similarity == null ? "—" : `${currentExternalScan.overall_similarity.toFixed(2)}%`}</div><div className="mt-1 text-xs uppercase tracking-wider text-foreground/45">External web similarity</div></div>
                        <div className="rounded-2xl border border-border bg-panel p-4"><div className="font-mono text-2xl text-foreground">{currentExternalScan.matched_words?.toLocaleString() ?? "—"}</div><div className="mt-1 text-xs text-foreground/45">Provider-matched words</div></div>
                        <div className="rounded-2xl border border-border bg-panel p-4"><div className="font-mono text-2xl text-foreground">{currentExternalScan.sources?.length ?? 0}</div><div className="mt-1 text-xs text-foreground/45">Reported sources</div></div>
                        <div className="rounded-2xl border border-border bg-panel p-4"><div className="font-mono text-2xl text-foreground">{currentExternalScan.credits_used ?? "—"}</div><div className="mt-1 text-xs text-foreground/45">PlagAware ScanCredits</div></div>
                      </div>
                      {currentExternalScan.error_message ? <ErrorBanner>{currentExternalScan.error_message}</ErrorBanner> : null}
                      {currentExternalScan.sources?.length ? <div className="mt-5"><h4 className="text-sm font-medium text-foreground">Provider-reported sources</h4><div className="mt-3 grid gap-3 lg:grid-cols-2">{currentExternalScan.sources.map((source) => <article key={`${source.rank}-${source.url ?? source.title}`} className="rounded-xl border border-border bg-panel p-3"><div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary/10 font-mono text-xs text-secondary">{source.rank}</span><div className="min-w-0"><div className="text-sm font-medium text-foreground">{source.title}</div><div className="mt-1 flex flex-wrap gap-2 text-[11px] text-foreground/45">{source.similarity != null ? <span>{source.similarity.toFixed(2)}% source match</span> : null}{source.matched_words != null ? <span>· {source.matched_words} words</span> : null}</div>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all text-xs text-primary hover:underline">Open matching source</a> : null}</div></div></article>)}</div></div> : null}
                      <div className="mt-4 flex flex-wrap gap-2">{currentExternalScan.report_html_url ? <a href={currentExternalScan.report_html_url} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm"><FileText size={13} />Open detailed report</Button></a> : null}{currentExternalScan.report_pdf_url ? <a href={currentExternalScan.report_pdf_url} target="_blank" rel="noreferrer"><Button variant="secondary" size="sm"><Download size={13} />Open provider PDF</Button></a> : null}</div>
                      <p className="mt-4 rounded-xl border border-border bg-panel/60 px-4 py-3 text-xs leading-relaxed text-foreground/50">{currentExternalScan.disclaimer} Requested {formatDate(currentExternalScan.requested_at)}.</p>
                    </div> : null}
                  </section> : null}
                  {manuscript.readiness?.gates?.length ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{manuscript.readiness.gates.map((gate) => <div key={gate.key} className="glass-soft rounded-2xl p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-foreground">{gate.label}</span><Chip tone={statusTone(gate.status)}>{labelize(gate.status)}</Chip></div><p className="mt-2 text-xs leading-relaxed text-foreground/55">{gate.detail}</p></div>)}</section> : null}
                  {!currentFindings.length ? <EmptyState icon={BookCheck} title="No validation record for this draft" body="Save at least 500 characters, specify the target journal, then run full validation." /> : <section className="space-y-3">{currentFindings.map((finding) => <article key={finding.id} className={`glass-panel rounded-2xl border-l-4 p-4 ${finding.severity === "blocking" ? "border-l-destructive" : finding.severity === "human_review" ? "border-l-secondary" : finding.severity === "warning" ? "border-l-warning" : "border-l-success"}`}><div className="flex flex-wrap items-center gap-2"><Chip tone={statusTone(finding.severity)}>{labelize(finding.severity)}</Chip><Chip tone="default">{labelize(finding.category)}</Chip>{finding.status !== "open" ? <Chip tone="success">{labelize(finding.status)}</Chip> : null}</div><h3 className="mt-3 font-medium text-foreground">{finding.title}</h3><p className="mt-1 text-sm leading-relaxed text-foreground/65">{finding.description}</p>{finding.recommendation ? <p className="mt-2 text-sm leading-relaxed text-primary/80"><span className="font-medium">Action:</span> {finding.recommendation}</p> : null}{finding.status === "open" && finding.severity !== "pass" && finding.severity !== "info" ? <div className="mt-3"><Button variant="secondary" size="sm" onClick={() => void resolveFinding(finding)}>{finding.severity === "warning" ? "Accept documented risk" : "Mark human review resolved"}</Button></div> : null}</article>)}</section>}
                </div>
              ) : null}

              {tab === "submission" ? (
                <div className="space-y-5">
                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2"><BadgeCheck size={22} className={isReady ? "text-success" : "text-foreground/35"} /><h2 className="font-heading text-2xl text-foreground">Submission package</h2></div><p className="max-w-3xl text-sm leading-relaxed text-foreground/55">“Submission ready” means NOVA's documented gates passed for the exact signed version. It does not mean accepted, error-free, plagiarism-cleared or guaranteed human-generated.</p></div><Chip tone={statusTone(manuscript.status)}>{labelize(manuscript.status)}</Chip></div>
                  </section>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <section className="glass-panel rounded-3xl p-5 sm:p-6">
                      <h3 className="font-heading text-xl text-foreground">Readiness checklist</h3>
                      <div className="mt-4 space-y-3">
                        <ReadinessRow label="Current content saved" passed={!dirty} detail={dirty ? "Save the current editor changes." : `SHA-256 ${contentHash.slice(0, 12)}…`} />
                        <ReadinessRow label="Current version validated" passed={Boolean(manuscript.validation_completed_at && manuscript.last_validated_sha256 === contentHash)} detail={manuscript.validation_completed_at ? formatDate(manuscript.validation_completed_at) : "Run full validation."} />
                        <ReadinessRow label="Similarity report matches current content" passed={Boolean(currentSimilarityReport)} detail={currentSimilarityReport ? `${currentSimilarityReport.overall_similarity.toFixed(2)}% local-corpus similarity · ${currentSimilarityReport.match_count} passage(s)` : "Run full validation for this exact saved version."} />
                        <ReadinessRow label="Blocking & human-review items resolved" passed={openReviewBlockers.length === 0 && currentFindings.length > 0} detail={openReviewBlockers.length ? `${openReviewBlockers.length} unresolved item(s).` : currentFindings.length ? "No open blockers." : "No validation record."} />
                        <ReadinessRow label="Author attestation matches content" passed={Boolean(ownSignoff)} detail={ownSignoff ? formatDate(ownSignoff.approved_at ?? ownSignoff.updated_at) : "Sign the exact saved version."} />
                      </div>
                    </section>

                    <section className="glass-panel rounded-3xl p-5 sm:p-6">
                      <h3 className="font-heading text-xl text-foreground">Author accountability</h3>
                      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-panel p-4"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-primary)]" /><span className="text-sm leading-relaxed text-foreground/65">I reviewed this manuscript, verified its authorship and sources to the best of my knowledge, disclosed AI assistance where required, and accept responsibility for the final work.</span></label>
                      <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" onClick={signAuthorAttestation} disabled={!attested || dirty || Boolean(busy)}>{busy === "signoff" ? <Spinner size={14} /> : <UserCheck size={14} />}{ownSignoff ? "Re-sign current version" : "Sign current version"}</Button><Button onClick={finalizeSubmission} disabled={dirty || !ownSignoff || openReviewBlockers.length > 0 || !currentFindings.length || Boolean(busy)}>{busy === "finalize" ? <Spinner size={14} /> : <FileCheck2 size={14} />}Finalize package</Button></div>
                    </section>
                  </div>

                  {mode === "ai_assisted" ? <section className="glass-panel rounded-3xl p-5 sm:p-6"><h3 className="font-heading text-xl text-foreground">AI assistance disclosure</h3><p className="mt-1 text-xs text-foreground/50">Included automatically in DOCX, PDF and Markdown exports.</p><textarea value={manuscript.ai_disclosure} onChange={(event) => updateManuscript("ai_disclosure", event.target.value)} rows={4} className={`${FIELD_CLASS} mt-4 resize-y`} placeholder="Describe how AI assistance was used and how authors verified the output." /></section> : <section className="glass-soft rounded-3xl p-5 sm:p-6"><div className="flex items-center gap-2 text-success"><UserCheck size={18} /><h3 className="font-medium">Human-authored controls active</h3></div><p className="mt-2 text-sm leading-relaxed text-foreground/55">NOVA has not offered insertable replacement prose in this mode. This workflow record supports provenance but does not prove how text created outside NOVA was authored.</p></section>}

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-heading text-xl text-foreground">Professional exports</h3><p className="mt-1 text-sm text-foreground/55">Real DOCX and paginated PDF, plus LaTeX and Markdown. {isReady ? "This version has passed NOVA's submission gates." : "Exports are marked by workflow state as a draft until finalized."}</p></div>{busy === "export" ? <Spinner size={18} className="text-primary" /> : null}</div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Button variant="secondary" onClick={() => void runExport("docx")} disabled={Boolean(busy)}><FileType2 size={15} />DOCX</Button><Button variant="secondary" onClick={() => void runExport("pdf")} disabled={Boolean(busy)}><FileText size={15} />PDF</Button><Button variant="secondary" onClick={() => void runExport("tex")} disabled={Boolean(busy)}><Braces size={15} />LaTeX</Button><Button variant="secondary" onClick={() => void runExport("md")} disabled={Boolean(busy)}><Download size={15} />Markdown</Button></div>
                  </section>
                </div>
              ) : null}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadinessRow({ label, passed, detail }: { label: string; passed: boolean; detail: string }) {
  return <div className="flex items-start gap-3 rounded-xl border border-border bg-panel px-3 py-3"><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${passed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{passed ? <Check size={14} /> : <CircleAlert size={14} />}</span><div><div className="text-sm font-medium text-foreground">{label}</div><div className="text-xs text-foreground/45">{detail}</div></div></div>;
}
