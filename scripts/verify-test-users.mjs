import { createClient } from "@supabase/supabase-js";

const url = process.env.NOVA_SUPABASE_URL;
const anonKey = process.env.NOVA_SUPABASE_ANON_KEY;
const accounts = JSON.parse(process.env.NOVA_TEST_ACCOUNTS ?? "[]");
if (!url || !anonKey || accounts.length === 0) throw new Error("Verification environment is incomplete");

const results = [];
for (const account of accounts) {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (authError || !authData.user) throw authError ?? new Error(`Login failed for ${account.role}`);

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role, privileged_role_verified")
    .eq("id", authData.user.id)
    .single();
  if (profileError) throw profileError;

  const { data: privileged, error: privilegeError } = await client.rpc("has_professor_privileges");
  if (privilegeError) throw privilegeError;

  const expectedPrivileged = ["professor", "lab_admin"].includes(account.role);
  if (profile.role !== account.role || profile.privileged_role_verified !== expectedPrivileged || privileged !== expectedPrivileged) {
    throw new Error(`Authorization mismatch for ${account.role}`);
  }

  await client.auth.signOut();
  results.push({ role: account.role, login: "pass", profile: "pass", authorization: "pass" });
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
