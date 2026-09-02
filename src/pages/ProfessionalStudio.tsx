import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, BookOpenCheck, BrainCircuit, BriefcaseBusiness, CalendarRange,
  GraduationCap, LibraryBig, Network, NotebookPen, RefreshCcw, SearchCheck,
  ShieldCheck, Sparkles, Upload, UserRoundSearch, UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import type {
  LabAnalytics, Manuscript, ProfessionalAction, ProfessionalRole, Profile,
  ResearchProject, ResearchRun, RoleAgentOutput, SupervisionAssignment,
} from "../lib/types";
import { ROLE_LABEL } from "../lib/constants";
import { Button, Chip, EmptyState, ErrorBanner, PageHeader, ScoreBar, Spinner, StatCard } from "../components/ui";
import { extractDocumentText } from "../lib/documentFiles";

type ActionMeta = {
  action: ProfessionalAction;
  label: string;
  description: string;
  icon: LucideIcon;
  requiresRun?: boolean;
  requiresManuscript?: boolean;
  requiresAssignment?: boolean;
  needsText?: boolean;
  professorOnly?: boolean;
};

const ACTIONS: ActionMeta[] = [
  { action: "topic_finder", label: "Research Topic Finder", description: "Feasible, scored topics with skills, evidence gaps and dataset-verification status.", icon: Sparkles },
  { action: "paper_simplifier", label: "Paper Simplifier", description: "Plain-language explanation without inventing unstated methods or results.", icon: LibraryBig, needsText: true },
  { action: "research_roadmap", label: "Research Roadmap", description: "Milestones, deliverables, risks and evidence gates for a defensible project.", icon: CalendarRange },
  { action: "thesis_coach", label: "Thesis Assistant", description: "Research questions, objectives, methodology outline, ethics and evidence gaps.", icon: GraduationCap },
  { action: "professor_discovery", label: "Advanced Discovery", description: "Corpus-grounded emerging signals and research gaps with evidence IDs.", icon: SearchCheck, requiresRun: true, professorOnly: true },
  { action: "literature_intelligence", label: "Literature Intelligence", description: "Clusters, citation leaders, methods and future directions within a selected corpus.", icon: Network, requiresRun: true, professorOnly: true },
  { action: "peer_review", label: "Structured Peer Reviewer", description: "Pre-submission scores, major/minor issues and conservative readiness recommendation.", icon: BookOpenCheck, requiresManuscript: true, professorOnly: true },
  { action: "grant_proposal", label: "Grant Proposal Studio", description: "Work packages, timeline, estimated budget, risks and compliance checks.", icon: BriefcaseBusiness, requiresRun: true, professorOnly: true },
  { action: "collaborator_finder", label: "Collaborator Finder", description: "Candidate authors derived from exact corpus records; identity and contact remain unverified.", icon: UserRoundSearch, requiresRun: true, professorOnly: true },
  { action: "supervision_feedback", label: "Supervision Assistant", description: "Evidence-based progress summary, risks, actions and questions for a student.", icon: UsersRound, requiresAssignment: true, professorOnly: true },
];

const FIELD = "w-full rounded-xl border border-border bg-panel px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/35 focus:border-primary focus:outline-2 focus:outline-primary/40";

function qualityTone(quality: RoleAgentOutput["evidence_quality"]): "success" | "primary" | "warning" {
  if (quality === "verified") return "success";
  if (quality === "grounded") return "primary";
  return "warning";
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ResultValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null || value === "") return <span className="text-foreground/40">Not available</span>;
  if (typeof value === "boolean") return <Chip tone={value ? "success" : "warning"}>{value ? "Yes" : "No"}</Chip>;
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) return <ScoreBar label="Score" value={value} />;
    return <span className="font-mono text-foreground">{value.toLocaleString()}</span>;
  }
  if (typeof value === "string") return <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/75">{value}</p>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-foreground/40">None recorded</span>;
    return <div className="space-y-2">{value.map((item, index) => (
      <div key={index} className={typeof item === "object" ? "rounded-xl border border-border/70 bg-panel/50 p-3" : "flex gap-2 text-sm text-foreground/75"}>
        {typeof item === "object" ? <ResultValue value={item} depth={depth + 1} /> : <><span className="text-primary">•</span><ResultValue value={item} depth={depth + 1} /></>}
      </div>
    ))}</div>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return <div className={depth ? "space-y-3" : "grid gap-4 lg:grid-cols-2"}>{entries.map(([key, item]) => (
    <section key={key} className={depth > 1 ? "" : "rounded-2xl border border-border bg-panel/40 p-4"}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary/80">{labelize(key)}</h4>
      <ResultValue value={item} depth={depth + 1} />
    </section>
  ))}</div>;
}

