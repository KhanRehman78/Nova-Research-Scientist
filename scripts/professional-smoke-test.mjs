import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const professor = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const student = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Nova-${crypto.randomUUID()}-9!`;
let professorId;
let studentId;

const check = (condition, message, detail) => {
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
};

const invoke = async (client, action, body) => {
  const started = Date.now();
  const { data, error } = await client.functions.invoke("professional-agent", { body: { action, ...body } });
  let detail = data?.detail || data?.error || error?.message;
  if (error?.context && typeof error.context.json === "function") {
    try { const payload = await error.context.json(); detail = payload?.detail || payload?.error || detail; } catch { /* retain message */ }
  }
  if (error || data?.error) throw new Error(`${action} failed: ${detail}`);
  console.log(JSON.stringify({ action, seconds: Number(((Date.now() - started) / 1000).toFixed(1)), evidence_quality: data.record?.evidence_quality }));
  return data;
};

try {
  const professorEmail = `nova-professor-${suffix}@example.com`;
  const studentEmail = `nova-student-${suffix}@example.com`;
  const [createdProfessor, createdStudent] = await Promise.all([
    admin.auth.admin.createUser({ email: professorEmail, password, email_confirm: true, user_metadata: { full_name: "Professor Smoke", role: "professor" } }),
    admin.auth.admin.createUser({ email: studentEmail, password, email_confirm: true, user_metadata: { full_name: "Student Smoke", role: "student" } }),
  ]);
  check(createdProfessor.data.user && !createdProfessor.error, "Could not create professor", createdProfessor.error?.message);
  check(createdStudent.data.user && !createdStudent.error, "Could not create student", createdStudent.error?.message);
  professorId = createdProfessor.data.user.id;
  studentId = createdStudent.data.user.id;

  const { error: verifyProfessorError } = await admin.rpc("set_verified_professional_role", {
    p_profile_id: professorId,
    p_role: "professor",
  });
  check(!verifyProfessorError, "Could not verify professor role", verifyProfessorError?.message);
  const { data: verifiedProfile, error: verifiedProfileError } = await admin
    .from("profiles")
    .select("role, privileged_role_verified")
    .eq("id", professorId)
    .single();
  check(
    verifiedProfile?.role === "professor" && verifiedProfile?.privileged_role_verified && !verifiedProfileError,
    "Professor verification did not persist",
    verifiedProfileError?.message ?? JSON.stringify(verifiedProfile),
  );

  const [professorSignIn, studentSignIn] = await Promise.all([
    professor.auth.signInWithPassword({ email: professorEmail, password }),
    student.auth.signInWithPassword({ email: studentEmail, password }),
  ]);
  check(!professorSignIn.error, "Professor sign-in failed", professorSignIn.error?.message);
  check(!studentSignIn.error, "Student sign-in failed", studentSignIn.error?.message);
  check(professorSignIn.data.user?.id === professorId, "Professor client received the wrong session");
  check(studentSignIn.data.user?.id === studentId, "Student client received the wrong session");

  const { data: profiled, error: profileError } = await professor.rpc("set_own_professional_profile", {
    p_role: "professor", p_full_name: "Professor Smoke", p_institution: "NOVA Test University",
    p_department: "Research Methods", p_research_interests: ["clinical AI", "reproducibility"], p_expertise_level: "expert",
  });
  check(profiled?.role === "professor" && !profileError, "Professional profile RPC failed", profileError?.message);
  const { error: forbiddenAdmin } = await student.rpc("set_own_professional_profile", {
    p_role: "lab_admin", p_full_name: "Student Smoke", p_institution: "NOVA Test University",
    p_department: "Research Methods", p_research_interests: [], p_expertise_level: "developing",
  });
  check(Boolean(forbiddenAdmin), "Student could self-assign lab_admin");

  const projectId = crypto.randomUUID();
  const { error: projectError } = await professor.from("projects").insert({ id: projectId, name: "Professional Flow E2E", description: "Temporary automated verification", owner_id: professorId });
  check(!projectError, "Project creation failed", projectError?.message);
  const { error: memberError } = await professor.from("project_members").insert({ project_id: projectId, profile_id: studentId, role: "student" });
  check(!memberError, "Student membership failed", memberError?.message);

  const { data: assignment, error: assignmentError } = await professor.from("supervision_assignments").insert({
    project_id: projectId, student_id: studentId, supervisor_id: professorId,
    research_title: "Transparent validation of clinical prediction systems", progress: 15,
  }).select().single();
  check(assignment && !assignmentError, "Supervision assignment failed", assignmentError?.message);
  const { error: updateError } = await student.from("supervision_updates").insert({
    assignment_id: assignment.id, author_id: studentId, section: "literature", status: "needs_review",
    progress: 25, note: "Completed the initial search protocol and recorded inclusion criteria.",
  });
  check(!updateError, "Student progress update failed", updateError?.message);

  const runId = crypto.randomUUID();
  const { error: runError } = await professor.from("research_runs").insert({
    id: runId, project_id: projectId, user_id: professorId, query: "transparent clinical AI validation",
    mode: "quick", status: "completed", current_stage: "report", started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
  });
  check(!runError, "Evidence run failed", runError?.message);
  const { data: evidencePapers, error: papersError } = await professor.from("papers").insert([
    { run_id: runId, source: "crossref", source_id: "10.1000/nova-a", title: "Transparent clinical prediction evaluation", authors: ["A. Researcher", "B. Scientist"], year: 2025, citation_count: 18, abstract: "A structured evaluation framework for clinical prediction models." },
    { run_id: runId, source: "openalex", source_id: "W-NOVA-B", title: "Reproducible reporting for medical artificial intelligence", authors: ["A. Researcher", "C. Methodologist"], year: 2024, citation_count: 11, abstract: "A reporting framework emphasizing reproducibility and subgroup evaluation." },
  ]).select();
  check(!papersError, "Evidence papers failed", papersError?.message);
  const { error: matrixError } = await professor.from("literature_matrix").insert([
    { run_id: runId, paper_id: evidencePapers[0].id, method: "Structured evaluation framework", dataset: "Not stated", result: "Proposes transparent evaluation", problem: "Opaque clinical model assessment" },
    { run_id: runId, paper_id: evidencePapers[1].id, method: "Reporting framework", dataset: "Not stated", result: "Defines reproducibility requirements", problem: "Incomplete reporting and subgroup evaluation" },
  ]);
  check(!matrixError, "Literature evidence failed", matrixError?.message);
  const supportingResults = await Promise.all([
    professor.from("gaps").insert({ run_id: runId, title: "Independent subgroup validation", statement: "Retrieved sources do not establish a shared protocol for independent subgroup validation.", existing_coverage: "Reporting and transparency frameworks", opportunity: "A pre-registered, evidence-linked evaluation protocol", gap_map_json: { clusters: [], missing_topics: ["external validation"] } }),
    professor.from("hypotheses").insert({ run_id: runId, title: "Transparent validation protocol", hypothesis: "A pre-registered evaluation protocol will reveal performance variation hidden by aggregate metrics.", objectives: ["Define protocol", "Measure subgroup calibration"], expected_contribution: "A reproducible evaluation workflow", confidence: 0.55, novelty: 0.52 }),
    professor.from("experiments").insert({ run_id: runId, dataset: "A public, independently verified clinical benchmark", algorithm: "Comparative evaluation", architecture_json: { layers: [] }, metrics_json: { metrics: ["AUROC", "calibration error", "subgroup disparity"] } }),
    professor.from("reports").insert({ run_id: runId, title: "Transparent clinical prediction evaluation", abstract: "A proposed protocol for transparent evaluation.", sections_json: { sections: [{ heading: "Methods", body: "Pre-register evaluation and report calibration with uncertainty." }] } }),
  ]);
  check(!supportingResults.some((item) => item.error), "Supporting research outputs failed", supportingResults.find((item) => item.error)?.error?.message);

  const manuscriptContent = `# Transparent clinical prediction evaluation\n\n## Abstract\nThis protocol proposes transparent evaluation and does not claim completed experiments.\n\n## Introduction\nClinical prediction models require independent evaluation.\n\n## Methods\nThe proposed study will pre-register outcomes, use a held-out public dataset, and report calibration, discrimination, uncertainty intervals, and subgroup results.\n\n## Discussion\nExternal validation and qualified statistical review remain required.\n\n## Ethics\nNo patient data will be accessed without institutional approval. No approval is claimed.\n\n## References\nTransparent clinical prediction evaluation.`;
  const { data: manuscript, error: manuscriptError } = await professor.from("manuscripts").insert({
    project_id: projectId, owner_id: professorId, research_run_id: runId,
    title: "Transparent clinical prediction evaluation", target_journal: "Test Journal",
    article_type: "research_article", citation_style: "apa7", writing_mode: "human_authored",
    content: manuscriptContent, last_edit_source: "human", last_change_summary: "Professional flow smoke test",
  }).select().single();
  check(manuscript && !manuscriptError, "Peer-review manuscript failed", manuscriptError?.message);

  const collaborators = await invoke(professor, "collaborator_finder", { project_id: projectId, run_id: runId });
  check(collaborators.output?.candidates?.[0]?.name === "A. Researcher", "Deterministic collaborator ranking failed");
  check(collaborators.record?.evidence_quality === "grounded", "Collaborator evidence status is incorrect");

  const topic = await invoke(student, "topic_finder", {
    project_id: projectId,
    goal: "I am a masters student seeking a feasible research topic in transparent clinical AI evaluation.",
    constraints: "Six months, intermediate Python skills, no access to private patient data.",
  });
  check(topic.output?.topics?.length >= 4, "Topic finder returned too few topics");
  check(topic.record?.evidence_quality === "requires_verification", "Ungrounded topic output was not marked for verification");

  const simplified = await invoke(student, "paper_simplifier", {
    project_id: projectId,
    text: "This protocol proposes a pre-registered evaluation of clinical prediction models. It reports calibration, discrimination, uncertainty intervals and subgroup performance on a held-out public dataset. The protocol does not report completed experiments or clinical effectiveness.",
  });
  check(simplified.output?.plain_language_summary, "Paper simplifier returned no summary");
  const roadmap = await invoke(student, "research_roadmap", {
    project_id: projectId,
    goal: "Complete a six-month masters project on transparent evaluation of clinical prediction models.",
    constraints: "Public data only; intermediate Python; supervisor review every two weeks.",
  });
  check(roadmap.output?.phases?.length >= 3, "Research roadmap is incomplete");
  const thesis = await invoke(student, "thesis_coach", {
    project_id: projectId,
    goal: "Design a defensible thesis on subgroup calibration and transparent clinical AI evaluation.",
    constraints: "Protocol-level work; do not claim clinical validation.",
  });
  check(thesis.output?.research_questions?.length > 0, "Thesis coach returned no questions");

  const discovery = await invoke(professor, "professor_discovery", { project_id: projectId, run_id: runId });
  check(Array.isArray(discovery.output?.emerging_topics), "Professor discovery schema failed");
  const intelligence = await invoke(professor, "literature_intelligence", { project_id: projectId, run_id: runId });
  check(Array.isArray(intelligence.output?.clusters), "Literature intelligence schema failed");
  const review = await invoke(professor, "peer_review", { project_id: projectId, manuscript_id: manuscript.id });
  check(review.output?.scores?.methodology >= 0 && review.output?.recommendation, "Peer reviewer schema failed");
  const grant = await invoke(professor, "grant_proposal", {
    project_id: projectId, run_id: runId, goal: "Pilot a transparent clinical AI evaluation protocol.",
    funding_program: "Generic university seed grant; eligibility and rules must be independently verified.", currency: "USD",
  });
  check(grant.output?.work_packages?.length > 0 && grant.output?.budget_lines?.length > 0, "Grant proposal is incomplete");
  const supervision = await invoke(professor, "supervision_feedback", { project_id: projectId, assignment_id: assignment.id });
  check(supervision.output?.recommended_actions?.length > 0, "Supervision assistant returned no actions");

  const { data: analytics, error: analyticsError } = await professor.rpc("get_lab_analytics", { p_project_id: projectId });
  check(!analyticsError && analytics.members === 2 && analytics.supervised_students === 1, "Lab analytics failed", analyticsError?.message);

  const { data: records, error: recordsError } = await student.from("role_agent_outputs").select("action,evidence_quality").eq("project_id", projectId);
  check(!recordsError && records?.length === 10, "Professional output persistence/RLS failed", recordsError?.message);

  console.log(JSON.stringify({ result: "PASS", checks: {
    secure_role_onboarding: true, project_collaboration: true, supervision: true,
    deterministic_collaborator_evidence: true, topic_finder: true, paper_simplifier: true,
    research_roadmap: true, thesis_coach: true, professor_discovery: true,
    literature_intelligence: true, peer_review: true, grant_proposal: true,
    supervision_agent: true, evidence_labels: true, lab_analytics: true,
  } }, null, 2));
} finally {
  await Promise.all([professor.auth.signOut(), student.auth.signOut()]);
  for (const id of [professorId, studentId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error(`Cleanup failed for ${id}: ${error.message}`);
  }
}
