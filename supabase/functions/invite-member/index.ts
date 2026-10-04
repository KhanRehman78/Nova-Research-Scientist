// NOVA invite-member — owner adds a colleague to a shared research project.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getAuthedClient, json, ok, rateLimit } from "../_shared/mod.ts";

const ROLES = ["professor", "student", "research_assistant"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (e: any) {
    return json({ error: e.message }, e.status ?? 401);
  }
  const { supabase, user } = authed;
  const limited = await rateLimit(supabase, "invite-member", 20);
  if (limited) return limited;

  let body: { project_id?: string; email?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const projectId = body.project_id;
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "student";

  if (!projectId) return json({ error: "project_id is required" }, 400);
  if (!email) return json({ error: "email is required" }, 400);
  if (!ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

  // Only the project owner may invite collaborators.
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.owner_id !== user.id) {
    return json({ error: "Only the project owner can invite members" }, 403);
  }

  // Resolve the email to a NOVA account via the admin API (service role).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  let target: any = null;
  for (let page = 1; page <= 50 && !target; page += 1) {
    const { data: listing, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) return json({ error: "The invitation directory is temporarily unavailable" }, 503);
    const users = listing?.users ?? [];
    target = users.find((candidate: any) => (candidate.email ?? "").toLowerCase() === email) ?? null;
    if (users.length < 1000) break;
  }
  let invitationSent = false;
  if (!target) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role: role === "research_assistant" ? "research_assistant" : "student" },
    });
    if (inviteError || !invited.user) {
      return json({ error: "The invitation could not be sent. Please verify the address and try again." }, 400);
    }
    target = invited.user;
    invitationSent = true;
  }
  if (target.id === user.id) {
    return json({ error: "That's your own account" }, 400);
  }

  const { error: insErr } = await admin
    .from("project_members")
    .upsert(
      { project_id: projectId, profile_id: target.id, role },
      { onConflict: "project_id,profile_id" },
    );
  if (insErr) return json({ error: insErr.message }, 500);

  return json({ ok: true, email, role, invitation_sent: invitationSent });
});
