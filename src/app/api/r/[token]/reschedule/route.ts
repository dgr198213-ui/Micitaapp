import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { rescheduleAppointmentByToken } from "@/modules/scheduling/service";

const bodySchema = z.object({ startsAt: z.string().datetime({ offset: true }) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return withApiHandler("appointment.reschedule", async () => {
    const { token } = await params;

    const rl = await checkRateLimit("manage-write", clientIp(request), 5, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", parsed.error.flatten());
    }

    const client = createPublicSupabaseClient();
    const result = await rescheduleAppointmentByToken(client, token, parsed.data.startsAt);

    return NextResponse.json(result);
  });
}
