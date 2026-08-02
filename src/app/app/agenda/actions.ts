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

export async function cancelAppointmentAction(appointmentId: string) {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);

  const { error } = await client.from("appointments").update({ status: "cancelled_by_business" }).eq("id", appointmentId);
  if (error) throw new ApiError("INTERNAL_ERROR", error);

  await client.from("appointment_events").insert({
    appointment_id: appointmentId,
    business_id: business.businessId,
    event: "cancelled_by_business",
    actor: business.role,
  });

  await client.from("notification_jobs").update({ status: "cancelled" }).eq("appointment_id", appointmentId).eq("status", "pending");

  revalidatePath("/app/agenda");
}
