import { NextRequest, NextResponse } from "next/server";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { withApiHandler } from "@/modules/shared/api";
import { ApiError } from "@/modules/shared/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { cancelAppointmentByToken } from "@/modules/scheduling/service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return withApiHandler("appointment.cancel", async () => {
    const { token } = await params;

    const rl = await checkRateLimit("manage-write", clientIp(request), 5, 60);
    if (!rl.success) {
      throw new ApiError("RATE_LIMITED");
    }

    const client = createPublicSupabaseClient();
    const result = await cancelAppointmentByToken(client, token);

    return NextResponse.json(result);
  });
}
