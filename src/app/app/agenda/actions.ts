"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { createManualBooking } from "@/modules/scheduling/service";
import { ApiError } from "@/modules/shared/errors";

const manualBookingSchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  customerId: z.string().uuid().optional(),
  customerName: z.string().min(1).max(200).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().min(6).max(30).optional(),
  notes: z.string().max(1000).optional(),
});

export async function createManualBookingAction(formData: FormData) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);

  const raw = {
    serviceId: formData.get("serviceId"),
    staffId: formData.get("staffId"),
    startsAt: formData.get("startsAt"),
    customerId: formData.get("customerId") || undefined,
    customerName: formData.get("customerName") || undefined,
    customerEmail: formData.get("customerEmail") || undefined,
    customerPhone: formData.get("customerPhone") || undefined,
    notes: formData.get("notes") || undefined,
  };
  const input = manualBookingSchema.parse(raw);

  if (!input.customerId && !input.customerName) {
    throw new ApiError("VALIDATION_ERROR", { field: "customerName" });
  }

  const appointment = await createManualBooking(client, {
    businessId: business.businessId,
    serviceId: input.serviceId,
    staffId: input.staffId,
    startsAt: input.startsAt,
    customer: input.customerId
      ? { id: input.customerId, name: "" }
      : { name: input.customerName!, email: input.customerEmail ?? null, phone: input.customerPhone ?? null },
    notes: input.notes,
    createdBy: business.role === "owner" ? "owner" : "staff",
  });

  revalidatePath("/app/agenda");
  return appointment;
}

// V-14: closing an appointment is always a deliberate, manual action from the panel — the
// cron only ever auto-completes (see 0012_v14_no_show_closure.sql). Routed through the
// close_appointment_manually() RPC rather than a direct table update so the audit trail
// always records the real signed-in actor, not a value the client could shape.
export async function closeAppointmentAction(appointmentId: string, status: "completed" | "no_show") {
  const client = await createServerSupabaseClient();

  const { data, error } = await client.rpc("close_appointment_manually", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  if (error) throw new ApiError(error.message === "FORBIDDEN" ? "FORBIDDEN" : "INVALID_STATE");
  if (!data || data.length === 0) throw new ApiError("INVALID_STATE");

  revalidatePath("/app/agenda");
}

export async function cancelAppointmentAction(appointmentId: string) {
  const client = await createServerSupabaseClient();

  // V-21: RLS lets an owner cancel anything but restricts staff to their own appointments
  // (appointments_staff_write_own) — without checking what the update actually matched, a
  // staff member cancelling someone else's appointment would silently affect 0 rows while
  // this code went on to log a cancellation event and clear notification_jobs for an
  // appointment that was never touched.
  const { data, error } = await client
    .from("appointments")
    .update({ status: "cancelled_by_business" })
    .eq("id", appointmentId)
    .select("id");
  if (error) throw new ApiError("INTERNAL_ERROR", error);
  if (!data || data.length === 0) throw new ApiError("FORBIDDEN");

  // V-13: routed through log_appointment_event() so the recorded actor is the real
  // signed-in user (auth.uid() + their actual role), never a value this code declares.
  await client.rpc("log_appointment_event", { p_appointment_id: appointmentId, p_event: "cancelled_by_business" });

  await client.from("notification_jobs").update({ status: "cancelled" }).eq("appointment_id", appointmentId).eq("status", "pending");

  revalidatePath("/app/agenda");
}
