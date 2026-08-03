import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/modules/shared/database.types";
import { ApiError, fromPostgresError } from "@/modules/shared/errors";
import type { AppointmentDetails, AvailabilityQuery, BookingResult, CreateBookingInput, Slot } from "./types";

type Client = SupabaseClient<Database>;

async function resolveBusinessId(client: Client, slug: string): Promise<string> {
  const { data, error } = await client.from("businesses").select("id").eq("slug", slug).eq("active", true).maybeSingle();
  if (error || !data) {
    throw new ApiError("BUSINESS_NOT_FOUND");
  }
  return data.id;
}

export async function getAvailability(client: Client, query: AvailabilityQuery): Promise<Slot[]> {
  const businessId = await resolveBusinessId(client, query.businessSlug);

  const { data, error } = await client.rpc("get_available_slots", {
    p_business_id: businessId,
    p_service_id: query.serviceId,
    p_staff_id: query.staffId ?? null,
    p_from: query.from,
    p_to: query.to,
  });

  if (error) {
    throw fromPostgresError(error);
  }

  return (data ?? []).map((row) => ({ staffId: row.staff_id, startsAt: row.starts_at, endsAt: row.ends_at }));
}

async function hashRequestBody(body: unknown): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(body)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createBooking(
  client: Client,
  input: CreateBookingInput
): Promise<{ booking: BookingResult; alternatives?: Slot[] }> {
  const requestHash = input.idempotencyKey ? await hashRequestBody(input) : null;

  const { data, error } = await client.rpc("create_public_booking", {
    p_business_slug: input.businessSlug,
    p_service_id: input.serviceId,
    p_staff_id: input.staffId ?? null,
    p_starts_at: input.startsAt,
    p_customer_name: input.customer.name,
    p_customer_email: input.customer.email ?? null,
    p_customer_phone: input.customer.phone ?? null,
    p_notes: input.notes ?? null,
    p_marketing_consent: input.consent?.marketing ?? false,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_request_hash: requestHash,
  });

  if (error) {
    const apiError = fromPostgresError(error);
    if (apiError.code === "SLOT_TAKEN") {
      // Turn the dead end into a second chance to convert (§7.3): suggest nearby slots
      // the same day, falling back to the next few days if the day is fully booked.
      const day = input.startsAt.slice(0, 10);
      const dayAfter = new Date(new Date(day + "T00:00:00Z").getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
      let alternatives: Slot[] = [];
      try {
        alternatives = (
          await getAvailability(client, {
            businessSlug: input.businessSlug,
            serviceId: input.serviceId,
            staffId: input.staffId,
            from: day,
            to: dayAfter,
          })
        ).slice(0, 5);
      } catch {
        alternatives = [];
      }
      throw Object.assign(apiError, { alternatives });
    }
    throw apiError;
  }

  const row = data?.[0];
  if (!row) {
    throw new ApiError("INTERNAL_ERROR");
  }

  return {
    booking: {
      id: row.appointment_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      manageToken: row.manage_token,
      priceCents: row.price_cents,
    },
  };
}

export async function getAppointmentByToken(client: Client, token: string): Promise<AppointmentDetails> {
  const { data, error } = await client.rpc("get_appointment_by_token", { p_token: token });
  if (error) {
    throw fromPostgresError(error);
  }
  const row = data?.[0];
  if (!row) {
    throw new ApiError("TOKEN_INVALID");
  }
  return {
    id: row.appointment_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    serviceName: row.service_name,
    staffName: row.staff_name,
    businessName: row.business_name,
    businessTimezone: row.business_timezone,
    priceCents: row.price_cents,
  };
}

export async function cancelAppointmentByToken(client: Client, token: string): Promise<{ id: string; status: string }> {
  const { data, error } = await client.rpc("cancel_appointment_by_token", { p_token: token });
  if (error) {
    throw fromPostgresError(error);
  }
  const row = data?.[0];
  if (!row) {
    throw new ApiError("TOKEN_INVALID");
  }
  return { id: row.appointment_id, status: row.status };
}

export interface CreateManualBookingInput {
  businessId: string;
  serviceId: string;
  staffId: string;
  startsAt: string;
  customer: { id?: string; name: string; email?: string | null; phone?: string | null };
  notes?: string | null;
  createdBy: "owner" | "staff";
}

/**
 * Owner/staff walk-in or phone booking (§1.3). Unlike the public path, this deliberately
 * does not re-check the lead-time/working-hours policy via is_slot_bookable — staff know
 * when they're making an exception for a walk-in. RN-01 still holds unconditionally: the
 * exclusion constraint is enforced by Postgres regardless of who is inserting the row.
 */
export async function createManualBooking(client: Client, input: CreateManualBookingInput) {
  let customerId = input.customer.id ?? null;
  if (!customerId) {
    const { data: customer, error: customerError } = await client
      .from("customers")
      .insert({
        business_id: input.businessId,
        name: input.customer.name,
        email: input.customer.email ?? null,
        phone: input.customer.phone ?? null,
      })
      .select("id")
      .single();
    if (customerError) throw new ApiError("INTERNAL_ERROR", customerError);
    customerId = customer.id;
  }

  const { data: service, error: serviceError } = await client
    .from("services")
    .select("duration_minutes, buffer_after_minutes, price_cents")
    .eq("id", input.serviceId)
    .single();
  if (serviceError || !service) {
    throw new ApiError("SERVICE_UNAVAILABLE");
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(startsAt.getTime() + (service.duration_minutes + service.buffer_after_minutes) * 60_000);

  const { data: appointment, error: apptError } = await client
    .from("appointments")
    .insert({
      business_id: input.businessId,
      staff_id: input.staffId,
      service_id: input.serviceId,
      customer_id: customerId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "confirmed",
      price_cents: service.price_cents,
      duration_minutes: service.duration_minutes,
      buffer_after_minutes: service.buffer_after_minutes,
      notes: input.notes ?? null,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (apptError) {
    if ((apptError as { code?: string }).code === "23P01") {
      throw new ApiError("SLOT_TAKEN");
    }
    throw new ApiError("INTERNAL_ERROR", apptError);
  }

  // V-13: log_appointment_event() derives the actor from the caller's own membership
  // (auth_business_role + auth.uid()) — createdBy above only shapes appointments.created_by,
  // it is never trusted as the audit actor.
  await client.rpc("log_appointment_event", {
    p_appointment_id: appointment.id,
    p_event: "created",
    p_metadata: { channel: "manual" },
  });

  return appointment;
}

export async function rescheduleAppointmentByToken(
  client: Client,
  token: string,
  newStartsAt: string
): Promise<{ id: string; status: string; startsAt: string; endsAt: string }> {
  const { data, error } = await client.rpc("reschedule_appointment_by_token", {
    p_token: token,
    p_new_starts_at: newStartsAt,
  });
  if (error) {
    throw fromPostgresError(error);
  }
  const row = data?.[0];
  if (!row) {
    throw new ApiError("TOKEN_INVALID");
  }
  return { id: row.appointment_id, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at };
}
