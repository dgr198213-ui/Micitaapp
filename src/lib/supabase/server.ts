import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/modules/shared/database.types";

/**
 * Authenticated client for Server Components / Route Handlers / Server Actions in the
 * `/app` panel. Uses the publishable (anon) key — RLS decides what the signed-in user
 * can actually see, exactly like on the client.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — middleware refreshes the
            // session cookie on the next request instead.
          }
        },
      },
    }
  );
}
