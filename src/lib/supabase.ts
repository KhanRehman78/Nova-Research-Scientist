import { createClient } from "@supabase/supabase-js";

// These two values are intentionally publishable. All privileged credentials
// (service role, database password, LLM keys) stay server-side in Supabase.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://ykmpvokuleuefafcboip.supabase.co";
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_C-P1FP59G0UQIN56DnThyQ_j64KgsoS";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
