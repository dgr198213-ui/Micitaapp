import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";

/**
 * service_role client — bypasses RLS entirely. Only for trusted server-only code paths:
 * the notification cron workers and platform-admin operations. Never import this from
 * anything reachable by a browser bundle.
 */
export function createAdminSupabaseClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
