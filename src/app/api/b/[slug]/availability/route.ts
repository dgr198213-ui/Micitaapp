import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getAvailability } from "@/modules/scheduling/service";

// V-10: the availability engine is O(staff x days x slots) with two EXISTS per candidate
// slot. An unbounded window on a public, unauthenticated endpoint is a CPU-exhaustion
// primitive, so the range is capped here (31 days) as well as in the SQL function (62).
const MAX_RANGE_DAYS = 31;

const querySchema = z
  .object({
    service: z.string().uuid(),
    staff: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((q) => {
    const span = (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000;
    return Number.isFinite(span) && span >= 0 && span <= MAX_RANGE_DAYS;
  }, { message: `El rango no puede superar ${MAX_RANGE_DAYS} días`, path: ["to"] });

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  return withApiHandler("availability.get", async () => {
    const { slug } = await params;

    const rl = await checkRateLimit("availability", clientIp(request), 30, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
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
