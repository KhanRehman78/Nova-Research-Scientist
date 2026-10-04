import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const professorEmail = process.env.NOVA_DEMO_PROFESSOR_EMAIL;
const professorPassword = process.env.NOVA_DEMO_PROFESSOR_PASSWORD;
const studentEmail = process.env.NOVA_DEMO_STUDENT_EMAIL;
const studentPassword = process.env.NOVA_DEMO_STUDENT_PASSWORD;
const assistantEmail = process.env.NOVA_DEMO_ASSISTANT_EMAIL;
if (!url || !publishableKey || !serviceRoleKey || !professorEmail || !professorPassword || !studentEmail || !studentPassword || !assistantEmail) {
  throw new Error("Presentation demo environment is incomplete");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const professor = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const student = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });

const check = (condition, message, detail) => {
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
};

const findUser = async (email) => {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  throw new Error(`Demo user not found: ${email}`);
};

const invoke = async (client, functionName, body) => {
  const { data, error } = await client.functions.invoke(functionName, { body });
  if (error || data?.error) {
    let detail = data?.detail || data?.error || error?.message;
    if (error?.context && typeof error.context.json === "function") {
      try {
        const payload = await error.context.json();
        detail = payload?.detail || payload?.error || detail;
      } catch { /* keep the SDK message */ }
    }
    throw new Error(`${functionName} failed: ${detail}`);
  }
  return data;
};

const [professorUser, studentUser, assistantUser] = await Promise.all([
  findUser(professorEmail),
  findUser(studentEmail),
  findUser(assistantEmail),
]);

const verified = await admin.rpc("set_verified_professional_role", {
  p_profile_id: professorUser.id,
  p_role: "professor",
});
check(!verified.error, "Professor verification failed", verified.error?.message);

const professorLogin = await professor.auth.signInWithPassword({ email: professorEmail, password: professorPassword });
check(!professorLogin.error, "Professor login failed", professorLogin.error?.message);
const studentLogin = await student.auth.signInWithPassword({ email: studentEmail, password: studentPassword });
check(!studentLogin.error, "Student login failed", studentLogin.error?.message);

const profile = await professor.rpc("set_own_professional_profile", {
  p_role: "professor",
  p_full_name: "NOVA Demo Professor",
  p_institution: "NOVA Research University",
  p_department: "Artificial Intelligence and Data Science",
  p_research_interests: ["interpretable AI", "medical imaging", "research integrity"],
  p_expertise_level: "expert",
});
check(!profile.error, "Professor profile setup failed", profile.error?.message);

let project;
const projectLookup = await professor
  .from("projects")
  .select("*")
  .eq("owner_id", professorUser.id)
  .eq("name", "NOVA Presentation Workspace")
  .maybeSingle();
if (projectLookup.data) {
  project = projectLookup.data;
} else {
  const created = await admin.from("projects").insert({
    id: crypto.randomUUID(),
    name: "NOVA Presentation Workspace",
    description: "Live presentation workspace showing the complete NOVA research lifecycle.",
    owner_id: professorUser.id,
  }).select().single();
  check(created.data && !created.error, "Presentation project creation failed", created.error?.message);
  project = created.data;
}

for (const member of [
  { profile_id: studentUser.id, role: "student" },
  { profile_id: assistantUser.id, role: "research_assistant" },
]) {
  const result = await admin.from("project_members").upsert({ project_id: project.id, ...member }, { onConflict: "project_id,profile_id" });
  check(!result.error, "Project member setup failed", result.error?.message);
}

let assignment;
const assignmentLookup = await professor.from("supervision_assignments")
  .select("*")
  .eq("project_id", project.id)
  .eq("student_id", studentUser.id)
  .maybeSingle();
if (assignmentLookup.data) {
  const updated = await professor.from("supervision_assignments")
    .update({ research_title: "Interpretable AI for reliable medical imaging", progress: 62, status: "active" })
    .eq("id", assignmentLookup.data.id)
    .select().single();
  check(updated.data && !updated.error, "Supervision assignment update failed", updated.error?.message);
  assignment = updated.data;
} else {
  const created = await professor.from("supervision_assignments").insert({
    project_id: project.id,
    student_id: studentUser.id,
    supervisor_id: professorUser.id,
    research_title: "Interpretable AI for reliable medical imaging",
    progress: 62,
    status: "active",
  }).select().single();
  check(created.data && !created.error, "Supervision assignment creation failed", created.error?.message);
  assignment = created.data;
}

const existingUpdate = await student.from("supervision_updates")
  .select("id")
  .eq("assignment_id", assignment.id)
  .limit(1);
if (!existingUpdate.data?.length) {
  const update = await student.from("supervision_updates").insert({
    assignment_id: assignment.id,
    author_id: studentUser.id,
    section: "literature",
    status: "needs_review",
    progress: 62,
    note: "Completed the search protocol and evidence matrix. The next milestone is external validation design and supervisor review.",
  });
  check(!update.error, "Supervision progress update failed", update.error?.message);
}

