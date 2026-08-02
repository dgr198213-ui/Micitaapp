import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";

/**
 * Stateless anon-key client for the public booking surfaces (`/b/[slug]`, `/r/[token]`).
 * No cookies, no session — anonymous visitors are never authenticated, they can only
 * reach data through the SECURITY DEFINER RPC functions (see supabase/migrations/0007).
 */
export function createPublicSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
