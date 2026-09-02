import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveRestore,
  BadgeCheck,
  BookCheck,
  Braces,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileCheck2,
  FileText,
  FileType2,
  History,
  Library,
  LockKeyhole,
  PenLine,
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
  Manuscript,
  ManuscriptDocument,
  ManuscriptVersion,
  ResearchRun,
  ValidationFinding,
  WritingMode,
  WritingSuggestion,
} from "../lib/types";
import { Button, Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from "../components/ui";

type Tab = "write" | "sources" | "validate" | "submission";
type ProjectOption = { id: string; name: string };
type BusyAction = "create" | "save" | "analyze" | "draft" | "validate" | "upload" | "signoff" | "finalize" | "export" | null;

const FIELD_CLASS = "w-full rounded-xl border border-border bg-panel px-3 py-2 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/40";
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
  if (status === "submission_ready" || status === "pass" || status === "resolved") return "success";
  if (status === "blocking") return "danger";
  if (status === "warning" || status === "needs_revision") return "warning";
  if (status === "human_review") return "violet";
  if (status === "validating") return "primary";
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
      return;
    }
    let cancelled = false;
    const manuscriptId = manuscript.id;
    (async () => {
      const [suggestionRows, findingRows, documentRows, versionRows, signoffRows] = await Promise.all([
        supabase.from("writing_suggestions").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("validation_findings").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("manuscript_documents").select("*").eq("manuscript_id", manuscriptId).order("created_at", { ascending: false }),
        supabase.from("manuscript_versions").select("*").eq("manuscript_id", manuscriptId).order("version_number", { ascending: false }).limit(50),
        supabase.from("author_signoffs").select("*").eq("manuscript_id", manuscriptId),
      ]);
      if (cancelled) return;
      setSuggestions((suggestionRows.data ?? []) as WritingSuggestion[]);
      setFindings((findingRows.data ?? []) as ValidationFinding[]);
      setDocuments((documentRows.data ?? []) as ManuscriptDocument[]);
      setVersions((versionRows.data ?? []) as ManuscriptVersion[]);
      setSignoffs((signoffRows.data ?? []) as AuthorSignoff[]);
    })();
    return () => { cancelled = true; };
  }, [manuscript?.id]);

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
  const isReady = manuscript?.status === "submission_ready";

  const updateManuscript = <K extends keyof Manuscript>(key: K, value: Manuscript[K]) => {
    setManuscript((current) => current ? { ...current, [key]: value } : current);
    setDirty(true);
    setNotice(null);
  };

  const refreshAssets = async (id: string) => {
    const [suggestionRows, findingRows, documentRows, versionRows, signoffRows] = await Promise.all([
      supabase.from("writing_suggestions").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("validation_findings").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("manuscript_documents").select("*").eq("manuscript_id", id).order("created_at", { ascending: false }),
      supabase.from("manuscript_versions").select("*").eq("manuscript_id", id).order("version_number", { ascending: false }).limit(50),
      supabase.from("author_signoffs").select("*").eq("manuscript_id", id),
    ]);
    setSuggestions((suggestionRows.data ?? []) as WritingSuggestion[]);
    setFindings((findingRows.data ?? []) as ValidationFinding[]);
    setDocuments((documentRows.data ?? []) as ManuscriptDocument[]);
    setVersions((versionRows.data ?? []) as ManuscriptVersion[]);
    setSignoffs((signoffRows.data ?? []) as AuthorSignoff[]);
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

  const validateManuscript = async () => {
    if (!manuscript) return;
    if (dirty && !await persistManuscript()) return;
    setBusy("validate"); setError(null); setNotice(null);
    const { data, error: invokeError } = await supabase.functions.invoke("paper-validator", { body: { manuscript_id: manuscript.id } });
    if (invokeError || data?.error) setError(await functionErrorMessage(invokeError, data, "Paper validation failed."));
    else {
      setManuscript(data.manuscript as Manuscript);
      setManuscripts((items) => items.map((item) => item.id === manuscript.id ? data.manuscript as Manuscript : item));
      setFindings((data.findings ?? []) as ValidationFinding[]);
      setTab("validate");
      setNotice("Validation complete. Automated passes are limited checks; resolve every human-review item before finalization.");
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

                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div><h2 className="font-heading text-xl text-foreground">Manuscript editor</h2><p className="text-xs text-foreground/50">Markdown headings are supported and preserved in DOCX, PDF and LaTeX exports.</p></div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void persistManuscript(manuscript.last_edit_source === "imported" ? "imported" : "human", manuscript.last_edit_source === "imported" ? manuscript.last_change_summary : "Author saved manuscript changes")} disabled={!dirty || Boolean(busy)}>{busy === "save" ? <Spinner size={14} /> : <Save size={14} />}{dirty ? "Save version" : "Saved"}</Button>
                        <Button variant="secondary" size="sm" onClick={analyzeWriting} disabled={Boolean(busy) || manuscript.content.trim().length < 80}>{busy === "analyze" ? <Spinner size={14} /> : <WandSparkles size={14} />}Analyze writing</Button>
                        {mode === "ai_assisted" ? <Button size="sm" onClick={generateDraft} disabled={Boolean(busy) || !manuscript.research_run_id}>{busy === "draft" ? <Spinner size={14} /> : <Sparkles size={14} />}Draft from research</Button> : null}
                      </div>
                    </div>
                    <textarea aria-label="Manuscript content" value={manuscript.content} onChange={(event) => { updateManuscript("content", event.target.value); setManuscript((current) => current ? { ...current, last_edit_source: "human", last_change_summary: "Author saved manuscript changes" } : current); }} placeholder="# Title\n\n## Abstract\n\nBegin your manuscript…" className="min-h-[560px] w-full resize-y rounded-2xl border border-border bg-[#080d18] px-5 py-4 font-serif text-[15px] leading-7 text-foreground placeholder:text-foreground/25 focus:border-primary focus:outline-2 focus:outline-primary/40" />
                    <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-foreground/45"><span>{wordCount.toLocaleString()} words · {manuscript.content.length.toLocaleString()} characters</span><span>{dirty ? "Unsaved local changes" : `Saved ${formatDate(manuscript.updated_at)}`}</span></div>
                  </section>

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
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-2xl text-foreground">Private document workspace</h2><p className="mt-1 max-w-2xl text-sm text-foreground/55">Upload manuscript files, source papers, supplements or journal guidelines. PDF and DOCX text is extracted locally in your browser; the original file and extracted text remain access-controlled.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs text-foreground/55">Document kind<select value={uploadKind} onChange={(event) => setUploadKind(event.target.value as ManuscriptDocument["kind"])} className={`${FIELD_CLASS} mt-1`}><option value="manuscript">Manuscript</option><option value="source">Source paper</option><option value="supplement">Supplement</option><option value="guidelines">Journal guidelines</option><option value="data">Data note</option></select></label><input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={uploadDocument} /><Button onClick={() => fileInputRef.current?.click()} disabled={Boolean(busy)}>{busy === "upload" ? <Spinner size={14} /> : <Upload size={14} />}Upload</Button></div></div>
                    <div className="mt-4 rounded-xl border border-border bg-panel/60 px-4 py-3 text-xs text-foreground/55"><LockKeyhole size={14} className="mr-2 inline text-primary" />PDF, DOCX, TXT and Markdown · maximum 25 MB · private bucket · signed downloads expire after 60 seconds.</div>
                  </section>
                  {!documents.length ? <EmptyState icon={Library} title="No documents uploaded" body="Add your working manuscript, evidence sources, supplementary material or the target journal's author guide." /> : <div className="grid gap-3 lg:grid-cols-2">{documents.map((document) => <article key={document.id} className="glass-panel rounded-2xl p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText size={18} /></div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium text-foreground" title={document.filename}>{document.filename}</h3><div className="mt-1 flex flex-wrap gap-2"><Chip tone="default">{labelize(document.kind)}</Chip><Chip tone={document.extraction_status === "complete" ? "success" : "warning"}>{labelize(document.extraction_status)}</Chip><span className="text-xs text-foreground/35">{(document.size_bytes / 1024 / 1024).toFixed(2)} MB</span></div><p className="mt-3 line-clamp-3 text-xs leading-relaxed text-foreground/50">{document.extracted_text || "No extractable text was found."}</p><div className="mt-3 flex flex-wrap gap-2">{document.kind === "manuscript" ? <Button size="sm" onClick={() => loadDocumentIntoEditor(document)}>Load into editor</Button> : null}<Button variant="ghost" size="sm" onClick={() => void downloadDocument(document)}><Download size={13} />Open original</Button><Button variant="ghost" size="sm" onClick={() => void deleteDocument(document)}><Trash2 size={13} />Remove</Button></div></div></div></article>)}</div>}
                </div>
              ) : null}

              {tab === "validate" ? (
                <div className="space-y-5">
                  <section className="glass-panel rounded-3xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-heading text-2xl text-foreground">Evidence & submission validation</h2><p className="mt-1 max-w-3xl text-sm text-foreground/55">Checks structure, language, methodology, statistics, ethics, provenance and journal metadata. DOI records are verified through Crossref and OpenAlex, including available retraction flags.</p></div><Button onClick={validateManuscript} disabled={Boolean(busy) || dirty || manuscript.content.trim().length < 500}>{busy === "validate" ? <Spinner size={15} /> : <ShieldCheck size={15} />}{dirty ? "Save before validating" : "Run full validation"}</Button></div>
                    <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">Automated review is decision support, not peer review, legal/ethics approval, plagiarism certification or a guarantee of acceptance. Human-review findings are intentionally blocking until a qualified person resolves them.</div>
                  </section>
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
