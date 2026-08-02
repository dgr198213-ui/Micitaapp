import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { ApiError } from "@/modules/shared/errors";

type Client = SupabaseClient<Database>;
type ServiceRow = Database["public"]["Tables"]["services"]["Row"];

export interface ServiceInput {
  name: string;
  durationMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number;
}

export async function listServices(client: Client, businessId: string, opts: { includeInactive?: boolean } = {}): Promise<ServiceRow[]> {
  let query = client.from("services").select("*").eq("business_id", businessId).order("name");
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data ?? [];
}

export async function createService(client: Client, businessId: string, input: ServiceInput): Promise<ServiceRow> {
  const { data, error } = await client
    .from("services")
    .insert({
      business_id: businessId,
      name: input.name,
      duration_minutes: input.durationMinutes,
      buffer_after_minutes: input.bufferAfterMinutes,
      price_cents: input.priceCents,
    })
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data;
}

export async function updateService(client: Client, serviceId: string, input: Partial<ServiceInput>): Promise<ServiceRow> {
  const { data, error } = await client
    .from("services")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.durationMinutes !== undefined && { duration_minutes: input.durationMinutes }),
      ...(input.bufferAfterMinutes !== undefined && { buffer_after_minutes: input.bufferAfterMinutes }),
      ...(input.priceCents !== undefined && { price_cents: input.priceCents }),
    })
    .eq("id", serviceId)
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data;
}

// Deactivating (not deleting) preserves the service on past appointments (T-08): the FK from
// appointments.service_id has no ON DELETE CASCADE, so a hard delete would fail anyway once
// any appointment references it — deactivation is the only safe path once a service is in use.
export async function setServiceActive(client: Client, serviceId: string, active: boolean): Promise<void> {
  const { error } = await client.from("services").update({ active }).eq("id", serviceId);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
}

export async function listStaffServiceIds(client: Client, staffId: string): Promise<string[]> {
  const { data, error } = await client.from("staff_services").select("service_id").eq("staff_id", staffId);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return (data ?? []).map((r) => r.service_id);
}

export async function setStaffServices(client: Client, businessId: string, staffId: string, serviceIds: string[]): Promise<void> {
  const { error: deleteError } = await client.from("staff_services").delete().eq("staff_id", staffId);
  if (deleteError) throw new ApiError("INTERNAL_ERROR", deleteError);

  if (serviceIds.length === 0) return;

  const { error: insertError } = await client
    .from("staff_services")
    .insert(serviceIds.map((serviceId) => ({ business_id: businessId, staff_id: staffId, service_id: serviceId })));
  if (insertError) throw new ApiError("INTERNAL_ERROR", insertError);
}
