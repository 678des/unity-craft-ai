import { createClient } from "@supabase/supabase-js";

// ブラウザ用クライアント(anon key)。Realtime購読と読み取り専用。
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
