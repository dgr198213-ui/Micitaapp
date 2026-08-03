import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getAvailability } from "@/modules/scheduling/service";
import { availabilityQuerySchema } from "@/modules/scheduling/availability-query";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withApiHandler("availability.get", async () => {
    const { slug } = await params;

    const rl = await checkRateLimit("availability", clientIp(request), 30, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const url = new URL(request.url);
    const parsed = availabilityQuerySchema.safeParse({
      service: url.searchParams.get("service"),
      staff: url.searchParams.get("staff") ?? undefined,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", parsed.error.flatten());
    }

    const client = createPublicSupabaseClient();
    const slots = await getAvailability(client, {
      businessSlug: slug,
      serviceId: parsed.data.service,
      staffId: parsed.data.staff ?? null,
      from: parsed.data.from,
      to: parsed.data.to,
    });

    return NextResponse.json({ slots: slots.map((s) => ({ staffId: s.staffId, startsAt: s.startsAt, endsAt: s.endsAt })) });
  });
}
