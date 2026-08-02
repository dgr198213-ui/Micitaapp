import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { ApiError } from "@/modules/shared/errors";

type Client = SupabaseClient<Database>;
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];

export async function listCustomers(client: Client, businessId: string, search?: string): Promise<CustomerRow[]> {
  let query = client.from("customers").select("*").eq("business_id", businessId).is("deleted_at", null).order("name");
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { data, error } = await query.limit(100);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data ?? [];
}

export async function getCustomer(client: Client, id: string): Promise<CustomerRow> {
  const { data, error } = await client.from("customers").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error || !data) throw new ApiError("INTERNAL_ERROR", error);
  return data;
}

export async function updateCustomerNotes(client: Client, id: string, notes: string): Promise<void> {
  const { error } = await client.from("customers").update({ notes }).eq("id", id);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
}

/** RGPD right to erasure (§8.8): anonymize rather than hard-delete, so the appointment
 * history that the business needs for accounting/aggregates survives without any PII. */
export async function anonymizeCustomer(client: Client, id: string): Promise<void> {
  const { error } = await client
    .from("customers")
    .update({ name: "Cliente eliminado", email: null, phone: null, notes: null, deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
}
