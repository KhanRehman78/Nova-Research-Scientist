import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
let page = 1;
let removed = 0;
while (true) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  const users = data.users ?? [];
  for (const user of users) {
    if (!["nova-writing-smoke-", "nova-open-research-", "nova-professor-", "nova-student-"].some((prefix) => user.email?.startsWith(prefix))) continue;
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    removed += 1;
  }
  if (users.length < 1000) break;
  page += 1;
}
console.log(JSON.stringify({ removed }));
