import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { ApiError } from "@/modules/shared/errors";

type Client = SupabaseClient<Database>;
type StaffRow = Database["public"]["Tables"]["staff"]["Row"];
type WorkingHoursRow = Database["public"]["Tables"]["working_hours"]["Row"];
type TimeOffRow = Database["public"]["Tables"]["time_off"]["Row"];

export async function listStaff(client: Client, businessId: string, opts: { includeInactive?: boolean } = {}): Promise<StaffRow[]> {
  let query = client.from("staff").select("*").eq("business_id", businessId).order("display_name");
  if (!opts.includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data ?? [];
}

export async function createStaff(client: Client, businessId: string, displayName: string): Promise<StaffRow> {
  const { data, error } = await client.from("staff").insert({ business_id: businessId, display_name: displayName }).select().single();
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data;
}

export async function setStaffActive(client: Client, staffId: string, active: boolean): Promise<void> {
  const { error } = await client.from("staff").update({ active }).eq("id", staffId);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
}

export interface WorkingHoursInput {
  weekday: number;
  startLocal: string; // "HH:MM"
  endLocal: string;
}

export async function listWorkingHours(client: Client, staffId: string): Promise<WorkingHoursRow[]> {
  const { data, error } = await client.from("working_hours").select("*").eq("staff_id", staffId).order("weekday");
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data ?? [];
}

/** Replaces a staff member's entire weekly schedule in one call — the panel's editor
 * submits the full week, which is simpler and less error-prone than diffing rows. */
export async function setWorkingHours(client: Client, businessId: string, staffId: string, rows: WorkingHoursInput[]): Promise<void> {
  const { error: deleteError } = await client.from("working_hours").delete().eq("staff_id", staffId);
  if (deleteError) throw new ApiError("INTERNAL_ERROR", deleteError);

  if (rows.length === 0) return;

  const { error: insertError } = await client.from("working_hours").insert(
    rows.map((r) => ({
      business_id: businessId,
      staff_id: staffId,
      weekday: r.weekday,
      start_local: r.startLocal,
      end_local: r.endLocal,
    }))
  );
  if (insertError) throw new ApiError("INTERNAL_ERROR", insertError);
}

export async function listTimeOff(client: Client, staffId: string): Promise<TimeOffRow[]> {
  const { data, error } = await client.from("time_off").select("*").eq("staff_id", staffId).order("starts_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  return data ?? [];
}

export interface ConflictingAppointment {
  id: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
}

/** T-07: creating an absence never silently touches existing bookings — it only returns
 * whichever confirmed/pending appointments now fall inside it, so the caller can warn the
 * owner and let a human decide whether to cancel each one. */
export async function createTimeOff(
  client: Client,
  businessId: string,
  staffId: string,
  startsAt: string,
  endsAt: string,
  reason?: string
): Promise<{ timeOff: TimeOffRow; conflicts: ConflictingAppointment[] }> {
  const { data: timeOff, error } = await client
    .from("time_off")
    .insert({ business_id: businessId, staff_id: staffId, starts_at: startsAt, ends_at: endsAt, reason: reason ?? null })
    .select()
    .single();
  if (error) throw new ApiError("INTERNAL_ERROR", error);

  const { data: conflicting, error: conflictError } = await client
    .from("appointments")
    .select("id, starts_at, ends_at, customers(name)")
    .eq("staff_id", staffId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .returns<{ id: string; starts_at: string; ends_at: string; customers: { name: string } | null }[]>();
  if (conflictError) throw new ApiError("INTERNAL_ERROR", conflictError);

  return {
    timeOff,
    conflicts: (conflicting ?? []).map((a) => ({
      id: a.id,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
      customerName: a.customers?.name ?? "Cliente",
    })),
  };
}

export async function deleteTimeOff(client: Client, timeOffId: string): Promise<void> {
  const { error } = await client.from("time_off").delete().eq("id", timeOffId);
  if (error) throw new ApiError("INTERNAL_ERROR", error);
}