export function ProfessionalStudio() {
  const { user, profile, refreshProfile } = useAuth();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<SupervisionAssignment[]>([]);
  const [history, setHistory] = useState<RoleAgentOutput[]>([]);
  const [analytics, setAnalytics] = useState<LabAnalytics | null>(null);
  const [selectedAction, setSelectedAction] = useState<ProfessionalAction>("topic_finder");
  const [selectedRun, setSelectedRun] = useState("");
  const [selectedManuscript, setSelectedManuscript] = useState("");
  const [selectedAssignment, setSelectedAssignment] = useState("");
  const [goal, setGoal] = useState("");
  const [text, setText] = useState("");
  const [constraints, setConstraints] = useState("");
  const [fundingProgram, setFundingProgram] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [result, setResult] = useState<RoleAgentOutput | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [profileRole, setProfileRole] = useState<Exclude<ProfessionalRole, "lab_admin">>("student");
  const [fullName, setFullName] = useState("");
  const [institution, setInstitution] = useState("");
  const [department, setDepartment] = useState("");
  const [interests, setInterests] = useState("");
  const [expertise, setExpertise] = useState("developing");

  const [studentId, setStudentId] = useState("");
  const [researchTitle, setResearchTitle] = useState("");
  const [assignmentProgress, setAssignmentProgress] = useState(0);
  const [assignmentSection, setAssignmentSection] = useState("literature");
  const [assignmentStatus, setAssignmentStatus] = useState("in_progress");
  const [assignmentNote, setAssignmentNote] = useState("");
  const paperFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "lab_admin") setProfileRole(profile.role);
    setFullName(profile.full_name || "");
    setInstitution(profile.institution || "");
    setDepartment(profile.department || "");
    setInterests((profile.research_interests || []).join(", "));
    setExpertise(profile.expertise_level || "developing");
  }, [profile]);

  const loadBase = useCallback(async () => {
    if (!user) return;
    const { data: owned } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    const rows = (owned as ResearchProject[]) ?? [];
    setProjects(rows);
    setProjectId((current) => current || rows[0]?.id || "");
  }, [user]);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    const [runResult, manuscriptResult, membershipResult, assignmentResult, outputResult, analyticsResult] = await Promise.all([
      supabase.from("research_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
      supabase.from("manuscripts").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(50),
      supabase.from("project_members").select("profile_id").eq("project_id", projectId),
      supabase.from("supervision_assignments").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
      supabase.from("role_agent_outputs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30),
      supabase.rpc("get_lab_analytics", { p_project_id: projectId }),
    ]);
    const loadedRuns = (runResult.data as ResearchRun[]) ?? [];
    const loadedManuscripts = (manuscriptResult.data as Manuscript[]) ?? [];
    const loadedAssignments = (assignmentResult.data as SupervisionAssignment[]) ?? [];
    setRuns(loadedRuns);
    setManuscripts(loadedManuscripts);
    setAssignments(loadedAssignments);
    setHistory((outputResult.data as RoleAgentOutput[]) ?? []);
    setAnalytics((analyticsResult.data as LabAnalytics | null) ?? null);
    setSelectedRun((current) => current || loadedRuns.find((run) => run.status === "completed")?.id || loadedRuns[0]?.id || "");
    setSelectedManuscript((current) => current || loadedManuscripts[0]?.id || "");
    setSelectedAssignment((current) => current || loadedAssignments[0]?.id || "");

    const ids = new Set<string>((membershipResult.data ?? []).map((row: any) => row.profile_id));
    const project = projects.find((item) => item.id === projectId);
    if (project) ids.add(project.owner_id);
    if (ids.size) {
      const { data } = await supabase.from("profiles").select("*").in("id", [...ids]);
      setMembers((data as Profile[]) ?? []);
    } else setMembers([]);
  }, [projectId, projects]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadProject(); }, [loadProject]);

  const professor = profile?.role === "professor" || profile?.role === "lab_admin";
  const availableActions = useMemo(() => ACTIONS.filter((item) => professor || !item.professorOnly), [professor]);
  useEffect(() => {
    if (!availableActions.some((item) => item.action === selectedAction)) setSelectedAction(availableActions[0]?.action ?? "topic_finder");
  }, [availableActions, selectedAction]);
  const actionMeta = ACTIONS.find((item) => item.action === selectedAction)!;
  const ActionIcon = actionMeta.icon;
  const selectedProject = projects.find((project) => project.id === projectId);
  const ownsProject = selectedProject?.owner_id === user?.id;

  const saveProfile = async () => {
    setBusy("profile"); setError(null);
    const { error: rpcError } = await supabase.rpc("set_own_professional_profile", {
      p_role: profileRole, p_full_name: fullName, p_institution: institution,
      p_department: department, p_research_interests: interests.split(",").map((item) => item.trim()).filter(Boolean),
      p_expertise_level: expertise,
    });
    setBusy(null);
    if (rpcError) { setError(rpcError.message); return; }
    await refreshProfile();
  };

  const runAction = async () => {
    if (!projectId) return;
    setBusy("agent"); setError(null); setResult(null);
    const payload = {
      action: selectedAction, project_id: projectId,
      run_id: actionMeta.requiresRun ? selectedRun || undefined : selectedRun || undefined,
      manuscript_id: actionMeta.requiresManuscript ? selectedManuscript || undefined : undefined,
      assignment_id: actionMeta.requiresAssignment ? selectedAssignment || undefined : undefined,
      goal, text: actionMeta.needsText ? text : undefined, constraints,
      funding_program: selectedAction === "grant_proposal" ? fundingProgram : undefined,
      currency: selectedAction === "grant_proposal" ? currency : undefined,
    };
    const { data, error: invokeError } = await supabase.functions.invoke("professional-agent", { body: payload });
    setBusy(null);
    if (invokeError || data?.error) { setError(data?.error || invokeError?.message || "Professional workflow failed"); return; }
    setResult(data.record as RoleAgentOutput);
    await loadProject();
  };

  const createAssignment = async () => {
    if (!projectId || !studentId || !researchTitle.trim() || !user) return;
    setBusy("assignment"); setError(null);
    const { error: insertError } = await supabase.from("supervision_assignments").insert({
      project_id: projectId, student_id: studentId, supervisor_id: user.id,
      research_title: researchTitle.trim(), status: "active", progress: 0,
    });
    setBusy(null);
    if (insertError) { setError(insertError.message); return; }
    setResearchTitle(""); setStudentId(""); await loadProject();
  };

  const addUpdate = async () => {
    if (!selectedAssignment || !user || !assignmentNote.trim()) return;
    setBusy("update"); setError(null);
    const { error: insertError } = await supabase.from("supervision_updates").insert({
      assignment_id: selectedAssignment, author_id: user.id, section: assignmentSection,
      status: assignmentStatus, progress: assignmentProgress, note: assignmentNote.trim(),
    });
    if (!insertError) {
      const assignment = assignments.find((item) => item.id === selectedAssignment);
      if (assignment && (assignment.supervisor_id === user.id || ownsProject)) {
        await supabase.from("supervision_assignments").update({ progress: assignmentProgress }).eq("id", selectedAssignment);
      }
    }
    setBusy(null);
    if (insertError) { setError(insertError.message); return; }
    setAssignmentNote(""); await loadProject();
  };

  const loadPaperFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy("paper-file"); setError(null);
    try {
      const extracted = await extractDocumentText(file);
      if (extracted.text.trim().length < 120) throw new Error("The uploaded file did not contain enough extractable text.");
      setText(extracted.text.slice(0, 80_000));
    } catch (fileError) {
      setError((fileError as Error).message);
    } finally {
      setBusy(null);
      if (paperFileRef.current) paperFileRef.current.value = "";
    }
  };

  const students = members.filter((member) => member.role === "student");

  return (
    <div className="bg-dotgrid-glow min-h-full">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
        <PageHeader
          eyebrow="Professional University Workspace"
          title={`${ROLE_LABEL[profile?.role ?? "student"] ?? "Researcher"} Studio`}
          subtitle="Role-aware research guidance, supervision, peer review and institutional intelligence. Outputs preserve evidence scope and never certify publication acceptance or AI-detector outcomes."
          right={projects.length > 1 ? <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className={`${FIELD} min-w-56`}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select> : undefined}
        />

        {error ? <ErrorBanner className="mb-5">{error}</ErrorBanner> : null}

        {!profile?.onboarding_completed ? (
          <section className="glass-panel mb-6 rounded-3xl border-primary/30 p-6">
            <div className="flex items-center gap-3"><GraduationCap className="text-primary" /><div><h2 className="font-heading text-xl">Complete your professional profile</h2><p className="text-sm text-foreground/55">This controls the tools, depth and terminology NOVA uses.</p></div></div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-foreground/60">Role<select value={profileRole} onChange={(event) => setProfileRole(event.target.value as Exclude<ProfessionalRole, "lab_admin">)} className={`${FIELD} mt-1`}><option value="student">Student</option><option value="professor">Professor / Supervisor</option><option value="research_assistant">Research Assistant</option></select></label>
              <label className="text-xs text-foreground/60">Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} className={`${FIELD} mt-1`} /></label>
              <label className="text-xs text-foreground/60">Institution<input value={institution} onChange={(event) => setInstitution(event.target.value)} className={`${FIELD} mt-1`} /></label>
              <label className="text-xs text-foreground/60">Department<input value={department} onChange={(event) => setDepartment(event.target.value)} className={`${FIELD} mt-1`} /></label>
              <label className="text-xs text-foreground/60">Research interests<input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="AI safety, oncology, causal inference" className={`${FIELD} mt-1`} /></label>
              <label className="text-xs text-foreground/60">Expertise<select value={expertise} onChange={(event) => setExpertise(event.target.value)} className={`${FIELD} mt-1`}><option value="developing">Developing</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="expert">Expert</option></select></label>
            </div>
            <Button className="mt-4" onClick={() => void saveProfile()} disabled={Boolean(busy)}>{busy === "profile" ? <Spinner size={15} /> : <ShieldCheck size={15} />}Save professional profile</Button>
          </section>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="glass-soft h-fit rounded-3xl p-3">
            <div className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-widest text-foreground/45">Role-based agents</div>
            <div className="space-y-1">{availableActions.map((item) => { const Icon = item.icon; const active = item.action === selectedAction; return <button key={item.action} onClick={() => { setSelectedAction(item.action); setResult(null); setError(null); }} className={`w-full cursor-pointer rounded-2xl p-3 text-left transition-colors ${active ? "bg-primary/15 text-primary" : "text-foreground/70 hover:bg-border/30 hover:text-foreground"}`}><span className="flex items-start gap-3"><Icon size={18} className="mt-0.5 shrink-0" /><span><span className="block text-sm font-medium">{item.label}</span><span className={`mt-0.5 block text-[11px] leading-snug ${active ? "text-primary/65" : "text-foreground/40"}`}>{item.description}</span></span></span></button>; })}</div>
          </aside>

          <main className="space-y-5">
            <section className="glass-panel rounded-3xl p-5 sm:p-6">
              <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ActionIcon size={21} /></div><div><h2 className="font-heading text-2xl">{actionMeta.label}</h2><p className="mt-1 text-sm text-foreground/55">{actionMeta.description}</p></div></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {actionMeta.requiresRun ? <label className="text-xs text-foreground/60">Evidence corpus<select value={selectedRun} onChange={(event) => setSelectedRun(event.target.value)} className={`${FIELD} mt-1`}><option value="">Select a completed run</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.query.slice(0, 90)} · {run.status}</option>)}</select></label> : null}
                {actionMeta.requiresManuscript ? <label className="text-xs text-foreground/60">Manuscript<select value={selectedManuscript} onChange={(event) => setSelectedManuscript(event.target.value)} className={`${FIELD} mt-1`}><option value="">Select manuscript</option>{manuscripts.map((manuscript) => <option key={manuscript.id} value={manuscript.id}>{manuscript.title} · {manuscript.status}</option>)}</select></label> : null}
                {actionMeta.requiresAssignment ? <label className="text-xs text-foreground/60">Student assignment<select value={selectedAssignment} onChange={(event) => setSelectedAssignment(event.target.value)} className={`${FIELD} mt-1`}><option value="">Select assignment</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.research_title} · {assignment.progress}%</option>)}</select></label> : null}
                {selectedAction === "grant_proposal" ? <><label className="text-xs text-foreground/60">Funding programme<input value={fundingProgram} onChange={(event) => setFundingProgram(event.target.value)} placeholder="Programme and call name" className={`${FIELD} mt-1`} /></label><label className="text-xs text-foreground/60">Budget currency<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={6} className={`${FIELD} mt-1`} /></label></> : null}
              </div>
              {actionMeta.needsText ? <div className="mt-4"><div className="mb-1 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-foreground/60">Paper title, abstract or relevant excerpt</span><><input ref={paperFileRef} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" className="hidden" onChange={(event) => void loadPaperFile(event.target.files?.[0])} /><Button variant="secondary" size="sm" onClick={() => paperFileRef.current?.click()} disabled={busy === "paper-file"}>{busy === "paper-file" ? <Spinner size={13} /> : <Upload size={13} />}Upload PDF/DOCX</Button></></div><textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder="Upload a PDF/DOCX or paste the paper abstract or a substantial excerpt…" className={`${FIELD} resize-y`} /><p className="mt-1 text-[11px] text-foreground/40">Text is extracted locally in your browser; the professional agent receives at most 80,000 characters.</p></div> : null}
              {!actionMeta.needsText && !actionMeta.requiresAssignment ? <label className="mt-4 block text-xs text-foreground/60">Goal or research question<textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} placeholder="Describe the field, problem, learner level and desired outcome…" className={`${FIELD} mt-1 resize-y`} /></label> : null}
              <label className="mt-4 block text-xs text-foreground/60">Constraints and context (optional)<textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} rows={3} placeholder="Time, skills, population, geography, methods, journal or institutional constraints…" className={`${FIELD} mt-1 resize-y`} /></label>
              <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={() => void runAction()} disabled={busy === "agent"}>{busy === "agent" ? <Spinner size={15} /> : <BrainCircuit size={15} />}Run professional analysis</Button><span className="text-xs text-foreground/45"><ShieldCheck size={13} className="mr-1 inline text-success" />Results are persisted with evidence scope and provenance.</span></div>
            </section>

            {result ? <section className="glass-panel rounded-3xl p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs uppercase tracking-widest text-primary">Latest professional output</div><h2 className="mt-1 font-heading text-2xl">{result.title}</h2></div><Chip tone={qualityTone(result.evidence_quality)}>{labelize(result.evidence_quality)}</Chip></div><ResultValue value={result.output_json} /></section> : null}
          </main>
        </div>

        <section className="mt-8 glass-panel rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-xs uppercase tracking-widest text-secondary">Supervision center</div><h2 className="mt-1 font-heading text-2xl">Student progress and human feedback</h2><p className="mt-1 text-sm text-foreground/55">Recorded milestones drive the AI summary; unreported progress is never inferred.</p></div><Button variant="secondary" size="sm" onClick={() => void loadProject()}><RefreshCcw size={14} />Refresh</Button></div>
          {professor && ownsProject ? <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-panel/50 p-4 md:grid-cols-[1fr_2fr_auto]"><select value={studentId} onChange={(event) => setStudentId(event.target.value)} className={FIELD}><option value="">Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.full_name || student.id}</option>)}</select><input value={researchTitle} onChange={(event) => setResearchTitle(event.target.value)} placeholder="Research title or supervision objective" className={FIELD} /><Button onClick={() => void createAssignment()} disabled={busy === "assignment" || !studentId || !researchTitle.trim()}>{busy === "assignment" ? <Spinner size={14} /> : <UsersRound size={14} />}Assign</Button></div> : null}
          {!assignments.length ? <EmptyState className="mt-5" icon={UsersRound} title="No supervision assignments" body={ownsProject ? "Invite a student to the project, then create their supervision record." : "The project owner can create supervision assignments."} /> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{assignments.map((assignment) => { const student = members.find((member) => member.id === assignment.student_id); return <article key={assignment.id} className={`rounded-2xl border p-4 ${selectedAssignment === assignment.id ? "border-primary/50 bg-primary/5" : "border-border bg-panel/40"}`}><button className="w-full cursor-pointer text-left" onClick={() => setSelectedAssignment(assignment.id)}><div className="flex items-center justify-between gap-3"><Chip tone={assignment.status === "completed" ? "success" : assignment.status === "on_hold" ? "warning" : "primary"}>{labelize(assignment.status)}</Chip><span className="font-mono text-sm text-primary">{assignment.progress}%</span></div><h3 className="mt-3 font-heading text-lg">{assignment.research_title}</h3><p className="text-sm text-foreground/50">{student?.full_name || "Student"}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-border/50"><div className="h-full rounded-full bg-primary" style={{ width: `${assignment.progress}%` }} /></div>{assignment.risk_summary ? <p className="mt-3 text-xs text-warning">Risk: {assignment.risk_summary}</p> : null}{assignment.next_milestone ? <p className="mt-2 text-xs text-foreground/55">Next: {assignment.next_milestone}</p> : null}</button></article>; })}</div>}
          {selectedAssignment ? <div className="mt-5 grid gap-3 rounded-2xl border border-border bg-panel/50 p-4 md:grid-cols-4"><select value={assignmentSection} onChange={(event) => setAssignmentSection(event.target.value)} className={FIELD}>{["topic","proposal","literature","methodology","data","analysis","writing","submission"].map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select><select value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)} className={FIELD}>{["not_started","in_progress","needs_review","approved","blocked"].map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select><label className="text-xs text-foreground/55">Progress {assignmentProgress}%<input type="range" min="0" max="100" value={assignmentProgress} onChange={(event) => setAssignmentProgress(Number(event.target.value))} className="mt-2 w-full accent-primary" /></label><div className="md:col-span-3"><textarea value={assignmentNote} onChange={(event) => setAssignmentNote(event.target.value)} rows={3} placeholder="Evidence, feedback, decision or blocker…" className={`${FIELD} resize-y`} /></div><Button onClick={() => void addUpdate()} disabled={busy === "update" || !assignmentNote.trim()}>{busy === "update" ? <Spinner size={14} /> : <NotebookPen size={14} />}Record update</Button></div> : null}
        </section>

        {professor && analytics ? <section className="mt-8"><div className="mb-4 flex items-center gap-2"><BarChart3 size={20} className="text-secondary" /><h2 className="font-heading text-xl">Research Lab Analytics</h2><Chip tone="primary">Live project data</Chip></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="Members" value={analytics.members} sub={`${analytics.supervised_students} supervised students`} icon={UsersRound} /><StatCard label="Research corpus" value={analytics.papers} sub={`${analytics.completed_runs} completed runs`} icon={LibraryBig} /><StatCard label="Manuscripts" value={analytics.manuscripts} sub={`${analytics.submission_ready} submission-ready`} icon={BookOpenCheck} /><StatCard label="Student progress" value={`${analytics.average_student_progress}%`} sub={`${analytics.open_risks} open risks`} icon={BarChart3} /></div></section> : null}

        <section className="mt-8"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-heading text-xl">Professional output history</h2><p className="text-xs text-foreground/45">Auditable records for this project.</p></div></div>{!history.length ? <EmptyState icon={ShieldCheck} title="No professional outputs yet" body="Run a role-based agent above; its evidence scope and result will be stored here." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{history.map((item) => <button key={item.id} onClick={() => { setResult(item); setSelectedAction(item.action); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="glass-soft cursor-pointer rounded-2xl p-4 text-left hover:border-primary/40"><div className="flex items-center justify-between gap-2"><Chip tone="default">{labelize(item.action)}</Chip><Chip tone={qualityTone(item.evidence_quality)}>{labelize(item.evidence_quality)}</Chip></div><h3 className="mt-3 line-clamp-2 font-heading text-base">{item.title}</h3><p className="mt-2 text-xs text-foreground/40">{new Date(item.created_at).toLocaleString()}</p></button>)}</div>}</section>
      </div>
    </div>
  );
}
