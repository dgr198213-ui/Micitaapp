import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { ApiError } from "@/modules/shared/errors";

type Client = SupabaseClient<Database>;

export interface StorefrontService {
  id: string;
  name: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number;
}

export interface StorefrontStaff {
  id: string;
  displayName: string;
}

export interface BusinessStorefront {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  services: StorefrontService[];
  staff: StorefrontStaff[];
}

/**
 * V-18: the only sanctioned way for an anonymous visitor to read a business's public
 * catalog. Scoped server-side by slug — unlike a direct `staff`/`services` table read,
 * this cannot be used to enumerate more than one business per call.
 */
export async function getBusinessStorefront(client: Client, slug: string): Promise<BusinessStorefront> {
  const { data, error } = await client.rpc("get_business_storefront", { p_slug: slug });
  if (error || !data) {
    throw new ApiError("BUSINESS_NOT_FOUND");
  }
  return data as unknown as BusinessStorefront;
}