const query = "How can interpretable AI improve reliability in medical imaging diagnosis?";
let run = (await professor.from("research_runs").select("*")
  .eq("project_id", project.id)
  .eq("query", query)
  .eq("status", "completed")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle()).data;

if (!run) {
  const planned = await invoke(professor, "research-manager", {
    action: "plan",
    project_id: project.id,
    query,
    mode: "quick",
  });
  const runId = planned.run_id;
  await invoke(professor, "search-agent", { run_id: runId });
  await invoke(professor, "paper-reader", { run_id: runId });
  await invoke(professor, "reasoning-gap", { run_id: runId });
  await invoke(professor, "scientist-hypothesis", { run_id: runId });
  await invoke(professor, "report-writer", { run_id: runId });
  const result = await professor.from("research_runs").select("*").eq("id", runId).single();
  check(result.data && !result.error, "Completed demo run could not be loaded", result.error?.message);
  run = result.data;
}

const reportResult = await professor.from("reports").select("*").eq("run_id", run.id).single();
check(reportResult.data && !reportResult.error, "Demo report is missing", reportResult.error?.message);
const report = reportResult.data;
const sectionText = (report.sections_json?.sections ?? [])
  .map((section) => `## ${section.heading}\n\n${section.body}`)
  .join("\n\n");
const manuscriptTitle = "Interpretable AI for Reliable Medical Imaging";
let manuscript = (await professor.from("manuscripts").select("*")
  .eq("project_id", project.id)
  .eq("title", manuscriptTitle)
  .maybeSingle()).data;
if (!manuscript) {
  const created = await professor.from("manuscripts").insert({
    project_id: project.id,
    owner_id: professorUser.id,
    research_run_id: run.id,
    title: manuscriptTitle,
    target_journal: "Journal of Medical Artificial Intelligence",
    article_type: "research_article",
    citation_style: "apa7",
    writing_mode: "ai_assisted",
    content: `# ${manuscriptTitle}\n\n## Abstract\n\n${report.abstract}\n\n${sectionText}\n\n## Ethics and limitations\n\nThis proposal does not claim completed clinical validation. Human reviewers must verify citations, permissions, statistical assumptions, ethics approval requirements, and the target journal's current instructions.`,
    ai_disclosure: "NOVA assisted with evidence organization and drafting. The authors remain responsible for verifying every claim, citation, analysis, and disclosure.",
    last_edit_source: "ai_generated",
    last_change_summary: "Presentation-ready manuscript generated from the completed research run",
  }).select().single();
  check(created.data && !created.error, "Demo manuscript creation failed", created.error?.message);
  manuscript = created.data;
}

const documentPath = `${manuscript.id}/presentation-source.txt`;
const documentText = "Interpretability in medical imaging requires explanation faithfulness, stability under distribution shift, calibrated uncertainty, and clinical validation. This controlled source supports the NOVA presentation demo.";
const upload = await professor.storage.from("manuscripts").upload(
  documentPath,
  new Blob([documentText], { type: "text/plain" }),
  { upsert: true, contentType: "text/plain" },
);
check(!upload.error, "Demo document upload failed", upload.error?.message);
const document = await admin.from("manuscript_documents").upsert({
  manuscript_id: manuscript.id,
  storage_path: documentPath,
  filename: "presentation-source.txt",
  mime_type: "text/plain",
  size_bytes: new TextEncoder().encode(documentText).length,
  kind: "source",
  extracted_text: documentText,
  extraction_status: "complete",
  metadata: { purpose: "presentation_demo" },
  created_by: professorUser.id,
}, { onConflict: "storage_path" });
check(!document.error, "Demo document record failed", document.error?.message);

const existingSuggestions = await professor.from("writing_suggestions").select("id", { count: "exact", head: true }).eq("manuscript_id", manuscript.id);
if (!existingSuggestions.count) await invoke(professor, "writing-assistant", { action: "analyze", manuscript_id: manuscript.id });
const existingValidation = await professor.from("validation_findings").select("id", { count: "exact", head: true }).eq("manuscript_id", manuscript.id);
if (!existingValidation.count) await invoke(professor, "paper-validator", { manuscript_id: manuscript.id });

const existingOutput = await professor.from("role_agent_outputs").select("id", { count: "exact", head: true })
  .eq("project_id", project.id)
  .eq("action", "literature_intelligence");
if (!existingOutput.count) {
  await invoke(professor, "professional-agent", {
    action: "literature_intelligence",
    project_id: project.id,
    run_id: run.id,
  });
}

await Promise.all([professor.auth.signOut(), student.auth.signOut()]);
process.stdout.write(`${JSON.stringify({
  project_id: project.id,
  run_id: run.id,
  manuscript_id: manuscript.id,
  assignment_id: assignment.id,
  project_name: project.name,
}, null, 2)}\n`);
