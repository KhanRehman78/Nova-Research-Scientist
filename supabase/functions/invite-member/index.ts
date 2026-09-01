// NOVA invite-member — owner adds a colleague to a shared research project.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getAuthedClient, json, ok } from "../_shared/mod.ts";

const ROLES = ["professor", "student", "research_assistant"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok();

  let authed;
  try {
    authed = await getAuthedClient(req);
  } catch (e: any) {
    return json({ error: e.message }, e.status ?? 401);
  }
  const { supabase, user } = authed;

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
  );
  const { data: listing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const target = (listing?.users ?? []).find(
    (u: any) => (u.email ?? "").toLowerCase() === email,
  );
  if (!target) {
    return json({ error: "No NOVA account found for that email yet" }, 404);
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

  return json({ ok: true, email, role });
});
