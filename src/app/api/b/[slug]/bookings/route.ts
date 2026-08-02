import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { createBooking } from "@/modules/scheduling/service";

const bodySchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  customer: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(30).optional(),
  }),
  notes: z.string().max(1000).optional(),
  consent: z.object({ terms: z.boolean(), marketing: z.boolean().optional() }),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withApiHandler("booking.create", async () => {
    const { slug } = await params;
    const ip = clientIp(request);

    const ipLimit = await checkRateLimit("bookings-ip", ip, 5, 60);
    if (!ipLimit.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", parsed.error.flatten());
    }
    const body = parsed.data;

    if (!body.consent.terms) {
      throw new ApiError("VALIDATION_ERROR", { field: "consent.terms" });
    }
    if (!body.customer.email && !body.customer.phone) {
      throw new ApiError("INVALID_CUSTOMER");
    }

    if (body.customer.email) {
      const emailLimit = await checkRateLimit("bookings-email", body.customer.email.toLowerCase(), 10, 3600);
      if (!emailLimit.success) {
        throw new ApiError("RATE_LIMITED");
      }
    }

    const idempotencyKey = request.headers.get("Idempotency-Key");

    const client = createPublicSupabaseClient();
    const { booking } = await createBooking(client, {
      businessSlug: slug,
      serviceId: body.serviceId,
      staffId: body.staffId ?? null,
      startsAt: body.startsAt,
      customer: body.customer,
      notes: body.notes,
      consent: body.consent,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        id: booking.id,
        status: booking.status,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        manageUrl: `/r/${booking.manageToken}`,
      },
      { status: 201 }
    );
  });
}
