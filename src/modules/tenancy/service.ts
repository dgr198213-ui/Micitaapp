import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { ApiError } from "@/modules/shared/errors";

type Client = SupabaseClient<Database>;

export interface Membership {
  businessId: string;
  businessName: string;
  businessSlug: string;
  role: "owner" | "staff" | "platform_admin";
  staffId: string | null;
}

export async function getCurrentUserId(client: Client): Promise<string | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.id ?? null;
}

export async function listMyMemberships(client: Client): Promise<Membership[]> {
  const { data, error } = await client
    .from("memberships")
    .select("business_id, role, staff_id, businesses(name, slug)")
    .returns<{ business_id: string; role: string; staff_id: string | null; businesses: { name: string; slug: string } | null }[]>();

  if (error) throw new ApiError("INTERNAL_ERROR", error);

  return (data ?? [])
    .filter((row) => row.businesses)
    .map((row) => ({
      businessId: row.business_id,
      businessName: row.businesses!.name,
      businessSlug: row.businesses!.slug,
      role: row.role as Membership["role"],
      staffId: row.staff_id,
    }));
}

/**
 * MVP simplification: a business owner/staff account manages exactly one business
 * (§0.1 — "1 local, 1-5 profesionales"). Multi-location is explicit post-MVP scope (§15.2).
 * If a user somehow has several memberships, the panel defaults to the first alphabetically
 * rather than failing, and a real business switcher is future work.
 */
export async function getCurrentBusiness(client: Client): Promise<Membership> {
  const memberships = await listMyMemberships(client);
  if (memberships.length === 0) {
    throw new ApiError("FORBIDDEN");
  }
  return [...memberships].sort((a, b) => a.businessName.localeCompare(b.businessName))[0];
}

/** Throws FORBIDDEN if the signed-in user has no membership on this business. RLS is the
 * real gate; this just turns an empty result set into a clean 403 instead of a blank page. */
export async function requireMembership(client: Client, businessId: string): Promise<Membership> {
  const { data, error } = await client
    .from("memberships")
    .select("business_id, role, staff_id, businesses(name, slug)")
    .eq("business_id", businessId)
    .maybeSingle<{ business_id: string; role: string; staff_id: string | null; businesses: { name: string; slug: string } | null }>();

  if (error || !data || !data.businesses) {
    throw new ApiError("FORBIDDEN");
  }

  return {
    businessId: data.business_id,
    businessName: data.businesses.name,
    businessSlug: data.businesses.slug,
    role: data.role as Membership["role"],
    staffId: data.staff_id,
  };
}
