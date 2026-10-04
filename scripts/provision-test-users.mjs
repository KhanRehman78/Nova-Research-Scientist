import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const projectRef = process.env.NOVA_SUPABASE_PROJECT_REF;
if (!projectRef) throw new Error("NOVA_SUPABASE_PROJECT_REF is required");

let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const keys = JSON.parse(raw);
const serviceKey = keys.find((key) => key.id === "service_role")?.api_key
  ?? keys.find((key) => key.type === "secret")?.api_key;
if (!serviceKey || serviceKey.includes("·")) {
  throw new Error("A revealed service-role or secret API key is required on stdin");
}

const supabase = createClient(`https://${projectRef}.supabase.co`, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accounts = [
  { role: "student", email: "nova.student.demo@example.com", fullName: "NOVA Demo Student" },
  { role: "research_assistant", email: "nova.ra.demo@example.com", fullName: "NOVA Demo Research Assistant" },
  { role: "professor", email: "nova.professor.demo@example.com", fullName: "NOVA Demo Professor" },
  { role: "lab_admin", email: "nova.admin.demo@example.com", fullName: "NOVA Demo Lab Admin" },
];

const users = [];
for (let page = 1; page <= 50; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}

const result = [];
for (const account of accounts) {
  const password = `Nova-${randomBytes(12).toString("base64url")}!9`;
  const existing = users.find((user) => user.email?.toLowerCase() === account.email);
  let userId;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, role: account.role },
    });
    if (error) throw error;
    userId = data.user.id;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, role: account.role },
    });
    if (error) throw error;
    userId = data.user.id;
  }

  const { error: roleError } = await supabase.rpc("set_verified_professional_role", {
    p_profile_id: userId,
    p_role: account.role,
  });
  if (roleError) throw roleError;

  result.push({ role: account.role, email: account.email, password });
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
