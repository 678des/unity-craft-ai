import { createClient } from "@supabase/supabase-js";

// サーバー専用(service role)。クライアントコードからimportしないこと。
export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
